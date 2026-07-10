// supabase/functions/register/index.ts
//
// Covo Multipliers — Event Registration Edge Function
//
// POST /functions/v1/register
// Body: { event_id: string, name: string, email: string,
//         marketing_opt_in?: boolean, marketing_consent_copy?: string }
//
// 1. Validate input
// 2. Call register_for_event() Postgres RPC (atomic — handles capacity + deduplication)
// 3. On success, send branded confirmation email via Resend
// 4. Mark registrations.confirmation_sent_at
// 5. Return JSON
//
// Secrets (set with: supabase secrets set KEY=value)
//   RESEND_API_KEY      — from resend.com dashboard
//   RESEND_FROM_EMAIL   — verified sender, e.g. labs@covomultipliers.com
//   SITE_ORIGIN         — https://covomultipliers.com (used for CORS)
//   ADMIN_NOTIFY_EMAILS — optional, comma-separated admin addresses that get a
//                         notification email on each new signup. Unset = off.
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
  // Multiplying Disciples' homepage embeds the shared lab registration
  // widget (see embeds/lab-registration-widget.js) so the same
  // registration flow — same RPC, same capacity/dedup rules, same
  // confirmation email — can be submitted without leaving that site.
  "https://multiplyingdisciples.us",
  "https://www.multiplyingdisciples.us",
  // Pre-launch Vercel domain for Multiplying Disciples — remove once
  // multiplyingdisciples.us is live and this URL is no longer used for
  // testing the homepage registration widget.
  "https://multiplying-disciples.vercel.app",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RpcResult {
  success: boolean;
  error?: "event_not_found" | "already_registered" | "event_full";
  registration_id?: string;
  reactivated?: boolean;
  event_title?: string;
  event_date?: string;
  zoom_link?: string | null;
  seats_remaining?: number;
}

interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  latest_touch_at: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  first_utm_content: string | null;
  first_utm_term: string | null;
  first_landing_page: string | null;
  first_referrer: string | null;
  first_touch_at: string | null;
}

interface Consent {
  marketing_opt_in: boolean;
  marketing_consent_at: string | null;    // server-set; never client-supplied
  marketing_consent_copy: string | null;
}

function safeStr(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, maxLen) : null;
}

