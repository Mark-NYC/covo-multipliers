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

  for (const dim of DIMENSIONS) {
    const qIds = DIMENSION_QUESTIONS[dim] || [];
    const dimScores = qIds
      .map(qId => responses[qId])
      .filter(s => typeof s === 'number' && s > 0);

    scores[dim] = dimScores.length > 0
      ? dimScores.reduce((a, b) => a + b) / dimScores.length
      : 0;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0][0];
  const lowest = sorted[sorted.length - 1][0];

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
    return "Needs confidence to take first steps";
  }
  if (pathway === "practitioner") {
    return "Building weekly rhythms and consistency";
  }
  if (pathway === "multiplier") {
    return "Developing and multiplying leaders";
  }
  return "Scaling movement impact";
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
    .select("id, session_token_hash")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-submit] session not found:", sessionErr);
    return json(401, { error: "Invalid session." }, cors);
  }

  // Validate token
  const tokenHash = await sha256hex(session_token);
  if (tokenHash !== session.session_token_hash) {
    console.error("[disciple-maker-submit] token mismatch");
    return json(401, { error: "Invalid token." }, cors);
  }

  // Score responses and identify pathway
  const responseMap = responses as Record<string, number>;
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

  return json(200, { results_token: resultsToken }, cors);
});
