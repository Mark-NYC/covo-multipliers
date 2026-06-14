// supabase/functions/assessment-resume/index.ts
//
// CoVo Fivefold Stewardship Assessment — Send Resume Link
//
// POST /functions/v1/assessment-resume
// Body: { email: string }
//
// Looks up the most recent in-progress session for this email and sends
// a resume link. If no in-progress session exists, returns a gentle message.
// Does not confirm whether the email exists (prevents enumeration).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// We do not store resume tokens plain — only their hashes.
// To send a resume link we need to generate a new token and update the hash.
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendResumeEmail(
  to: string,
  firstName: string,
  resumeUrl: string,
  responseCount: number,
  itemCount: number,
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "assessment@covomultipliers.com";
  if (!apiKey) return false;

  const pct = itemCount > 0 ? Math.round((responseCount / itemCount) * 100) : 0;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;">
        <tr>
          <td style="background:linear-gradient(135deg,#10281f 0%,#1b4d3e 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">Covo Multipliers</p>
            <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">Continue your assessment</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
              Here is your link to continue the Fivefold Stewardship Assessment.
              You have completed approximately ${pct}% (${responseCount} of ${itemCount} questions).
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${esc(resumeUrl)}" style="display:inline-block;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
                    Continue Assessment
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 12px;font-size:13px;color:#888888;line-height:1.5;">
              This link is unique to you. It will let you pick up where you left off.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;"/>
            <p style="margin:0;font-size:13px;color:#999999;">
              — The Covo Multipliers Team<br/>
              <a href="https://covomultipliers.com" style="color:#1b4d3e;text-decoration:none;">covomultipliers.com</a>
            </p>
          </td>
        </tr>
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
        to: [to],
        subject: "Continue your Fivefold Stewardship Assessment",
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const { email } = body;

  if (typeof email !== "string" || !isEmail(email)) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }

  const cleanEmail = email.trim().toLowerCase();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Gentle: always return 200 to prevent email enumeration
  const SUCCESS_MESSAGE = "If we have an in-progress assessment for this email address, we've sent a resume link. Check your inbox.";

  // Look up participant
  const { data: participant } = await supabase
    .from("participants")
    .select("id, first_name")
    .eq("email", cleanEmail)
    .single();

  if (!participant) {
    console.log(`[assessment-resume] no participant for email (not enumerable)`);
    return json(200, { message: SUCCESS_MESSAGE }, cors);
  }

  // Find most recent in-progress session
  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, version_id, item_order")
    .eq("participant_id", participant.id)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (!session) {
    console.log(`[assessment-resume] no in-progress session for participant ${participant.id}`);
    return json(200, { message: SUCCESS_MESSAGE }, cors);
  }

  // Generate new resume token (rotate it)
  const newToken = generateToken();
  const newHash = await sha256hex(newToken);

  await supabase
    .from("assessment_sessions")
    .update({
      resume_token_hash: newHash,
      resume_token_sent_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  // Get response count
  const { count } = await supabase
    .from("assessment_responses")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);

  const itemCount = (session.item_order as string[] ?? []).length;
  const siteOrigin = Deno.env.get("SITE_ORIGIN") ?? "https://covomultipliers.com";
  const resumeUrl = `${siteOrigin}/assessment/take.html?s=${session.id}&t=${newToken}`;

  await sendResumeEmail(
    cleanEmail,
    participant.first_name,
    resumeUrl,
    count ?? 0,
    itemCount,
  );

  console.log(`[assessment-resume] sent resume link for session=${session.id}`);

  return json(200, { message: SUCCESS_MESSAGE }, cors);
});