function safeTimestamp(v: unknown): string | null {
  const s = safeStr(v, 50);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractAttribution(body: Record<string, unknown>): Attribution {
  return {
    utm_source:    safeStr(body.utm_source, 100),
    utm_medium:    safeStr(body.utm_medium, 100),
    utm_campaign:  safeStr(body.utm_campaign, 200),
    utm_content:   safeStr(body.utm_content, 200),
    utm_term:      safeStr(body.utm_term, 200),
    landing_page:  safeStr(body.landing_page),
    referrer:      safeStr(body.referrer),
    latest_touch_at: safeTimestamp(body.latest_touch_at),
    first_utm_source:   safeStr(body.first_utm_source, 100),
    first_utm_medium:   safeStr(body.first_utm_medium, 100),
    first_utm_campaign: safeStr(body.first_utm_campaign, 200),
    first_utm_content:  safeStr(body.first_utm_content, 200),
    first_utm_term:     safeStr(body.first_utm_term, 200),
    first_landing_page: safeStr(body.first_landing_page),
    first_referrer:     safeStr(body.first_referrer),
    first_touch_at:     safeTimestamp(body.first_touch_at),
  };
}

// The exact consent disclosure shown to users on all lab registration pages.
// This constant is authoritative — the client-provided value is never trusted.
const MARKETING_CONSENT_COPY_V1 =
  "Yes, email me about future CoVo Multipliers labs, resources, and training. I can unsubscribe at any time.";

function extractConsent(body: Record<string, unknown>): Consent {
  // Accept marketing_opt_in only as a strict boolean true.
  // Strings like "true", numbers, or missing values are treated as false.
  // This prevents a malicious client from coercing consent via type confusion.
  const optIn = body.marketing_opt_in === true;

  if (!optIn) {
    return {
      marketing_opt_in: false,
      marketing_consent_at: null,
      marketing_consent_copy: null,
    };
  }

  return {
    marketing_opt_in: true,
    // Timestamp is always set server-side — the client timestamp is ignored.
    marketing_consent_at: new Date().toISOString(),
    // Consent copy is always server-owned — the client-provided value is ignored.
    marketing_consent_copy: MARKETING_CONSENT_COPY_V1,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, cors);
  }

  // Parse
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const { event_id, name, email } = body;
  const attribution = extractAttribution(body);
  const consent = extractConsent(body);
  const eventSlug = safeSlug(body.event_slug);

  // Validate
  if (typeof event_id !== "string" || !isUuid(event_id)) {
    return json(400, { error: "A valid event_id is required." }, cors);
  }
  if (typeof name !== "string" || name.trim().length < 2) {
    return json(400, { error: "Please enter your full name." }, cors);
  }
  if (typeof email !== "string" || !isEmail(email)) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  // Supabase admin client — service role bypasses RLS entirely
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Call the registration RPC.
  // register_for_event() uses SELECT ... FOR UPDATE to lock the event row,
  // preventing two simultaneous requests from both seeing an open seat.
  console.log(`[register] calling register_for_event RPC for event=${event_id} email=${cleanEmail}`);

  const { data, error: rpcError } = await supabase.rpc("register_for_event", {
    p_event_id: event_id,
    p_name: cleanName,
    p_email: cleanEmail,
  });

  if (rpcError) {
    console.error("[register] RPC error:", JSON.stringify(rpcError));
    return json(500, { error: "Registration failed. Please try again." }, cors);
  }

  const result = data as RpcResult;

  // Log the full RPC result so we can see its shape in production logs.
  // This catches cases where the RPC was modified and no longer returns registration_id.
  console.log("[register] RPC result:", JSON.stringify(result));

  if (!result.success) {
    switch (result.error) {
      case "event_not_found":
        return json(404, {
          error: "This event could not be found or is no longer available.",
        }, cors);
      case "already_registered":
        return json(409, {
          error: "This email address is already registered for this event.",
        }, cors);
      case "event_full":
        return json(409, {
          error: "This event is full. No seats are remaining.",
        }, cors);
      default:
        console.error("[register] unexpected RPC result:", JSON.stringify(result));
        return json(500, { error: "Registration failed. Please try again." }, cors);
    }
  }

  // Log that the registration row exists in the database at this point.
  console.log(`[register] registration inserted successfully, registration_id=${result.registration_id ?? "MISSING — RPC may not be returning this field"}`);

  // Phase 1: Write attribution and consent unconditionally.
  // Must succeed before we attempt to send a confirmation email.
  // If the RPC did not return registration_id, we cannot write anything — return 500.
  if (!result.registration_id) {
    console.error("[register] registration_id missing from RPC result — cannot save attribution or consent. Check that register_for_event() still returns registration_id.");
    return json(500, { error: "Registration was created but could not be completed. Please contact us." }, cors);
  }

  const { error: attrConsentErr } = await supabase
    .from("registrations")
    .update({ ...attribution, ...consent })
    .eq("id", result.registration_id);

  if (attrConsentErr) {
    console.error(`[register] attribution/consent update FAILED for registration_id=${result.registration_id}:`, JSON.stringify(attrConsentErr));
    return json(500, { error: "Registration was created but could not be completed. Please contact us." }, cors);
  }

  console.log(`[register] attribution and consent saved. opt_in=${consent.marketing_opt_in} consent_at=${consent.marketing_consent_at ?? "null"}`);

  // Fetch the canonical database slug for the branded join-lab redirect.
  // This is separate from the page-provided eventSlug (which may be a short slug used for calendar alias mapping).
  const { data: eventRow } = await supabase
    .from("events")
    .select("slug")
    .eq("id", event_id)
    .single();

  const dbSlug = eventRow?.slug ?? null;
  console.log(`[register] fetched canonical event slug for join-lab redirect: ${dbSlug ?? "MISSING"}`);

  // Phase 2: Send confirmation email. Non-fatal — failure does not undo saved consent.
  console.log(`[register] attempting confirmation email to=${cleanEmail} event="${result.event_title}"`);

  const resendMessageId = await sendEmail({
    to: cleanEmail,
    toName: cleanName,
    eventTitle: result.event_title!,
    eventDate: result.event_date!,
    zoomLink: result.zoom_link ?? null,
    pageSlug: eventSlug,
    dbSlug,
    originAttribution: attribution,
  });

  console.log(`[register] Resend result: ${resendMessageId ? `sent, id=${resendMessageId}` : "FAILED — email not sent"}`);

  // Phase 3: Record that the confirmation was sent.
  // This field is exclusively for the initial registration confirmation.
  // Reminder fields (reminder_week_sent_at, reminder_day_sent_at) are managed
  // by the reminder system and must never be set here.
  if (resendMessageId) {
    const { error: confirmErr } = await supabase
      .from("registrations")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", result.registration_id);

    if (confirmErr) {
      console.error("[register] confirmation_sent_at update FAILED:", JSON.stringify(confirmErr));
    } else {
      console.log("[register] confirmation_sent_at updated successfully");
    }
  } else {
    console.warn("[register] skipping confirmation_sent_at update — email was not sent");
  }

  // Phase 4: Admin signup notification. Fully non-blocking — any failure here
  // must never affect the registrant's response. Off unless ADMIN_NOTIFY_EMAILS
  // is set. Sent via Resend (the reliable path), never Supabase's mailer.
  try {
    const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (adminEmails.length > 0) {
      // Running total of active signups for this lab (includes the one just made).
      const { count: activeCount } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event_id)
        .eq("registration_status", "active");

      await sendAdminNotification({
        adminEmails,
        registrantName: cleanName,
        registrantEmail: cleanEmail,
        eventTitle: result.event_title ?? "(unknown lab)",
        eventDate: result.event_date ?? "",
        totalSignups: activeCount ?? null,
        reactivated: result.reactivated === true,
        firstSource: attribution.first_utm_source ?? attribution.utm_source,
        firstLandingPage: attribution.first_landing_page,
      });
    }
  } catch (err) {
    console.error("[register] admin notification failed (non-fatal):", err);
  }

  return json(200, {
    success: true,
    message: "You're registered! Check your inbox for a confirmation email.",
    seats_remaining: result.seats_remaining ?? null,
  }, cors);
});

