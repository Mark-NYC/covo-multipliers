// supabase/functions/disciple-maker-submit/index.ts
//
// POST /functions/v1/disciple-maker-submit
// Body: {
//   session_id: string,
//   session_token: string,
//   responses: { [question_id]: score }
// }
//
// 1. Validate session and token
// 2. Store responses in dedicated table
// 3. Calculate dimension scores, pathway, bottleneck
// 4. Mark session as completed
// 5. Generate results token
// 6. Return results token for redirect

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

// Dimension metadata for scoring
const DIMENSIONS = [
  "vision",
  "practice",
  "rhythm",
  "coachability",
  "everyday_mission",
];

const DIMENSION_QUESTIONS: Record<string, string[]> = {
  vision: ["v1", "v2", "v4", "v5"],
  practice: ["p1", "p2", "p3", "p4", "p5"],
  rhythm: ["r1", "r2", "r3", "r4"],
  coachability: ["c1", "c2", "c3", "c4"],
  everyday_mission: ["em1", "em2", "em3"],
};

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

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function scoreResponses(responses: Record<string, number>): {
  scores: Record<string, number>;
  strongest: string;
  lowest: string;
} {
  const scores: Record<string, number> = {};

  console.log("[scoreResponses] received responses:", JSON.stringify(responses));
  console.log("[scoreResponses] DIMENSIONS:", DIMENSIONS);
  console.log("[scoreResponses] DIMENSION_QUESTIONS:", JSON.stringify(DIMENSION_QUESTIONS));

  for (const dim of DIMENSIONS) {
    const qIds = DIMENSION_QUESTIONS[dim] || [];
    console.log(`[scoreResponses] scoring ${dim}: expecting questions ${qIds.join(', ')}`);

    const dimScores = qIds
      .map(qId => {
        const val = responses[qId];
        console.log(`  ${qId} = ${val}`);
        return val;
      })
      .filter(s => typeof s === 'number' && s > 0);

    scores[dim] = dimScores.length > 0
      ? dimScores.reduce((a, b) => a + b) / dimScores.length
      : 0;

    console.log(`[scoreResponses] ${dim} score: ${scores[dim]} (from ${dimScores.length} responses)`);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0][0];
  const lowest = sorted[sorted.length - 1][0];

  console.log("[scoreResponses] final scores:", JSON.stringify(scores));
  return { scores, strongest, lowest };
}

function identifyPathway(scores: Record<string, number>): string {
  // Conditions for each pathway
  if (scores.vision >= 3.5 && scores.practice <= 3 && scores.coachability >= 3.5) {
    return "explorer";
  }
  if (scores.practice >= 3.5 && scores.rhythm <= 3.5 && scores.coachability >= 3.5) {
    return "practitioner";
  }
  if (scores.practice >= 3.5 && scores.rhythm >= 3.5 && scores.everyday_mission >= 3.5) {
    return "multiplier";
  }
  // Fallback to catalyst
  return "catalyst";
}

function diagnoseBottleneck(scores: Record<string, number>, pathway: string): string {
  if (pathway === "explorer") {
    return "Moving from inspiration to first steps";
  }
  if (pathway === "practitioner") {
    return "Building weekly rhythms and consistency";
  }
  if (pathway === "multiplier") {
    return "Deepening disciple multiplication";
  }
  // catalyst pathway (beginner, just starting)
  return "Taking your first faithful step";
}

