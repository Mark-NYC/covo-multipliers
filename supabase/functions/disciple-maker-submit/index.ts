// supabase/functions/disciple-maker-submit/index.ts
//
// Disciple Maker Next Step — V2 (recognition-first)
//
// POST /functions/v1/disciple-maker-submit
// Body: {
//   session_id: string,
//   session_token: string,
//   answers: { [question_id]: string },   // behavioral answers
//   recognition_outcome: string,          // outcome the user confirmed
//   note?: string                         // optional free text
// }
//
// 1. Validate session + token
// 2. Store answers (diagnostic_answers jsonb) + confirmed outcome
// 3. Mark completed, mint results token
// 4. Email the person their next step
//
// There is NO scoring, no dimensions, no pathway. The user CONFIRMS their
// recognition on the client; the server trusts a known outcome key and falls
// back to a server-side re-derivation only if the key is unknown.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

// -----------------------------------------------------------------------------
// Outcome copy (server-authoritative for the email). Mirrors the client COPY in
// disciple-maker/results.html — keep the two in sync when editing.
// -----------------------------------------------------------------------------
const OUTCOMES: Record<string, { summary: string; step: string; title: string }> = {
  learning_not_practicing: {
    title: "You've learned more than you've practiced",
    summary:
      "You understand disciple making and want to act — but it hasn't become something you actually do yet. That's not a commitment problem; it just means you need real reps.",
    step: "Pick one person and one simple tool, and use it once before Sunday. Doing it badly still counts.",
  },
  intending_not_acting: {
    title: "The intention is real — it just hasn't hit your calendar",
    summary:
      "You believe in this and there are people around you, but disciple making is still living in the 'someday / whenever' part of your week. Good intentions don't reproduce; scheduled practice does.",
    step: "Put one 30-minute disciple-making block on your calendar this week, and tell someone it's there.",
  },
  no_relational_field: {
    title: "There's no one nearby yet to practice with",
    summary:
      "Before tools or techniques, disciple making needs people who aren't yet following Jesus in your everyday life. Right now that field is thin — and it's the most fixable thing on the list.",
    step: "Name five people you already see each week who aren't yet following Jesus, and share the list with a practitioner.",
  },
  started_but_stalled: {
    title: "You started, hit a wall, and quietly slowed down",
    summary:
      "You've actually tried — then it got awkward or unclear and momentum faded. That's not failure. It's the exact point where almost everyone needs a practitioner, not another resource.",
    step: "Tell one practitioner exactly where you got stuck, and ask them to help you take the next rep.",
  },
  practicing_alone: {
    title: "You're doing the work — mostly by yourself",
    summary:
      "You're practicing, following up, and staying at it. What multiplies your impact now isn't more effort — it's feedback and people moving in the same direction.",
    step: "Bring one real situation to a room of practitioners this week, and ask for one piece of coaching.",
  },
  reproducing_widen: {
    title: "This is becoming a lifestyle — the next step isn't more input",
    summary:
      "You're practicing consistently, following up, and someone is helping you. Your next step is to widen: help someone else start, and keep sharpening with other practitioners.",
    step: "Invite one person you're discipling to try leading the next step while you watch and coach.",
  },
};

const VALID_OUTCOMES = new Set(Object.keys(OUTCOMES));

