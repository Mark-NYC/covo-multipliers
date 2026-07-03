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

function safeAttr(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, maxLen) : null;
}

function safeTs(v: unknown): string | null {
  const s = safeAttr(v, 50);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
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

  const { first_name, email, organization, consent } = body;

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
  const cleanOrg = typeof organization === "string" ? organization.trim() : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Generate resume token (use session token for resume)
  const sessionToken = generateToken();
  const sessionTokenHash = await sha256hex(sessionToken);

  // Create session in dedicated disciple_maker_sessions table
  // First-touch attribution is captured once at session start (this table has
  // no upsert-by-email like participants, so there is no risk of overwriting it).
  const { data: session, error: sessionErr } = await supabase
    .from("disciple_maker_sessions")
    .insert({
      email: cleanEmail,
      first_name: cleanFirst,
      organization: cleanOrg,
      status: "in_progress",
      session_token_hash: sessionTokenHash,
      first_utm_source:   safeAttr(body.first_utm_source, 100),
      first_utm_medium:   safeAttr(body.first_utm_medium, 100),
      first_utm_campaign: safeAttr(body.first_utm_campaign, 200),
      first_utm_content:  safeAttr(body.first_utm_content, 200),
      first_utm_term:     safeAttr(body.first_utm_term, 200),
      first_landing_page: safeAttr(body.first_landing_page),
      first_referrer:     safeAttr(body.first_referrer),
      first_touch_at:     safeTs(body.first_touch_at),
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[disciple-maker-start] session insert error:", sessionErr);
    return json(500, { error: "Could not create session. Please try again." }, cors);
  }

  console.log(`[disciple-maker-start] created session=${session.id}`);

  return json(200, {
    session_id: session.id,
    session_token: sessionToken,
    first_name: cleanFirst,
  }, cors);
});
