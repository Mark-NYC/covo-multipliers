// supabase/functions/register/index.ts
//
// Covo Multipliers — Event Registration Edge Function
//
// POST /functions/v1/register
// Body: { event_id: string, name: string, email: string }
//
// 1. Validate input
// 2. Call register_for_event() Postgres RPC (atomic — handles capacity + deduplication)
// 3. On success, send branded confirmation email via Resend
// 4. Mark registrations.confirmation_sent_at
// 5. Return JSON
//
// Secrets (set with: supabase secrets set KEY=value)
//   RESEND_API_KEY     — from resend.com dashboard
//   RESEND_FROM_EMAIL  — verified sender, e.g. labs@covomultipliers.com
//   SITE_ORIGIN        — https://covomultipliers.com (used for CORS)
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
  event_title?: string;
  event_date?: string;
  zoom_link?: string | null;
  seats_remaining?: number;
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
  const { data, error: rpcError } = await supabase.rpc("register_for_event", {
    p_event_id: event_id,
    p_name: cleanName,
    p_email: cleanEmail,
  });

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return json(500, { error: "Registration failed. Please try again." }, cors);
  }

  const result = data as RpcResult;

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
        console.error("Unexpected RPC result:", result);
        return json(500, { error: "Registration failed. Please try again." }, cors);
    }
  }

  // Send confirmation email. Non-fatal — a failed email does not roll back
  // the registration. The row is already committed in the RPC transaction.
  const sent = await sendEmail({
    to: cleanEmail,
    toName: cleanName,
    eventTitle: result.event_title!,
    eventDate: result.event_date!,
    zoomLink: result.zoom_link ?? null,
  });

  // Record that the email was sent (best-effort)
  if (sent && result.registration_id) {
    const { error: updateErr } = await supabase
      .from("registrations")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", result.registration_id);

    if (updateErr) {
      console.warn("Could not update confirmation_sent_at:", updateErr);
    }
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
// ---------------------------------------------------------------------------
async function sendEmail({
  to,
  toName,
  eventTitle,
  eventDate,
  zoomLink,
}: {
  to: string;
  toName: string;
  eventTitle: string;
  eventDate: string;
  zoomLink: string | null;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY not set — skipping confirmation email.");
    return false;
  }

  const zoomRow = zoomLink
    ? `<tr>
        <td class="label">Zoom Link</td>
        <td><a href="${esc(zoomLink)}" style="color:#1b4d3e;font-weight:600;">Join the meeting</a></td>
      </tr>`
    : `<tr>
        <td class="label">Zoom Link</td>
        <td style="color:#666666;">You will receive the Zoom link closer to the event date.</td>
      </tr>`;

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
                You're confirmed for the upcoming Covo Multipliers Lab.
                Here are your details — save this email so you have everything in one place.
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
                ${zoomRow}
              </table>

              <p style="margin:0 0 12px;font-size:15px;color:#555555;line-height:1.65;">
                If you have any questions before the lab, just reply to this email.
              </p>
              <p style="margin:0;font-size:15px;color:#555555;">
                Looking forward to seeing you there.
              </p>

              <!-- Signature -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
              <p style="margin:0;font-size:13px;color:#999999;">
                — The Covo Multipliers Team<br />
                <a href="https://covomultipliers.com" style="color:#1b4d3e;text-decoration:none;">covomultipliers.com</a>
              </p>

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

    if (!res.ok) {
      console.error(`Resend error ${res.status}:`, await res.text());
      return false;
    }

    console.log(`Confirmation email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
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

/** Escape user/DB-sourced strings before interpolating into email HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
