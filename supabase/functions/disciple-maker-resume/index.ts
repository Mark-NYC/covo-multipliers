// supabase/functions/disciple-maker-resume/index.ts
//
// POST /functions/v1/disciple-maker-resume
// Body: { email: string }
//
// 1. Find participant by email
// 2. Find their most recent in_progress session
// 3. Generate new resume token
// 4. Return session_id and token

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

  const { email } = body;

  if (typeof email !== "string" || !email.trim()) {
    return json(400, { error: "Email is required." }, cors);
  }

  const cleanEmail = email.trim().toLowerCase();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Find participant
  const { data: participant, error: participantErr } = await supabase
    .from("participants")
    .select("id")
    .eq("email", cleanEmail)
    .single();

  if (participantErr || !participant) {
    console.error("[disciple-maker-resume] participant not found");
    return json(404, { error: "Email not found. Please start a new checkup." }, cors);
  }

  // Find most recent in_progress session
  const { data: sessions, error: sessionsErr } = await supabase
    .from("assessment_sessions")
    .select("id")
    .eq("participant_id", participant.id)
    .eq("assessment_type", "disciple_maker")
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1);

  if (sessionsErr || !sessions || sessions.length === 0) {
    console.error("[disciple-maker-resume] no in_progress session found");
    return json(404, { error: "No in-progress checkup found. Please start a new one." }, cors);
  }

  const session = sessions[0];

  // Generate new resume token
  const resumeToken = generateToken();
  const resumeTokenHash = await sha256hex(resumeToken);

  // Update session with new token
  const { error: updateErr } = await supabase
    .from("assessment_sessions")
    .update({ resume_token_hash: resumeTokenHash })
    .eq("id", session.id);

  if (updateErr) {
    console.error("[disciple-maker-resume] update error:", updateErr);
    return json(500, { error: "Could not resume session." }, cors);
  }

  console.log(`[disciple-maker-resume] resumed session ${session.id}`);

  return json(200, {
    session_id: session.id,
    resume_token: resumeToken,
  }, cors);
});
