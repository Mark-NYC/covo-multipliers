// supabase/functions/assessment-submit/index.ts
//
// CoVo Fivefold Stewardship Assessment — Submit & Score
//
// POST /functions/v1/assessment-submit
// Body: { session_id: string, resume_token: string }
//
// 1. Validate session ownership via resume_token hash
// 2. Verify all active items have a response
// 3. Load scoring rules server-side
// 4. Compute domain and construct scores
// 5. Apply shadow/caution flags
// 6. Store assessment_results (including rendered result copy)
// 7. Generate result_token and store its hash
// 8. Send confirmation email via Resend
// 9. Return result_token to client for redirect
//
// Scoring never runs in the browser. The result_token is the only
// artifact returned to the client; it unlocks a server-rendered result page.

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

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
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

// Scale maximums by format
const FORMAT_MAX: Record<string, number> = {
  AGR6: 6, FREQ6: 6, EX6: 6, SC4: 4, FC2: 2, FC3: 3,
};

const SCALE_LABEL: Record<string, string[]> = {
  AGR6: ["Strongly disagree","Disagree","Somewhat disagree","Somewhat agree","Agree","Strongly agree"],
  FREQ6: ["Never","Once or twice in the year","Monthly","Bi-weekly","Weekly","Weekly or more"],
  EX6: ["Cannot identify any example","I could name one with significant effort","I can identify one example clearly","I can identify more than one example","I can identify several examples","Others could readily confirm this"],
};

interface ScoringRule {
  pilot_id: string;
  domain_key: string;
  construct_key: string | null;
  evidence_label: string;
  reverse_keyed: boolean;
  weight: number;
  scoring_map?: Record<string, Record<string, number>>;
}

interface DomainScore {
  raw: number;
  weighted: number;
  item_count: number;
  evidence_counts: Record<string, number>;
  evidence_scores: Record<string, { score: number; item_count: number }>;
  construct_scores: Record<string, { raw: number; item_count: number }>;
}

function computeScore(
  responses: Array<{ pilot_id: string; response_raw: string; response_num: number | null }>,
  rules: ScoringRule[],
  itemFormats: Record<string, string>,
): {
  domain_scores: Record<string, DomainScore>;
  shadow_flags: Array<{ pilot_id: string; domain_key: string; note: string }>;
} {
  const responseMap = new Map(responses.map((r) => [r.pilot_id, r]));

  const domainScores: Record<string, DomainScore> = {};
  const shadowFlags: Array<{ pilot_id: string; domain_key: string; note: string }> = [];

  for (const rule of rules) {
    const resp = responseMap.get(rule.pilot_id);
    if (!resp) continue;

    const format = itemFormats[rule.pilot_id] ?? "AGR6";
    const max = FORMAT_MAX[format] ?? 6;

    let points = 0;

    if (rule.scoring_map) {
      // SC4/FC2/FC3: look up option key in scoring_map
      const optionScores = rule.scoring_map[resp.response_raw] ?? {};
      for (const [dk, pts] of Object.entries(optionScores)) {
        if (!domainScores[dk]) initDomain(domainScores, dk);
        domainScores[dk].raw += pts * (rule.weight ?? 1.0);
        domainScores[dk].weighted += pts * (rule.weight ?? 1.0);
        domainScores[dk].item_count += 1;
        domainScores[dk].evidence_counts[rule.evidence_label] =
          (domainScores[dk].evidence_counts[rule.evidence_label] ?? 0) + 1;
        if (rule.evidence_label !== 'F') {
          if (!domainScores[dk].evidence_scores[rule.evidence_label]) {
            domainScores[dk].evidence_scores[rule.evidence_label] = { score: 0, item_count: 0 };
          }
          domainScores[dk].evidence_scores[rule.evidence_label].score += pts * (rule.weight ?? 1.0);
          domainScores[dk].evidence_scores[rule.evidence_label].item_count += 1;
        }
      }
      continue;
    }

    // Scale item: parse numeric response
    const rawNum = resp.response_num ?? parseInt(resp.response_raw, 10);
    if (isNaN(rawNum)) continue;

    const scored = rule.reverse_keyed ? (max + 1) - rawNum : rawNum;
    points = scored * (rule.weight ?? 1.0);

    const dk = rule.domain_key;
    if (!domainScores[dk]) initDomain(domainScores, dk);

    domainScores[dk].raw += scored;
    domainScores[dk].weighted += points;
    domainScores[dk].item_count += 1;
    domainScores[dk].evidence_counts[rule.evidence_label] =
      (domainScores[dk].evidence_counts[rule.evidence_label] ?? 0) + 1;

    if (rule.construct_key) {
      if (!domainScores[dk].construct_scores[rule.construct_key]) {
        domainScores[dk].construct_scores[rule.construct_key] = { raw: 0, item_count: 0 };
      }
      domainScores[dk].construct_scores[rule.construct_key].raw += scored;
      domainScores[dk].construct_scores[rule.construct_key].item_count += 1;
    }

    if (rule.evidence_label !== 'F') {
      if (!domainScores[dk].evidence_scores[rule.evidence_label]) {
        domainScores[dk].evidence_scores[rule.evidence_label] = { score: 0, item_count: 0 };
      }
      domainScores[dk].evidence_scores[rule.evidence_label].score += points;
      domainScores[dk].evidence_scores[rule.evidence_label].item_count += 1;
    }

    // Shadow flag: if a shadow (F) item scores high after reverse-key, flag it
    if (rule.evidence_label === "F" && scored >= 5) {
      shadowFlags.push({
        pilot_id: rule.pilot_id,
        domain_key: dk,
        note: `One of your answers raised a caution flag in the ${dk} pattern. Hold that score more loosely and test it with people who know you.`,
      });
    }
  }

  return { domain_scores: domainScores, shadow_flags: shadowFlags };
}