// Minimal server-side re-derivation (mirror of questions.js scoreOutcomes) used
// only when the client sends an unknown/absent outcome key.
function deriveOutcome(a: Record<string, string>): string {
  const s: Record<string, number> = {
    learning_not_practicing: 0, intending_not_acting: 0, no_relational_field: 0,
    started_but_stalled: 0, practicing_alone: 0, reproducing_widen: 0,
  };
  const hasField = ["several", "one_two"].includes(a.q2_field);
  const noField = ["not_really", "around_christians"].includes(a.q2_field);
  const practicing =
    ["this_week", "this_month"].includes(a.q1_recency) ||
    ["recently", "once_twice"].includes(a.q3_tool) ||
    a.q4_followup === "kept_meeting";

  if (noField) s.no_relational_field += 3;
  if (a.q4_followup === "no_one") s.no_relational_field += 1;
  if (a.q3_tool === "learned_not_used") s.learning_not_practicing += 2;
  if (a.q5_consume === "learning_more") s.learning_not_practicing += 2;
  if (["months", "longer"].includes(a.q1_recency) && a.q3_tool !== "recently") s.learning_not_practicing += 1;
  if (hasField && a.q6_rhythm === "whenever") s.intending_not_acting += 2;
  if (hasField && ["months", "longer"].includes(a.q1_recency) && !practicing) s.intending_not_acting += 2;
  if (a.q4_followup === "meant_to") s.intending_not_acting += 1;
  if (a.q7_stalled === "yes") s.started_but_stalled += 3;
  if (a.q7_stalled === "little") s.started_but_stalled += 1;
  if (a.q4_followup === "didnt_know" && practicing) s.started_but_stalled += 1;
  if (practicing && ["alone", "informal"].includes(a.q8_practitioner)) s.practicing_alone += 2;
  if (practicing && a.q6_rhythm === "sometimes") s.practicing_alone += 1;
  if (practicing && a.q8_practitioner === "yes" && a.q4_followup === "kept_meeting" && a.q6_rhythm === "consistently") s.reproducing_widen += 4;

  const ranked = Object.entries(s).sort((x, y) => y[1] - x[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "learning_not_practicing";
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

async function sendResultsEmail(opts: {
  to: string; toName: string; outcome: string; resultsToken: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "results@covomultipliers.com";
  if (!apiKey) {
    console.warn("[disciple-maker-submit] RESEND_API_KEY not set — skipping email");
    return false;
  }

  const o = OUTCOMES[opts.outcome] ?? OUTCOMES.learning_not_practicing;
  const resultsUrl = `https://www.covomultipliers.com/disciple-maker/results.html?r=${opts.resultsToken}`;
  const labUrl = "https://www.covomultipliers.com/?utm_source=dm_results_email&utm_medium=email&utm_campaign=apprenticeship#labs";

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
      <tr><td style="background:linear-gradient(135deg,#1b4d3e 0%,#2d6a4f 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;text-align:center;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.78);">Disciple Maker Next Step</p>
        <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;line-height:1.25;">${escapeHtml(o.title)}</h1>
      </td></tr>
      <tr><td style="background:#ffffff;padding:36px 32px;border:1px solid #e5e7eb;border-top:none;">
        <p style="margin:0 0 20px;font-size:16px;color:#1a1a1a;font-weight:600;">Hey ${escapeHtml(opts.toName)},</p>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.7;">${escapeHtml(o.summary)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px;"><tr>
          <td style="padding:18px 20px;background:#f0fdf9;border-left:4px solid #1b4d3e;border-radius:6px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#1b4d3e;">This week</p>
            <p style="margin:0;font-size:15px;color:#333;line-height:1.6;font-weight:600;">${escapeHtml(o.step)}</p>
          </td>
        </tr></table>
        <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.7;">You don't have to figure this out alone. The next step is to practice alongside people who are already doing it.</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 24px;"><tr><td align="center">
          <a href="${labUrl}" style="display:inline-block;background:#1b4d3e;color:#ffffff;padding:15px 44px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Practice With Other Disciple Makers</a>
        </td></tr></table>
        <p style="margin:0 0 28px;text-align:center;font-size:14px;"><a href="${resultsUrl}" style="color:#1b4d3e;text-decoration:none;font-weight:600;">Revisit your next step →</a></p>
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
      body: JSON.stringify({ from: `CoVo Multipliers <${from}>`, to: [opts.to], subject: "Your disciple-making next step", html }),
    });
    if (!res.ok) {
      console.error(`[disciple-maker-submit] Resend error status=${res.status}:`, JSON.stringify(await res.json().catch(() => ({}))));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[disciple-maker-submit] Resend threw:", err);
    return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid request." }, cors); }

  const { session_id, session_token, answers, recognition_outcome, note } = body;
  if (typeof session_id !== "string" || typeof session_token !== "string" || typeof answers !== "object" || answers === null) {
    return json(400, { error: "Invalid request parameters." }, cors);
  }

  const answerMap = answers as Record<string, string>;
  const outcome = typeof recognition_outcome === "string" && VALID_OUTCOMES.has(recognition_outcome)
    ? recognition_outcome
    : deriveOutcome(answerMap);
  const o = OUTCOMES[outcome];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: session, error: sessionErr } = await supabase
    .from("disciple_maker_sessions")
    .select("id, email, first_name, session_token_hash")
    .eq("id", session_id)
    .single();
  if (sessionErr || !session) return json(401, { error: "Invalid session." }, cors);

  if ((await sha256hex(session_token)) !== session.session_token_hash) {
    return json(401, { error: "Invalid token." }, cors);
  }

  const resultsToken = generateToken();
  const resultsTokenHash = await sha256hex(resultsToken);

  const { error: updateErr } = await supabase
    .from("disciple_maker_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      diagnostic_answers: answerMap,
      recognition_outcome: outcome,
      barrier_summary: o.summary,
      seven_day_step: o.step,
      note: typeof note === "string" ? note.slice(0, 500) : null,
      assessment_version: "v2",
      results_token_hash: resultsTokenHash,
    })
    .eq("id", session_id);
  if (updateErr) {
    console.error("[disciple-maker-submit] update error:", updateErr);
    return json(500, { error: "Could not complete session." }, cors);
  }

  // Log completion event (best-effort).
  await supabase.from("disciple_maker_events").insert({
    session_id, event: "completed", detail: { outcome },
  }).then(() => {}, () => {});

  // Email (non-fatal).
  await sendResultsEmail({ to: session.email, toName: session.first_name, outcome, resultsToken });

  return json(200, { results_token: resultsToken, recognition_outcome: outcome }, cors);
});
