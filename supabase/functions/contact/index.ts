// supabase/functions/contact/index.ts
//
// Covo Multipliers — Contact Form Edge Function
//
// POST /functions/v1/contact
// Body: { name, email, topic, message, website }
//
// 1. Honeypot check (website field)
// 2. Validate input
// 3. Rate-limit by IP (in-memory; see TODO below for persistent approach)
// 4. Insert contact_messages row with send_status = "pending"
// 5. Send email via Resend (reply-to = sender's email)
// 6. Update row to "sent" or "failed"
//
// Secrets (set with: supabase secrets set KEY=value)
//   RESEND_API_KEY        — from resend.com dashboard
//   CONTACT_TO_EMAIL      — admin inbox, e.g. mark@covomultipliers.com
//   CONTACT_FROM_EMAIL    — verified sender, e.g. team@covomultipliers.com
//   SUPABASE_URL          — injected automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — injected automatically by Supabase
//
// Deploy: supabase functions deploy contact --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
  "https://mark-nyc.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
]);

const VALID_TOPICS = new Set([
  "Question about Covo Multipliers",
  "Upcoming Lab",
  "Immersion",
  "Other",
]);

// TODO: Replace with DB-based rate limiting (e.g. a rate_limit table with ip, window_start,
// count columns + RLS disabled + a cron to clean old rows) for production-grade protection.
// This in-memory map is best-effort: it resets on cold starts and is per-isolate, so it
// only protects within a single warm instance.
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5; // submissions per IP per window

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

function getClientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    null
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." }, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { success: false, error: "Invalid request." }, cors);
  }

  const { name, email, topic, message, website } = body;

  // Honeypot: filled = bot; return success without doing anything
  if (typeof website === "string" && website.trim().length > 0) {
    return json(200, { success: true }, cors);
  }

  // Validation
  const nameStr = typeof name === "string" ? name.trim() : "";
  if (nameStr.length < 2 || nameStr.length > 100) {
    return json(400, { success: false, error: "Please enter your full name (2–100 characters)." }, cors);
  }

  const emailStr = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (emailStr.length > 254 || !isEmail(emailStr)) {
    return json(400, { success: false, error: "Please enter a valid email address." }, cors);
  }

  const topicStr = typeof topic === "string" ? topic.trim() : "";
  if (!VALID_TOPICS.has(topicStr)) {
    return json(400, { success: false, error: "Please select a valid topic." }, cors);
  }

  const messageStr = typeof message === "string" ? message.trim() : "";
  if (messageStr.length < 5 || messageStr.length > 3000) {
    return json(400, { success: false, error: "Please enter a message (5–3000 characters)." }, cors);
  }

  // Rate limiting (soft-success to avoid revealing the block)
  const ip = getClientIp(req);
  if (ip !== null && !checkRateLimit(ip)) {
    return json(200, { success: true }, cors);
  }

  const userAgent = req.headers.get("user-agent") ?? null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Insert with pending status before attempting to send
  const { data: record, error: insertError } = await supabase
    .from("contact_messages")
    .insert({
      name: nameStr,
      email: emailStr,
      topic: topicStr,
      message: messageStr,
      user_agent: userAgent,
      ip_address: ip,
      send_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !record) {
    console.error("DB insert failed:", insertError);
    return json(500, { success: false, error: "Something went wrong. Please try again." }, cors);
  }

  const rowId = record.id as string;

  // Send email via Resend
  const result = await sendEmail({ name: nameStr, email: emailStr, topic: topicStr, message: messageStr });

  if (!result.ok) {
    await supabase
      .from("contact_messages")
      .update({ send_status: "failed", error_message: result.error })
      .eq("id", rowId);
    return json(500, { success: false, error: "Failed to send message. Please try again." }, cors);
  }

  await supabase
    .from("contact_messages")
    .update({ send_status: "sent", resend_message_id: result.messageId })
    .eq("id", rowId);

  return json(200, { success: true }, cors);
});

async function sendEmail({
  name,
  email,
  topic,
  message,
}: {
  name: string;
  email: string;
  topic: string;
  message: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to     = Deno.env.get("CONTACT_TO_EMAIL") ?? "";
  const from   = Deno.env.get("CONTACT_FROM_EMAIL") ?? "team@covomultipliers.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  if (!to) {
    console.error("CONTACT_TO_EMAIL not set");
    return { ok: false, error: "CONTACT_TO_EMAIL not configured" };
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
              <h1 style="margin:0;font-size:22px;font-weight:900;color:#ffffff;line-height:1.2;">
                New Contact Message
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;font-size:15px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;width:80px;white-space:nowrap;">From</td>
                  <td style="padding:11px 14px;color:#1a1a1a;">${esc(name)}</td>
                </tr>
                <tr>
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Email</td>
                  <td style="padding:11px 14px;color:#1a1a1a;"><a href="mailto:${esc(email)}" style="color:#1b4d3e;">${esc(email)}</a></td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Topic</td>
                  <td style="padding:11px 14px;color:#1a1a1a;">${esc(topic)}</td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#245c4a;">Message</p>
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;font-size:15px;color:#1a1a1a;line-height:1.7;white-space:pre-wrap;">${esc(message)}</div>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
              <p style="margin:0;font-size:13px;color:#999999;">
                Reply directly to this email to respond to ${esc(name)}.<br />
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
        from:     `Covo Multipliers <${from}>`,
        to:       [to],
        reply_to: email,
        subject:  `New Covo Contact: ${topic}`,
        html,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Resend error ${res.status}:`, errorText);
      return { ok: false, error: `Resend HTTP ${res.status}` };
    }

    const data = await res.json();
    console.log(`Contact email sent to ${to} (reply-to: ${email}), Resend id: ${data.id}`);
    return { ok: true, messageId: data.id };
  } catch (err) {
    console.error("Email send failed:", err);
    return { ok: false, error: String(err) };
  }
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
