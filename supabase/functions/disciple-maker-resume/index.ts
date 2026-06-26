// supabase/functions/disciple-maker-resume/index.ts
//
// POST /functions/v1/disciple-maker-resume
// Body: { email: string }
//
// 1. Find session by email
// 2. Find most recent in_progress session
// 3. Generate new session token
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

  // Find most recent in_progress session by email (from dedicated table)
  const { data: sessions, error: sessionsErr } = await supabase
    .from("disciple_maker_sessions")
    .select("id")
    .eq("email", cleanEmail)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1);

  if (sessionsErr || !sessions || sessions.length === 0) {
    console.error("[disciple-maker-resume] no in_progress session found");
    return json(404, { error: "No in-progress checkup found. Please start a new one." }, cors);
  }

  const session = sessions[0];

  // Generate new session token
  const sessionToken = generateToken();
  const sessionTokenHash = await sha256hex(sessionToken);

  // Update session with new token
  const { error: updateErr } = await supabase
    .from("disciple_maker_sessions")
    .update({ session_token_hash: sessionTokenHash })
    .eq("id", session.id);

  if (updateErr) {
    console.error("[disciple-maker-resume] update error:", updateErr);
    return json(500, { error: "Could not resume session." }, cors);
  }

  console.log(`[disciple-maker-resume] resumed session ${session.id}`);

  return json(200, {
    session_id: session.id,
    session_token: sessionToken,
  }, cors);
});
