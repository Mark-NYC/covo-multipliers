// supabase/functions/disciple-maker-results/index.ts
//
// GET /functions/v1/disciple-maker-results?token=<results_token>
//
// 1. Validate token
// 2. Return participant name and responses
// 3. No authorization check — token acts as access control

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json(405, { error: "Method not allowed." }, cors);

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json(400, { error: "Token required." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Find session by results token hash
  const tokenHash = await sha256hex(token);

  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .select("id, participant_id, status")
    .eq("results_token_hash", tokenHash)
    .eq("assessment_type", "disciple_maker")
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-results] session not found");
    return json(404, { error: "Results not found." }, cors);
  }

  if (session.status !== "completed") {
    return json(400, { error: "Assessment not yet completed." }, cors);
  }

  // Get participant info
  const { data: participant, error: participantErr } = await supabase
    .from("participants")
    .select("first_name")
    .eq("id", session.participant_id)
    .single();

  if (participantErr || !participant) {
    console.error("[disciple-maker-results] participant not found");
    return json(500, { error: "Could not load results." }, cors);
  }

  // Get responses
  const { data: responses, error: responsesErr } = await supabase
    .from("assessment_responses")
    .select("question_id, score")
    .eq("session_id", session.id);

  if (responsesErr) {
    console.error("[disciple-maker-results] responses error:", responsesErr);
    return json(500, { error: "Could not load responses." }, cors);
  }

  // Build response map
  const responseMap: Record<string, number> = {};
  responses.forEach((r: { question_id: string; score: number }) => {
    responseMap[r.question_id] = r.score;
  });

  console.log(`[disciple-maker-results] retrieved results for session ${session.id}`);

  return json(200, {
    first_name: participant.first_name,
    responses: responseMap,
  }, cors);
});
