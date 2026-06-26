// supabase/functions/disciple-maker-start/index.ts
//
// Disciple Maker Pathway Assessment — Start / Intake
//
// POST /functions/v1/disciple-maker-start
// Body: {
//   first_name: string,
//   email: string,
//   church_org?: string,
//   consent: true,
//   utm_source?, utm_medium?, utm_campaign?, etc.
// }
//
// 1. Validate input and consent
// 2. Upsert participant row
// 3. Create assessment_session
// 4. Generate resume token, store hash
// 5. Return session_id and resume_token

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

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const { first_name, email, church_org, consent } = body;

  if (typeof first_name !== "string" || first_name.trim().length < 1) {
    return json(400, { error: "Please enter your first name." }, cors);
  }
  if (typeof email !== "string" || !isEmail(email)) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }
  if (consent !== true) {
    return json(400, { error: "Consent is required to continue." }, cors);
  }

  const cleanFirst = first_name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanChurch = typeof church_org === "string" ? church_org.trim() : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Check for existing participant
  const { data: existingParticipant } = await supabase
    .from("participants")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle();

  const participantRow: Record<string, unknown> = {
    email: cleanEmail,
    first_name: cleanFirst,
    church_org: cleanChurch,
    updated_at: new Date().toISOString(),
  };

  if (!existingParticipant) {
    participantRow.first_touch_at = new Date().toISOString();
  }

  // Upsert participant
  const { data: participant, error: participantErr } = await supabase
    .from("participants")
    .upsert(participantRow, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single();

  if (participantErr || !participant) {
    console.error("[disciple-maker-start] participant upsert error:", participantErr);
    return json(500, { error: "Could not create participant. Please try again." }, cors);
  }

  // Generate resume token
  const resumeToken = generateToken();
  const resumeTokenHash = await sha256hex(resumeToken);

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .insert({
      participant_id: participant.id,
      assessment_type: "disciple_maker",
      status: "in_progress",
      consent_given: true,
      consent_timestamp: new Date().toISOString(),
      resume_token_hash: resumeTokenHash,
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-start] session insert error:", sessionErr);
    return json(500, { error: "Could not create session. Please try again." }, cors);
  }

  console.log(`[disciple-maker-start] created session=${session.id} participant=${participant.id}`);

  return json(200, {
    session_id: session.id,
    resume_token: resumeToken,
    first_name: cleanFirst,
  }, cors);
});
