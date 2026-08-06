// supabase/functions/disciple-maker-v2-followup/index.ts
//
// Disciple Maker — Day+1 obedience nudge
//
// POST /functions/v1/disciple-maker-cfc-followup
// Headers: x-admin-secret: <REMINDER_ADMIN_SECRET>
//
// (V2) Finds sessions completed ~24h ago that have a recognition_outcome and
// haven't been nudged yet, and sends a short "did you take your one step?" email
// that reinforces obedience over information. Legacy V1 sessions (no
// recognition_outcome) are skipped. The cfc_followup_sent_at column is reused as
// the idempotency stamp.
//
// Required secrets: REMINDER_ADMIN_SECRET, RESEND_API_KEY, RESEND_FROM_EMAIL
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 50;
const HOURS_AFTER_COMPLETION = 24;
const LOOKBACK_HOURS = 2; // sessions completed within a 24–26h window

interface Session {
  id: string;
  email: string;
  first_name: string;
  seven_day_step: string | null;
}

function jsonResp(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

async function sendNudge(to: string, toName: string, step: string | null): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "results@covomultipliers.com";
  if (!apiKey) {
    console.warn("[dm-nudge] RESEND_API_KEY not set — skipping");
    return false;
  }

  const labUrl = "https://www.covomultipliers.com/?utm_source=dm_nudge_email&utm_medium=email&utm_campaign=apprenticeship#labs";
  const stepBlock = step
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;"><tr>
         <td style="padding:18px 20px;background:#f0fdf9;border-left:4px solid #1b4d3e;border-radius:6px;">
           <p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#1b4d3e;">Your step</p>
           <p style="margin:0;font-size:15px;color:#333;line-height:1.6;font-weight:600;">${escapeHtml(step)}</p>
         </td></tr></table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
      <tr><td style="background:linear-gradient(135deg,#1b4d3e 0%,#2d6a4f 55%,#9f7a2f 100%);padding:34px 32px;border-radius:12px 12px 0 0;text-align:center;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.78);">Disciple Maker Next Step</p>
        <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;line-height:1.25;">Did you take your one step?</h1>
      </td></tr>
      <tr><td style="background:#ffffff;padding:36px 32px;border:1px solid #e5e7eb;border-top:none;">
        <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;font-weight:600;">Hey ${escapeHtml(toName)},</p>
        <p style="margin:0 0 22px;font-size:15px;color:#444;line-height:1.7;">Yesterday you found your next step. This is the only email that matters: <strong>did you do it — even a little, even badly?</strong></p>
        ${stepBlock}
        <p style="margin:0 0 22px;font-size:15px;color:#444;line-height:1.7;">If you did — reply and tell us who you talked to. If you didn't yet, that's okay. The point was never a perfect result, just one real rep. Do the smallest version of it today.</p>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7;">And you don't have to keep doing this alone. The fastest way forward is to practice alongside people who are already at it.</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;"><tr><td align="center">
          <a href="${labUrl}" style="display:inline-block;background:#1b4d3e;color:#ffffff;padding:15px 44px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Practice With Other Disciple Makers</a>
        </td></tr></table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="margin:0;font-size:13px;color:#999;line-height:1.6;">— The CoVo Multipliers Team<br />
          <a href="https://www.covomultipliers.com" style="color:#1b4d3e;text-decoration:none;font-weight:600;">covomultipliers.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `CoVo Multipliers <${from}>`, to: [to], subject: "Did you take your one step?", html }),
    });
    if (!res.ok) {
      console.error(`[dm-nudge] Resend error status=${res.status}:`, JSON.stringify(await res.json().catch(() => ({}))));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[dm-nudge] Resend threw:", err);
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return jsonResp(405, { error: "Method not allowed." });

  const adminSecret = Deno.env.get("REMINDER_ADMIN_SECRET");
  if (!adminSecret || req.headers.get("x-admin-secret") !== adminSecret) {
    return jsonResp(401, { error: "Unauthorized." });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const hoursAgo = (h: number) => { const d = new Date(now); d.setHours(d.getHours() - h); return d.toISOString(); };
  const completedAfter = hoursAgo(HOURS_AFTER_COMPLETION + LOOKBACK_HOURS);
  const completedBefore = hoursAgo(HOURS_AFTER_COMPLETION);

  const { data: sessions, error: selectErr } = await supabase
    .from("disciple_maker_sessions")
    .select("id, email, first_name, seven_day_step")
    .eq("status", "completed")
    .is("cfc_followup_sent_at", null)
    .not("recognition_outcome", "is", null) // V2 rows only — skip legacy V1
    .gte("completed_at", completedAfter)
    .lte("completed_at", completedBefore)
    .limit(BATCH_SIZE);

  if (selectErr) {
    console.error("[dm-nudge] query error:", selectErr);
    return jsonResp(500, { error: "Database query failed." });
  }
  if (!sessions || sessions.length === 0) {
    return jsonResp(200, { sent: 0, message: "No eligible sessions found." });
  }

  let sent = 0;
  const failed: string[] = [];
  for (const s of sessions as Session[]) {
    const okEmail = await sendNudge(s.email, s.first_name, s.seven_day_step);
    if (!okEmail) { failed.push(s.id); continue; }
    const { error: updErr } = await supabase
      .from("disciple_maker_sessions")
      .update({ cfc_followup_sent_at: new Date().toISOString() })
      .eq("id", s.id);
    if (updErr) { failed.push(s.id); continue; }
    sent++;
  }

  return jsonResp(200, { sent, failed: failed.length, failed_sessions: failed, total_processed: sessions.length });
});
