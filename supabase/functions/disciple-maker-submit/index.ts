// supabase/functions/disciple-maker-submit/index.ts
//
// POST /functions/v1/disciple-maker-submit
// Body: {
//   session_id: string,
//   resume_token: string,
//   responses: { [question_id]: score }
// }
//
// 1. Validate session and token
// 2. Store responses
// 3. Mark session as completed
// 4. Generate results token
// 5. Return results token for redirect

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

  const { session_id, resume_token, responses } = body;

  if (typeof session_id !== "string" || typeof resume_token !== "string" || typeof responses !== "object") {
    return json(400, { error: "Invalid request parameters." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Validate session
  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .select("id, participant_id, resume_token_hash")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-submit] session not found:", sessionErr);
    return json(401, { error: "Invalid session." }, cors);
  }

  // Validate resume token
  const tokenHash = await sha256hex(resume_token);
  if (tokenHash !== session.resume_token_hash) {
    console.error("[disciple-maker-submit] token mismatch for session:", session_id);
    return json(401, { error: "Invalid token." }, cors);
  }

  // Store responses
  const responsesArray = Object.entries(responses).map(([questionId, score]) => ({
    session_id,
    question_id: questionId,
    score: typeof score === 'number' ? score : null,
  }));

  const { error: responseErr } = await supabase
    .from("assessment_responses")
    .insert(responsesArray);

  if (responseErr) {
    console.error("[disciple-maker-submit] response insert error:", responseErr);
    return json(500, { error: "Could not save responses." }, cors);
  }

  // Mark session as completed
  const { error: updateErr } = await supabase
    .from("assessment_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", session_id);

  if (updateErr) {
    console.error("[disciple-maker-submit] update error:", updateErr);
    return json(500, { error: "Could not complete session." }, cors);
  }

  // Generate results token (for secure results access)
  const resultsToken = generateToken();
  const resultsTokenHash = await sha256hex(resultsToken);

  const { error: resultsErr } = await supabase
    .from("assessment_sessions")
    .update({ results_token_hash: resultsTokenHash })
    .eq("id", session_id);

  if (resultsErr) {
    console.error("[disciple-maker-submit] results token error:", resultsErr);
    return json(500, { error: "Could not generate results." }, cors);
  }

  console.log(`[disciple-maker-submit] session ${session_id} completed`);

  return json(200, { results_token: resultsToken }, cors);
});
