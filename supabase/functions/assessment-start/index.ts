// supabase/functions/assessment-start/index.ts
//
// CoVo Fivefold Stewardship Assessment — Start / Intake
//
// POST /functions/v1/assessment-start
// Body: {
//   first_name: string,
//   last_name?: string,
//   email: string,
//   church_org?: string,
//   role_context?: string,
//   consent: true
// }
//
// 1. Validate input and consent
// 2. Upsert participant row
// 3. Create assessment_session with item_order (shuffled within sections)
// 4. Generate secure resume token (random 32-byte hex), store SHA-256 hash
// 5. Return session_id and resume_token to client (token never stored plain)
//
// Secrets:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   SITE_ORIGIN — for CORS

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

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

  const { first_name, last_name, email, church_org, role_context, consent } = body;

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
  const cleanLast = typeof last_name === "string" ? last_name.trim() : null;
  const cleanEmail = email.trim().toLowerCase();
  const cleanChurch = typeof church_org === "string" ? church_org.trim() : null;
  const cleanRole = typeof role_context === "string" ? role_context.trim() : null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Upsert participant
  const { data: participant, error: participantErr } = await supabase
    .from("participants")
    .upsert(
      {
        email: cleanEmail,
        first_name: cleanFirst,
        last_name: cleanLast,
        church_org: cleanChurch,
        role_context: cleanRole,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (participantErr || !participant) {
    console.error("[assessment-start] participant upsert error:", participantErr);
    return json(500, { error: "Could not create participant. Please try again." }, cors);
  }

  // Get active version
  const { data: version, error: versionErr } = await supabase
    .from("assessment_versions")
    .select("id")
    .eq("is_active", true)
    .single();

  if (versionErr || !version) {
    console.error("[assessment-start] no active version found:", versionErr);
    return json(500, { error: "Assessment is not currently available." }, cors);
  }

  // Fetch active items and build ordered item list (shuffled within domain sections)
  const { data: items, error: itemsErr } = await supabase
    .from("assessment_items")
    .select("id, domain_key, sort_order")
    .eq("version_id", version.id)
    .eq("is_active", true)
    .order("sort_order");

  if (itemsErr || !items) {
    console.error("[assessment-start] items fetch error:", itemsErr);
    return json(500, { error: "Could not load assessment items." }, cors);
  }

  // Group by domain and shuffle within each domain group
  const byDomain: Record<string, string[]> = {};
  for (const item of items) {
    if (!byDomain[item.domain_key]) byDomain[item.domain_key] = [];
    byDomain[item.domain_key].push(item.id);
  }
  const domainOrder = [
    "prophetic", "evangelistic", "shepherding", "teaching",
    "apostolic_direction", "apostolic_formation", "apostolic_multiplying", "cross_function",
  ];
  const itemOrder: string[] = [];
  for (const dk of domainOrder) {
    if (byDomain[dk]) itemOrder.push(...shuffle(byDomain[dk]));
  }
  // Append any cross-function items at the end (already handled above)

  // Generate resume token
  const resumeToken = generateToken();
  const resumeTokenHash = await sha256hex(resumeToken);

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .insert({
      participant_id: participant.id,
      version_id: version.id,
      status: "in_progress",
      consent_given: true,
      consent_timestamp: new Date().toISOString(),
      resume_token_hash: resumeTokenHash,
      item_order: itemOrder,
    })
    .select("id")
    .single();

  if (sessionErr || !session) {
    console.error("[assessment-start] session insert error:", sessionErr);
    return json(500, { error: "Could not create session. Please try again." }, cors);
  }

  console.log(`[assessment-start] created session=${session.id} participant=${participant.id}`);

  return json(200, {
    session_id: session.id,
    resume_token: resumeToken,
    item_count: itemOrder.length,
    first_name: cleanFirst,
  }, cors);
});