async function sendResultsEmail({
  to,
  toName,
  pathway,
  bottleneck,
  resultsToken,
}: {
  to: string;
  toName: string;
  pathway: string;
  bottleneck: string;
  resultsToken: string;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "results@covomultipliers.com";

  if (!apiKey) {
    console.warn("[disciple-maker-submit] RESEND_API_KEY not set — skipping email");
    return false;
  }

  // Map pathway to CFC-based identity name
  // (These map to the frontend identity types based on CFC framework)
  const pathwayNameMap: Record<string, string> = {
    multiplier: "Multiplying Influence",
    practitioner: "Faithful Practitioner",
    explorer: "Vision-Centered",
    catalyst: "Awakening Disciple",
  };
  const identityName = pathwayNameMap[pathway] || "Awakening Disciple";

  const resultsUrl = `https://www.covomultipliers.com/disciple-maker/results.html?r=${resultsToken}`;
  const whatsappUrl = "https://chat.whatsapp.com/HBFSp1fsSW79V3iqelxTWh?mode=gi_t?utm_source=discipleshipassessment&utm_medium=whatsapp";

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
                Your Results Are Ready
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 32px;border:1px solid #e5e7eb;border-top:none;">

              <p style="margin:0 0 24px;font-size:16px;color:#1a1a1a;font-weight:600;">Hey ${escapeHtml(toName)},</p>

              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.7;">
                You just completed the Disciple Maker Assessment. Your personal snapshot is ready to view.
              </p>

              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.7;">
                <strong>Your Assessment Identified:</strong><br />
                <span style="font-size:18px;color:#1b4d3e;font-weight:700;">${escapeHtml(identityName)}</span>
              </p>

              <p style="margin:0 0 28px;font-size:15px;color:#444444;line-height:1.7;">
                <strong>Your Focus Area:</strong><br />
                <span style="color:#555;">${escapeHtml(bottleneck)}</span>
              </p>

              <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.7;">
                Growth doesn't happen alone. Join the WhatsApp community where we practice together, celebrate stories, and take the next step together.
              </p>

              <!-- WhatsApp CTA (Prominent Button) -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${whatsappUrl}" style="display:inline-block;background:#25D366;color:#ffffff;padding:16px 48px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">
                      Join the WhatsApp Community
                    </a>
                  </td>
                </tr>
              </table>

              <!-- View Results Link -->
              <p style="margin:0 0 32px;text-align:center;font-size:15px;">
                <a href="${resultsUrl}" style="color:#1b4d3e;text-decoration:none;font-weight:600;">
                  View your full results →
                </a>
              </p>

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
        subject: "Your Disciple Maker Assessment Results",
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[disciple-maker-submit] Resend API error status=${res.status}:`, JSON.stringify(resBody));
      return false;
    }

    console.log(`[disciple-maker-submit] Resend accepted email`);
    return true;
  } catch (err) {
    console.error("[disciple-maker-submit] fetch to Resend threw an exception:", err);
    return false;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." }, cors);
  }

  const { session_id, session_token, responses } = body;

  if (typeof session_id !== "string" || typeof session_token !== "string" || typeof responses !== "object") {
    return json(400, { error: "Invalid request parameters." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Validate session
  const { data: session, error: sessionErr } = await supabase
    .from("disciple_maker_sessions")
    .select("id, email, first_name, session_token_hash")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-submit] session not found:", sessionErr);
    return json(401, { error: "Invalid session." }, cors);
  }

  console.log(`[disciple-maker-submit] session ${session_id} found`);

  // Validate token
  const tokenHash = await sha256hex(session_token);
  if (tokenHash !== session.session_token_hash) {
    console.error("[disciple-maker-submit] token mismatch");
    return json(401, { error: "Invalid token." }, cors);
  }

  console.log("[disciple-maker-submit] token validated");

  // Score responses and identify pathway
  const responseMap = responses as Record<string, number>;
  console.log("[disciple-maker-submit] responses received:", JSON.stringify(responseMap));
  const { scores, strongest, lowest } = scoreResponses(responseMap);
  const pathway = identifyPathway(scores);
  const bottleneck = diagnoseBottleneck(scores, pathway);

  // Store responses in dedicated table
  const responsesArray = Object.entries(responseMap).map(([questionId, score]) => {
    // Find dimension for this question
    let dimension = "";
    for (const [dim, qIds] of Object.entries(DIMENSION_QUESTIONS)) {
      if (qIds.includes(questionId)) {
        dimension = dim;
        break;
      }
    }
    return {
      session_id,
      question_id: questionId,
      dimension,
      score: typeof score === 'number' ? score : null,
    };
  });

  const { error: responseErr } = await supabase
    .from("disciple_maker_responses")
    .insert(responsesArray);

  if (responseErr) {
    console.error("[disciple-maker-submit] response insert error:", responseErr);
    return json(500, { error: "Could not save responses." }, cors);
  }

  // Generate results token
  const resultsToken = generateToken();
  const resultsTokenHash = await sha256hex(resultsToken);

  // Mark session as completed with results
  const { error: updateErr } = await supabase
    .from("disciple_maker_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      dimension_scores: scores,
      pathway,
      strongest_dimension: strongest,
      lowest_dimension: lowest,
      bottleneck,
      results_token_hash: resultsTokenHash,
    })
    .eq("id", session_id);

  if (updateErr) {
    console.error("[disciple-maker-submit] update error:", updateErr);
    return json(500, { error: "Could not complete session." }, cors);
  }

  console.log(`[disciple-maker-submit] session ${session_id} completed as ${pathway}`);

  // Send results email (non-fatal — session is already saved)
  const emailSent = await sendResultsEmail({
    to: session.email,
    toName: session.first_name,
    pathway,
    bottleneck,
    resultsToken,
  });

  if (emailSent) {
    console.log(`[disciple-maker-submit] results email sent for ${session_id}`);
  } else {
    console.warn(`[disciple-maker-submit] results email failed for ${session_id} — but assessment is saved`);
  }

  return json(200, { results_token: resultsToken }, cors);
});
