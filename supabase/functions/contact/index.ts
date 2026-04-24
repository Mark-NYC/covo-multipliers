// supabase/functions/contact/index.ts
//
// Covo Multipliers — Contact Form Edge Function
//
// POST /functions/v1/contact
// Body: { name: string, email: string, topic: string, message: string }
//
// 1. Validate input
// 2. Send email to admin via Resend (reply-to set to sender's email)
// 3. Return { success: true }
//
// Secrets (set with: supabase secrets set KEY=value)
//   RESEND_API_KEY        — from resend.com dashboard
//   CONTACT_TO_EMAIL      — admin inbox, e.g. mark.a.goering@gmail.com
//   CONTACT_FROM_EMAIL    — verified sender, e.g. team@covomultipliers.com
//
// Deploy: supabase functions deploy contact --no-verify-jwt

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
  "https://mark-nyc.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
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

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const { name, email, topic, message } = body;

  if (typeof name !== "string" || name.trim().length < 2) {
    return json(400, { error: "Please enter your full name." }, cors);
  }
  if (typeof email !== "string" || !isEmail(email)) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }
  if (typeof topic !== "string" || topic.trim().length === 0) {
    return json(400, { error: "Please select a topic." }, cors);
  }
  if (typeof message !== "string" || message.trim().length < 5) {
    return json(400, { error: "Please enter a message." }, cors);
  }

  const cleanName    = name.trim();
  const cleanEmail   = email.trim().toLowerCase();
  const cleanTopic   = topic.trim();
  const cleanMessage = message.trim();

  const sent = await sendEmail({ name: cleanName, email: cleanEmail, topic: cleanTopic, message: cleanMessage });

  if (!sent) {
    return json(500, { error: "Failed to send message. Please try again." }, cors);
  }

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
}): Promise<boolean> {
  const apiKey  = Deno.env.get("RESEND_API_KEY");
  const to      = Deno.env.get("CONTACT_TO_EMAIL") ?? "mark.a.goering@gmail.com";
  const from    = Deno.env.get("CONTACT_FROM_EMAIL") ?? "team@covomultipliers.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY not set — cannot send contact email.");
    return false;
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
      console.error(`Resend error ${res.status}:`, await res.text());
      return false;
    }

    console.log(`Contact email forwarded to ${to} from ${email}`);
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
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
