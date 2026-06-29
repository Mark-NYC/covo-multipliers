// supabase/functions/disciple-maker-cfc-followup/index.ts
//
// Disciple Maker CFC Profile Follow-up Email (Day +1)
//
// POST /functions/v1/disciple-maker-cfc-followup
// Headers: x-admin-secret: <REMINDER_ADMIN_SECRET>
//
// Finds all sessions completed ~24 hours ago where cfc_followup_sent_at is null.
// Sends CFC profile email via Resend. Marks session with timestamp.
//
// ── Required secrets ────────────────────────────────────────────────────────
//   REMINDER_ADMIN_SECRET    — value compared against x-admin-secret header
//   RESEND_API_KEY           — from resend.com dashboard
//   RESEND_FROM_EMAIL        — verified sender address
//
// ── Auto-injected by Supabase ──────────────────────────────────────────────
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BATCH_SIZE = 50;
const HOURS_AFTER_COMPLETION = 24;
const LOOKBACK_HOURS = 2; // Only look at sessions completed within 24-26 hours

interface Session {
  id: string;
  email: string;
  first_name: string;
  results_token_hash: string;
}

interface SendEmailOptions {
  to: string;
  toName: string;
  resultsToken: string;
}

function jsonResp(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function sendCfcFollowupEmail({
  to,
  toName,
  resultsToken,
}: SendEmailOptions): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "results@covomultipliers.com";

  if (!apiKey) {
    console.warn("[cfc-followup] RESEND_API_KEY not set — skipping email");
    return false;
  }

  const cfcProfileUrl = `https://www.covomultipliers.com/disciple-maker/cfc-profile.html?r=${resultsToken}`;
  const whatsappUrl =
    "https://www.covomultipliers.com/join-whatsapp?utm_source=cfc_profile_email&utm_medium=email&utm_campaign=whatsapp_field_room";

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
            <td style="background:linear-gradient(135deg,#1b4d3e 0%,#2d6a4f 50%,#d4af37 100%);padding:40px 32px;border-radius:12px 12px 0 0;text-align:center;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.75);">
                Disciple Maker Assessment
              </p>
              <h1 style="margin:0;font-size:28px;font-weight:900;color:#ffffff;line-height:1.2;">
                Go Deeper with Your CFC Profile
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 32px;border:1px solid #e5e7eb;border-top:none;">

              <p style="margin:0 0 24px;font-size:16px;color:#1a1a1a;font-weight:600;">Hey ${escapeHtml(toName)},</p>

              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.7;">
                Yesterday you completed the Disciple Maker Assessment. Today, we want to help you go deeper.
              </p>

              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.7;">
                Your <strong>CFC Profile</strong> is a coaching framework that shows you:
              </p>

              <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;color:#444444;line-height:1.8;">
                <li><strong>Commitment</strong> — Do you know your mission?</li>
                <li><strong>Focus</strong> — Are you taking active steps?</li>
                <li><strong>Consistency</strong> — Are you building weekly rhythms?</li>
              </ul>

              <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.7;">
                More importantly, it shows you <strong>exactly what to focus on first</strong> — a priority coaching recommendation just for you.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${cfcProfileUrl}" style="display:inline-block;background:#1b4d3e;color:#ffffff;padding:16px 48px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
                      View Your CFC Profile
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.7;">
                But here's the thing: you don't have to figure this out alone.
              </p>

              <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.7;">
                <strong>Growth doesn't happen through assessments. It happens alongside people who are practicing.</strong> Join the field room for weekly prompts, Follow &amp; Fish goals, lab invites, and real practitioners moving in the same direction.
              </p>

              <!-- WhatsApp CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${whatsappUrl}" style="display:inline-block;background:#25D366;color:#ffffff;padding:16px 48px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
                      Join the WhatsApp Field Room
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
              <p style="margin:0;font-size:13px;color:#999999;line-height:1.6;">
                — The Covo Multipliers Team<br />
                <a href="https://www.covomultipliers.com" style="color:#1b4d3e;text-decoration:none;font-weight:600;">covomultipliers.com</a>
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
        subject: "Your CFC Profile: Go Deeper with Your Coaching Framework",
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(
        `[cfc-followup] Resend API error status=${res.status}:`,
        JSON.stringify(resBody)
      );
      return false;
    }

    console.log(`[cfc-followup] Resend accepted email for ${to}`);
    return true;
  } catch (err) {
    console.error("[cfc-followup] fetch to Resend threw an exception:", err);
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed." });
  }

  // --- Auth ---
  const adminSecret = Deno.env.get("REMINDER_ADMIN_SECRET");
  const providedSecret = req.headers.get("x-admin-secret");

  if (!adminSecret || providedSecret !== adminSecret) {
    console.warn("[cfc-followup] unauthorized — missing or invalid x-admin-secret");
    return jsonResp(401, { error: "Unauthorized." });
  }

  // --- Setup Supabase client ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // --- Find eligible sessions ---
  // Sessions completed between 24 and 26 hours ago, where cfc_followup_sent_at is null
  const now = new Date();
  const hoursAgo = (hours: number) => {
    const d = new Date(now);
    d.setHours(d.getHours() - hours);
    return d.toISOString();
  };

  const completedAfter = hoursAgo(HOURS_AFTER_COMPLETION + LOOKBACK_HOURS);
  const completedBefore = hoursAgo(HOURS_AFTER_COMPLETION);

  console.log(
    `[cfc-followup] Looking for sessions completed between ${completedBefore} and ${completedAfter}`
  );

  const { data: sessions, error: selectErr } = await supabase
    .from("disciple_maker_sessions")
    .select("id, email, first_name, results_token_hash")
    .eq("status", "completed")
    .is("cfc_followup_sent_at", null)
    .gte("completed_at", completedAfter)
    .lte("completed_at", completedBefore)
    .limit(BATCH_SIZE);

  if (selectErr) {
    console.error("[cfc-followup] query error:", selectErr);
    return jsonResp(500, { error: "Database query failed." });
  }

  console.log(
    `[cfc-followup] Found ${sessions?.length ?? 0} eligible sessions`
  );

  if (!sessions || sessions.length === 0) {
    return jsonResp(200, {
      mode: "production",
      sent: 0,
      message: "No eligible sessions found.",
    });
  }

  // --- Send emails ---
  let sentCount = 0;
  const failedSessions: string[] = [];

  for (const session of sessions as Session[]) {
    console.log(`[cfc-followup] Processing session ${session.id}`);

    // Send email
    const emailSent = await sendCfcFollowupEmail({
      to: session.email,
      toName: session.first_name,
      resultsToken: session.results_token_hash,
    });

    if (!emailSent) {
      console.error(`[cfc-followup] Email failed for session ${session.id}`);
      failedSessions.push(session.id);
      continue;
    }

    // Mark as sent in database
    const { error: updateErr } = await supabase
      .from("disciple_maker_sessions")
      .update({ cfc_followup_sent_at: new Date().toISOString() })
      .eq("id", session.id);

    if (updateErr) {
      console.error(
        `[cfc-followup] Failed to update session ${session.id}:`,
        updateErr
      );
      failedSessions.push(session.id);
      continue;
    }

    sentCount++;
    console.log(`[cfc-followup] Successfully sent and stamped session ${session.id}`);
  }

  return jsonResp(200, {
    mode: "production",
    sent: sentCount,
    failed: failedSessions.length,
    failed_sessions: failedSessions,
    total_processed: sessions.length,
  });
});