function initDomain(map: Record<string, DomainScore>, dk: string) {
  map[dk] = { raw: 0, weighted: 0, item_count: 0, evidence_counts: {}, evidence_scores: {}, construct_scores: {} };
}

// Provisional band labels (not validated thresholds)
function bandLabel(weighted: number, itemCount: number): string {
  if (itemCount === 0) return "Insufficient data";
  const avg = weighted / itemCount;
  if (avg >= 4.5) return "Strong";
  if (avg >= 3.5) return "Moderate-high";
  if (avg >= 2.5) return "Moderate";
  if (avg >= 1.5) return "Moderate-low";
  return "Low";
}

function renderResultCopy(
  domainScores: Record<string, DomainScore>,
  firstName: string,
): Record<string, unknown> {
  const DOMAIN_LABELS: Record<string, string> = {
    prophetic: "Prophetic",
    evangelistic: "Evangelistic",
    shepherding: "Shepherding",
    teaching: "Teaching",
    apostolic_direction: "Apostolic Direction",
    apostolic_formation: "Apostolic Formation",
    apostolic_multiplying: "Apostolic Multiplying",
  };

  const ranked = Object.entries(domainScores)
    .filter(([dk]) => dk !== "cross_function")
    .map(([dk, score]) => ({
      domain_key: dk,
      label: DOMAIN_LABELS[dk] ?? dk,
      band: bandLabel(score.weighted, score.item_count),
      weighted: score.weighted,
      item_count: score.item_count,
      evidence_counts: score.evidence_counts,
    }))
    .sort((a, b) => b.weighted / Math.max(b.item_count, 1) - a.weighted / Math.max(a.item_count, 1));

  const top = ranked.slice(0, 2);
  const topLabels = top.map((d) => d.label).join(" and ");

  return {
    greeting: `${firstName}, here is a summary of your Fivefold Stewardship patterns based on your responses.`,
    pilot_disclaimer: "This is a pilot assessment that has not yet been tested enough to show how consistent its scores are or how well they reflect the patterns it aims to measure. The patterns below are based on what you reported about yourself. Use them for reflection — not as a final profile or identity label.",
    domain_summary: ranked,
    top_domains: topLabels,
    narrative_summary: ranked.length >= 2
      ? `Your answers show the strongest patterns in ${topLabels}. These reflect how you tend to see things and engage — not a fixed category or calling.`
      : "Insufficient data to generate a domain summary.",
    behavioral_note: `Some of your answers gave examples from your real ministry experience. Where those examples are present, they strengthen the pattern. Where they are absent or low, hold your scores in those areas with more caution.`,
    next_steps: [
      "Share these patterns with someone who knows your ministry context well. Ask whether they see the same things.",
      "Notice which descriptions feel like recognition — and which produce surprise or disagreement.",
      "Use these results to start a conversation, not to make a final decision.",
    ],
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function sendResultEmail(
  to: string,
  firstName: string,
  resultUrl: string,
): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "assessment@covomultipliers.com";

  if (!apiKey) {
    console.error("[assessment-submit] RESEND_API_KEY not set — skipping email");
    return null;
  }

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
            <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">Your assessment is complete</h1>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
              Thank you for completing the Fivefold Stewardship Assessment. Your results are ready.
            </p>
            <p style="margin:0 0 24px;font-size:13px;color:#666666;line-height:1.6;background:#f9fafb;padding:16px;border-radius:8px;border-left:3px solid #dcb55a;">
              This is a pilot assessment that has not yet been tested with enough people to prove its scores are reliable. Use your results to start a conversation — not to make a final decision about your calling or identity.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
              <tr>
                <td align="center">
                  <a href="${esc(resultUrl)}" style="display:inline-block;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
                    View My Results
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 12px;font-size:13px;color:#888888;line-height:1.5;">
              This link is unique to you. Save this email if you want to return to your results later.
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
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: [to],
        subject: "Your Fivefold Stewardship Assessment results are ready",
        html,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[assessment-submit] Resend error:", JSON.stringify(body));
      return null;
    }
    return (body as Record<string, unknown>).id as string ?? null;
  } catch (err) {
    console.error("[assessment-submit] Resend threw:", err);
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const { session_id, resume_token } = body;

  if (typeof session_id !== "string" || !isUuid(session_id)) {
    return json(400, { error: "A valid session_id is required." }, cors);
  }
  if (typeof resume_token !== "string" || resume_token.length < 32) {
    return json(400, { error: "A valid resume_token is required." }, cors);
  }

  const tokenHash = await sha256hex(resume_token);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Load session and verify token
  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .select("id, participant_id, version_id, status, resume_token_hash, item_order")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    return json(404, { error: "Session not found." }, cors);
  }
  if (session.resume_token_hash !== tokenHash) {
    return json(403, { error: "Invalid token." }, cors);
  }
  if (session.status === "scored") {
    // Already submitted — return existing result token
    const { data: existing } = await supabase
      .from("assessment_results")
      .select("result_token_hash")
      .eq("session_id", session_id)
      .single();
    return json(200, { already_submitted: true }, cors);
  }
  if (session.status !== "in_progress") {
    return json(400, { error: "This session cannot be submitted." }, cors);
  }

  // Load participant
  const { data: participant } = await supabase
    .from("participants")
    .select("id, email, first_name")
    .eq("id", session.participant_id)
    .single();

  if (!participant) return json(500, { error: "Participant not found." }, cors);

  // Load responses
  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("pilot_id, response_raw, response_num")
    .eq("session_id", session_id);

  if (!responses) return json(500, { error: "Could not load responses." }, cors);

  // Load active items to verify completeness
  const { data: items } = await supabase
    .from("assessment_items")
    .select("id, pilot_id, response_format")
    .eq("version_id", session.version_id)
    .eq("is_active", true);

  if (!items) return json(500, { error: "Could not load items." }, cors);

  const respondedIds = new Set(responses.map((r) => r.pilot_id));
  const missing = items.filter((i) => !respondedIds.has(i.pilot_id));

  if (missing.length > 0) {
    console.warn(`[assessment-submit] ${missing.length} items missing responses`);
    return json(400, {
      error: "Some questions have not been answered. Please complete all questions before submitting.",
      missing_count: missing.length,
    }, cors);
  }

  // Load scoring rules
  const { data: rulesRow } = await supabase
    .from("assessment_scoring_rules")
    .select("rules, scoring_version")
    .eq("version_id", session.version_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!rulesRow) return json(500, { error: "Scoring rules not found." }, cors);

  const rules: ScoringRule[] = rulesRow.rules as ScoringRule[];
  const itemFormats: Record<string, string> = {};
  for (const item of items) itemFormats[item.pilot_id] = item.response_format;

  // Score
  const { domain_scores, shadow_flags } = computeScore(responses, rules, itemFormats);

  // Render result copy
  const resultCopy = renderResultCopy(domain_scores, participant.first_name);

  // Generate result token
  const resultToken = generateToken();
  const resultTokenHash = await sha256hex(resultToken);

  // Store result
  const { error: resultErr } = await supabase
    .from("assessment_results")
    .insert({
      session_id: session.id,
      participant_id: participant.id,
      version_id: session.version_id,
      result_token_hash: resultTokenHash,
      domain_scores,
      construct_scores: {},
      summary_flags: shadow_flags,
      result_copy: resultCopy,
      scoring_version: rulesRow.scoring_version,
    });

  if (resultErr) {
    console.error("[assessment-submit] result insert error:", resultErr);
    return json(500, { error: "Could not store results. Please try again." }, cors);
  }

  // Update session status
  await supabase
    .from("assessment_sessions")
    .update({ status: "scored", submitted_at: new Date().toISOString(), scored_at: new Date().toISOString() })
    .eq("id", session_id);

  // Send email
  const siteOrigin = Deno.env.get("SITE_ORIGIN") ?? "https://covomultipliers.com";
  const resultUrl = `${siteOrigin}/assessment/results.html?t=${resultToken}`;

  const msgId = await sendResultEmail(participant.email, participant.first_name, resultUrl);

  if (msgId) {
    await supabase
      .from("assessment_results")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("session_id", session_id);
  }

  console.log(`[assessment-submit] scored session=${session_id} email=${msgId ? "sent" : "failed"}`);

  return json(200, {
    success: true,
    result_token: resultToken,
    result_url: resultUrl,
  }, cors);
});