// ---------------------------------------------------------------------------
// Confirmation email
// Plain fetch against the Resend REST API — no SDK dependency.
// Returns the Resend message ID on success, or null on failure.
// ---------------------------------------------------------------------------
async function sendEmail({
  to,
  toName,
  eventTitle,
  eventDate,
  zoomLink,
  pageSlug,
  dbSlug,
  originAttribution,
}: {
  to: string;
  toName: string;
  eventTitle: string;
  eventDate: string;
  zoomLink: string | null;
  pageSlug: string | null;
  dbSlug: string | null;
  originAttribution: Pick<Attribution, "first_utm_source" | "first_utm_medium" | "first_utm_campaign">;
}): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[register] RESEND_API_KEY is not set — skipping confirmation email. Set it with: supabase secrets set RESEND_API_KEY=...");
    return null;
  }

  const calendarUrl = pageSlug
    ? `https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar?event=${encodeURIComponent(pageSlug)}`
    : null;

  const joinLabUrl = dbSlug
    ? `https://www.covomultipliers.com/join-lab.html?event=${encodeURIComponent(dbSlug)}`
    : null;

  // CTA hierarchy: immediately after registration the main behavioral goal is
  // getting the lab onto the calendar, so Add to Calendar is the primary action.
  //   Calendar available → Add to Calendar (primary) ▸ quiet Zoom secondary line
  //   Calendar missing    → fall back to Join the Lab (Zoom) ▸ quiet fallback
  //   Neither             → "sent before the lab" note
  const zoomSecondaryLink = zoomLink && joinLabUrl
    ? `<p style="text-align:center;margin:14px 0 0;font-size:14px;line-height:20px;color:#888888;">
        When it's time, <a href="${esc(joinLabUrl)}" style="color:#1b4d3e;text-decoration:underline;font-weight:600;">join the lab here</a>.
      </p>`
    : "";

  const ctaSection = calendarUrl
    ? `<div style="text-align:center;margin:28px 0 0;">
        <a href="${esc(calendarUrl)}"
           style="display:inline-block;padding:15px 40px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
          Add to Calendar
        </a>
      </div>
      <p style="text-align:center;margin:12px 0 0;font-size:14px;line-height:20px;color:#888888;">
        Add it now so it doesn't slip — we'll remind you before we start.
      </p>
      ${zoomSecondaryLink}`
    : zoomLink && joinLabUrl
    ? `<div style="text-align:center;margin:28px 0 0;">
        <a href="${esc(joinLabUrl)}"
           style="display:inline-block;padding:15px 40px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
          Join the Lab
        </a>
      </div>`
    : `<p style="text-align:center;margin:28px 0 0;font-size:14px;line-height:20px;color:#888888;">
        The Zoom link will be sent before the lab.
      </p>`;

  // Inline styles are used deliberately — many email clients strip <style> blocks.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10281f 0%,#1b4d3e 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">
                Covo Multipliers Labs
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
                You're registered!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">

              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(toName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
                You're confirmed for <strong>${esc(eventTitle)}</strong>.
                This is a free 45-minute live lab — practical, simple, and built to use right away.
                The people who get the most out of it are the ones who show up live.
              </p>

              <!-- Event detail rows -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;font-size:15px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;width:110px;white-space:nowrap;">Event</td>
                  <td style="padding:11px 14px;color:#1a1a1a;font-weight:600;">${esc(eventTitle)}</td>
                </tr>
                <tr>
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Date</td>
                  <td style="padding:11px 14px;color:#1a1a1a;">${formatDate(eventDate)}</td>
                </tr>
              </table>

              ${ctaSection}

              <!-- WhatsApp Field Room secondary CTA -->
              <div style="margin:28px 0 0;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#15803d;">WhatsApp Field Room</p>
                <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.55;">Want to start practicing before the lab? Join the WhatsApp Field Room for prompts, reminders, and next steps with other disciple makers.</p>
                <a href="${esc(whatsAppJoinUrl(
                    { utm_source: "lab_confirmation_email", utm_medium: "email", utm_campaign: "whatsapp_field_room" },
                    originAttribution,
                  ))}"
                   style="font-size:14px;font-weight:600;color:#15803d;text-decoration:underline;">Join the WhatsApp Field Room →</a>
              </div>

              <p style="margin:28px 0 0;font-size:15px;color:#555555;">
                Looking forward to seeing you there.
              </p>

              ${renderTransactionalFooter()}

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: [to],
        subject: `You're registered — ${eventTitle}`,
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[register] Resend API error status=${res.status}:`, JSON.stringify(resBody));
      return null;
    }

    const messageId: string | null = (resBody as Record<string, unknown>)?.id as string ?? null;
    console.log(`[register] Resend accepted email, message_id=${messageId}`);
    return messageId;
  } catch (err) {
    console.error("[register] fetch to Resend threw an exception:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin signup notification
// Plain Resend REST call. Best-effort: returns void, swallows nothing upstream
// because the caller already wraps this in try/catch.
// ---------------------------------------------------------------------------
async function sendAdminNotification({
  adminEmails,
  registrantName,
  registrantEmail,
  eventTitle,
  eventDate,
  totalSignups,
  reactivated,
  firstSource,
  firstLandingPage,
}: {
  adminEmails: string[];
  registrantName: string;
  registrantEmail: string;
  eventTitle: string;
  eventDate: string;
  totalSignups: number | null;
  reactivated: boolean;
  firstSource: string | null;
  firstLandingPage: string | null;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[register] RESEND_API_KEY not set — skipping admin notification.");
    return;
  }

  const dashboardUrl = "https://www.covomultipliers.com/lab-admin.html";
  const totalLine = totalSignups != null ? `${totalSignups}` : "—";
  const kind = reactivated ? "Re-registration" : "New signup";

  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:8px 12px;font-weight:600;color:#245c4a;width:140px;">${esc(label)}</td>
       <td style="padding:8px 12px;color:#1a1a1a;">${value}</td>
     </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr><td style="background:#10281f;padding:22px 24px;border-radius:12px 12px 0 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Lab Admin</p>
          <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${esc(kind)}: ${esc(eventTitle)}</h1>
        </td></tr>
        <tr><td style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
            style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px;">
            ${row("Name", esc(registrantName))}
            ${row("Email", esc(registrantEmail))}
            ${row("Lab", esc(eventTitle))}
            ${row("Lab date", eventDate ? formatDate(eventDate) : "—")}
            ${row("Total signups", esc(totalLine))}
            ${row("First source", esc(firstSource ?? "direct / unknown"))}
            ${row("First page", esc(firstLandingPage ?? "—"))}
          </table>
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background:#1b4d3e;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Open the dashboard</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: adminEmails,
        subject: `${kind}: ${eventTitle} (${totalLine} total)`,
        html,
      }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.error(`[register] admin notification Resend error status=${res.status}:`, JSON.stringify(b));
    } else {
      console.log(`[register] admin notification sent to ${adminEmails.length} recipient(s)`);
    }
  } catch (err) {
    console.error("[register] admin notification fetch threw:", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize body to JSON and attach CORS headers. */
function json(status: number, body: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Sanitize an event slug — only lowercase letters, digits, and hyphens. */
function safeSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(s) ? s : null;
}

/** RFC 5322-ish email check — enough to catch obvious typos. */
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** UUID v4 check — prevents arbitrary strings reaching the RPC. */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(s);
}

/**
 * Format a UTC ISO timestamp for the confirmation email.
 * Example output: "Tuesday, May 20, 2025 at 7:00 PM EDT"
 */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });
  } catch {
    return iso; // fall back to raw string if the date is malformed
  }
}

function renderTransactionalFooter(): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      You're receiving this because you registered for this CoVo Multipliers Lab.
    </p>

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      CoVo Multipliers<br />
      14839 61st Road<br />
      Flushing, Queens, NYC
    </p>

    <p style="margin:0;font-size:12px;line-height:18px;color:#888888;">
      Questions? <a href="https://www.covomultipliers.com/contact.html" style="color:#1b4d3e;text-decoration:underline;">Contact us here</a>.
    </p>
  `;
}

/**
 * Build a /join-whatsapp URL carrying both the placement UTMs (where on the
 * site/email the link lives) and, when known, the visitor's origin_utm_*
 * (their original acquisition channel — Substack, YouTube, podcast, ...).
 */
function whatsAppJoinUrl(
  placement: Record<string, string>,
  origin: { first_utm_source: string | null; first_utm_medium: string | null; first_utm_campaign: string | null },
): string {
  const url = new URL("https://www.covomultipliers.com/join-whatsapp");
  for (const [k, v] of Object.entries(placement)) url.searchParams.set(k, v);
  if (origin.first_utm_source)   url.searchParams.set("origin_utm_source", origin.first_utm_source);
  if (origin.first_utm_medium)   url.searchParams.set("origin_utm_medium", origin.first_utm_medium);
  if (origin.first_utm_campaign) url.searchParams.set("origin_utm_campaign", origin.first_utm_campaign);
  return url.toString();
}

/** Escape user/DB-sourced strings before interpolating into email HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
