/**
 * Covo Multipliers — Event Registration Edge Function
 * supabase/functions/register/index.ts
 *
 * Flow:
 *   1. Validate POST body (event_id, name, email)
 *   2. Call register_for_event() Postgres RPC (handles capacity + deduplication atomically)
 *   3. On success, send confirmation email via Resend
 *   4. Mark confirmation_sent_at on the registration row
 *   5. Return a clean JSON response
 *
 * Environment variables (see README for setup):
 *   SUPABASE_URL             — auto-injected by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 *   RESEND_API_KEY           — set manually via: supabase secrets set RESEND_API_KEY=...
 *   RESEND_FROM_EMAIL        — set manually, must be a Resend-verified address/domain
 *   SITE_ORIGIN              — your GitHub Pages URL, used to restrict CORS
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// -------------------------------------------------------
// CORS
// Restrict SITE_ORIGIN in production to your GitHub Pages
// domain, e.g. "https://mark-nyc.github.io" or your custom
// domain. Falls back to "*" if the env var is not set.
// -------------------------------------------------------
const ALLOWED_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// -------------------------------------------------------
// Types
// -------------------------------------------------------
interface RequestBody {
  event_id?: unknown;
  name?: unknown;
  email?: unknown;
}

interface RpcResult {
  success: boolean;
  error?: string;
  registration_id?: string;
  event_title?: string;
  event_date?: string;
  zoom_link?: string | null;
  seats_remaining?: number;
}

// -------------------------------------------------------
// Handler
// -------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed.");
  }

  // --- 1. Parse body ---
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const { event_id, name, email } = body;

  // --- 2. Validate ---
  if (!event_id || typeof event_id !== "string" || !isUuid(event_id)) {
    return errorResponse(400, "A valid event_id is required.");
  }
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return errorResponse(400, "Please enter your full name.");
  }
  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return errorResponse(400, "Please enter a valid email address.");
  }

  // --- 3. Supabase admin client (service role bypasses RLS) ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- 4. Call the Postgres registration function ---
  // register_for_event() handles:
  //   - Row-level locking to prevent overselling
  //   - Duplicate email check
  //   - Capacity enforcement
  //   - Returns event details needed for the confirmation email
  const { data: result, error: rpcError } = await supabase.rpc(
    "register_for_event",
    {
      p_event_id: event_id,
      p_name: name.trim(),
      p_email: email.toLowerCase().trim(),
    },
  ) as { data: RpcResult | null; error: unknown };

  if (rpcError) {
    console.error("[register] RPC error:", rpcError);
    return errorResponse(500, "Registration failed. Please try again.");
  }

  // --- 5. Handle clean failure cases returned by the RPC ---
  if (!result || !result.success) {
    switch (result?.error) {
      case "already_registered":
        return errorResponse(
          409,
          "This email address is already registered for this event.",
        );
      case "event_full":
        return errorResponse(
          409,
          "This event is full. No seats are remaining.",
        );
      case "event_not_found":
        return errorResponse(
          404,
          "This event could not be found or is no longer available.",
        );
      default:
        console.error("[register] Unexpected RPC result:", result);
        return errorResponse(500, "Registration failed. Please try again.");
    }
  }

  // --- 6. Send confirmation email ---
  const emailSent = await sendConfirmationEmail({
    to: email.trim(),
    name: name.trim(),
    eventTitle: result.event_title!,
    eventDate: result.event_date!,
    zoomLink: result.zoom_link ?? null,
  });

  // --- 7. Mark confirmation sent (best-effort — don't fail the request if this errors) ---
  if (emailSent && result.registration_id) {
    const { error: updateError } = await supabase
      .from("registrations")
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", result.registration_id);

    if (updateError) {
      console.warn("[register] Could not update confirmation_sent_at:", updateError);
    }
  }

  // --- 8. Return success ---
  return jsonResponse(200, {
    success: true,
    message: "You're registered! Check your inbox for a confirmation email.",
    seats_remaining: result.seats_remaining ?? null,
  });
});

// -------------------------------------------------------
// Confirmation email via Resend
// Uses plain fetch — no SDK dependency.
// -------------------------------------------------------
async function sendConfirmationEmail({
  to,
  name,
  eventTitle,
  eventDate,
  zoomLink,
}: {
  to: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  zoomLink: string | null;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ??
    "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not set. Skipping email.");
    return false;
  }

  const formattedDate = formatEventDate(eventDate);
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(eventTitle);

  const zoomBlock = zoomLink
    ? `
      <tr>
        <td style="padding:10px 14px; font-weight:600; color:#245c4a; vertical-align:top; width:100px;">Zoom Link</td>
        <td style="padding:10px 14px;">
          <a href="${escapeHtml(zoomLink)}" style="color:#1b4d3e; font-weight:600;">
            Join the meeting
          </a>
        </td>
      </tr>`
    : `
      <tr>
        <td style="padding:10px 14px; font-weight:600; color:#245c4a;">Zoom Link</td>
        <td style="padding:10px 14px; color:#666;">
          You will receive the Zoom link closer to the event date.
        </td>
      </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10281f,#1b4d3e,#9f7a2f); padding:36px 32px; border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px; font-size:0.8rem; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.7);">
                Covo Multipliers Labs
              </p>
              <h1 style="margin:0; font-size:1.6rem; font-weight:900; color:#ffffff; line-height:1.2;">
                You're registered!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff; padding:32px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 12px 12px;">
              <p style="margin:0 0 20px; font-size:1rem; color:#1a1a1a;">
                Hi ${safeName},
              </p>
              <p style="margin:0 0 24px; font-size:1rem; color:#444; line-height:1.6;">
                You're confirmed for the upcoming Covo Multipliers Lab. Save the details below and we'll see you there.
              </p>

              <!-- Event details table -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:separate; overflow:hidden; margin-bottom:28px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 14px; font-weight:600; color:#245c4a; vertical-align:top; width:100px;">Event</td>
                  <td style="padding:10px 14px; color:#1a1a1a; font-weight:600;">${safeTitle}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px; font-weight:600; color:#245c4a;">Date</td>
                  <td style="padding:10px 14px; color:#1a1a1a;">${formattedDate}</td>
                </tr>
                ${zoomBlock}
              </table>

              <p style="margin:0 0 8px; font-size:0.95rem; color:#555; line-height:1.6;">
                If you have any questions before the lab, reply to this email.
              </p>
              <p style="margin:0; font-size:0.95rem; color:#555;">
                Looking forward to seeing you there.
              </p>

              <!-- Signature -->
              <hr style="border:none; border-top:1px solid #e5e7eb; margin:28px 0;">
              <p style="margin:0; font-size:0.875rem; color:#888;">
                — The Covo Multipliers Team<br>
                <a href="https://covomultipliers.com" style="color:#1b4d3e;">covomultipliers.com</a>
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
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${fromEmail}>`,
        to: [to],
        subject: `You're registered — ${eventTitle}`,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend returned ${res.status}:`, body);
      return false;
    }

    console.log(`[email] Confirmation sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[email] Fetch to Resend failed:", err);
    return false;
  }
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

/** Build a JSON response with CORS headers attached. */
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Build a JSON error response. */
function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { success: false, error: message });
}

/** Basic email format check. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** UUID v4 format check — guards against injecting arbitrary strings into the RPC. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(value);
}

/**
 * Format a UTC ISO timestamp for display in the email.
 * Outputs: "Tuesday, May 20, 2025 at 7:00 PM EDT"
 */
function formatEventDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
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
    return isoString; // fallback to raw string if parsing fails
  }
}

/** Minimal HTML escaping for interpolating user/DB strings into email HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
