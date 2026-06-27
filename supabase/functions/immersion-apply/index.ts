// supabase/functions/immersion-apply/index.ts
//
// Covo Multipliers — Immersion Application Edge Function
//
// POST /functions/v1/immersion-apply
//
// 1. Validate required fields
// 2. Confirm immersion exists and is open
// 3. Insert application with status = 'submitted'
// 4. Send confirmation email via Resend
// 5. Update confirmation_sent_at
// 6. Return { success: true }
//
// Secrets (set with: supabase secrets set KEY=value)
//   RESEND_API_KEY     — from resend.com dashboard
//   RESEND_FROM_EMAIL  — verified sender, e.g. labs@covomultipliers.com
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
  const isLocalhost = origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) || isLocalhost
      ? origin
      : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ApplicationBody {
  immersion_id?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  city_state?: unknown;
  church_org?: unknown;
  team_status?: unknown;
  team_size?: unknown;
  why_coming?: unknown;
  hoping_to_learn?: unknown;
  prior_training?: unknown;
  lodging_acknowledged?: unknown;
  // attribution
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  utm_term?: unknown;
  landing_page?: unknown;
  referrer?: unknown;
  latest_touch_at?: unknown;
  first_utm_source?: unknown;
  first_utm_medium?: unknown;
  first_utm_campaign?: unknown;
  first_utm_content?: unknown;
  first_utm_term?: unknown;
  first_landing_page?: unknown;
  first_referrer?: unknown;
  first_touch_at?: unknown;
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

  // Parse body
  let body: ApplicationBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  // Validate required fields
  if (typeof body.immersion_id !== "string" || !isUuid(body.immersion_id)) {
    return json(400, { error: "A valid immersion_id is required." }, cors);
  }
  if (typeof body.name !== "string" || body.name.trim().length < 2) {
    return json(400, { error: "Please enter your full name." }, cors);
  }
  if (typeof body.email !== "string" || !isEmail(body.email)) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }
  if (body.lodging_acknowledged !== true) {
    return json(400, {
      error: "You must acknowledge the lodging information to apply.",
    }, cors);
  }

  // Sanitize
  const immersion_id = body.immersion_id;
  const name = body.name.trim();
  const email = body.email.trim().toLowerCase();

  // Supabase admin client — service role bypasses RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Confirm immersion exists and is open
  const { data: immersion, error: immersionErr } = await supabase
    .from("immersions")
    .select("id, title, status")
    .eq("id", immersion_id)
    .maybeSingle();

  if (immersionErr) {
    console.error("[immersion-apply] immersion lookup error:", JSON.stringify(immersionErr));
    return json(500, { error: "Could not verify immersion. Please try again." }, cors);
  }
  if (!immersion) {
    return json(404, { error: "This immersion could not be found." }, cors);
  }
  if (immersion.status !== "open") {
    return json(409, {
      error: "This immersion is no longer accepting applications.",
    }, cors);
  }

  // Insert application
  console.log(`[immersion-apply] inserting application for immersion_id=${immersion_id} email=${email}`);

  const { data: application, error: insertErr } = await supabase
    .from("immersion_applications")
    .insert({
      immersion_id,
      name,
      email,
      phone: strOrNull(body.phone),
      city_state: strOrNull(body.city_state),
      church_org: strOrNull(body.church_org),
      team_status: strOrNull(body.team_status),
      team_size: intOrNull(body.team_size),
      why_coming: strOrNull(body.why_coming),
      hoping_to_learn: strOrNull(body.hoping_to_learn),
      prior_training: strOrNull(body.prior_training),
      lodging_acknowledged: true,
      status: "submitted",
      // attribution
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
    })
    .select("id")
    .single();

  if (insertErr || !application) {
    console.error("[immersion-apply] insert error:", JSON.stringify(insertErr));
    return json(500, {
      error: "Could not save your application. Please try again.",
    }, cors);
  }

  console.log(`[immersion-apply] application inserted successfully, id=${application.id}`);

  // Send confirmation email (non-fatal — application is already saved)
  console.log(`[immersion-apply] attempting confirmation email to=${email} immersion="${immersion.title}"`);

  const resendMessageId = await sendConfirmationEmail({
    to: email,
    toName: name,
    immersionTitle: immersion.title,
  });

  console.log(`[immersion-apply] Resend result: ${resendMessageId ? `sent, id=${resendMessageId}` : "FAILED — email not sent"}`);

  // Update confirmation_sent_at only after a confirmed successful send.
  // This field is exclusively for the initial application confirmation.
  // It must never be touched by reminder or follow-up logic.
  if (resendMessageId) {
    console.log(`[immersion-apply] updating confirmation_sent_at for application id=${application.id}`);

    const { error: updateErr } = await supabase
      .from("immersion_applications")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", application.id);

    if (updateErr) {
      console.error("[immersion-apply] confirmation_sent_at update FAILED:", JSON.stringify(updateErr));
    } else {
      console.log("[immersion-apply] confirmation_sent_at updated successfully");
    }
  } else {
    console.warn("[immersion-apply] skipping confirmation_sent_at update — email was not sent");
  }

  return json(200, { success: true }, cors);
});

// ---------------------------------------------------------------------------
// Confirmation email
// Returns the Resend message ID on success, or null on failure.
// ---------------------------------------------------------------------------
async function sendConfirmationEmail({
  to,
  toName,
  immersionTitle,
}: {
  to: string;
  toName: string;
  immersionTitle: string;
}): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[immersion-apply] RESEND_API_KEY is not set — skipping confirmation email. Set it with: supabase secrets set RESEND_API_KEY=...");
    return null;
  }

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
                Covo Multipliers
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
                Application Received
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">

              <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;">Hey ${esc(toName)},</p>
              <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.65;">
                We received your application for <strong>${esc(immersionTitle)}</strong>.
                We'll follow up soon with next steps.
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.65;">
                In the meantime, if you have any questions just reply to this email.
              </p>

              <!-- WhatsApp Field Room secondary CTA -->
              <div style="margin:0 0 20px;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#15803d;">WhatsApp Field Room</p>
                <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.55;">While you wait to hear back, start practicing with other disciple makers. The lab is where we train. WhatsApp is where we practice.</p>
                <a href="https://www.covomultipliers.com/join-whatsapp?utm_source=immersion_email&utm_medium=email&utm_campaign=whatsapp_field_room"
                   style="font-size:14px;font-weight:600;color:#15803d;text-decoration:underline;">Join the WhatsApp Field Room →</a>
              </div>

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
        subject: "We received your Covo Immersion application",
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[immersion-apply] Resend API error status=${res.status}:`, JSON.stringify(resBody));
      return null;
    }

    const messageId: string | null = (resBody as Record<string, unknown>)?.id as string ?? null;
    console.log(`[immersion-apply] Resend accepted email, message_id=${messageId}`);
    return messageId;
  } catch (err) {
    console.error("[immersion-apply] fetch to Resend threw an exception:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(
  status: number,
  body: Record<string, unknown>,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(s);
}

/** Return a trimmed string or null for optional text fields. */
function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** Return an integer or null for optional numeric fields. */
function intOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }
  return null;
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
