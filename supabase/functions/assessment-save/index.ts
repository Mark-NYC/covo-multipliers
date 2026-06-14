// supabase/functions/assessment-save/index.ts
//
// CoVo Fivefold Stewardship Assessment — Save Responses
//
// POST /functions/v1/assessment-save
// Body: {
//   session_id: string,
//   resume_token: string,
//   responses: Array<{ pilot_id: string, response_raw: string }>
// }
//
// Upserts a batch of responses and updates last_active_at.
// Returns count of saved responses and overall completion count.

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

// Maps response_raw to numeric value for scale items
function toResponseNum(format: string, raw: string): number | null {
  if (["AGR6","FREQ6","EX6"].includes(format)) {
    const n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

const VALID_SCALE_VALUES = new Set(["1","2","3","4","5","6"]);
const VALID_SC4_VALUES = new Set(["A","B","C","D"]);
const VALID_FC3_VALUES = new Set(["A","B","C"]);
const VALID_FC2_VALUES = new Set(["A","B"]);

function isValidResponse(format: string, raw: string): boolean {
  switch (format) {
    case "AGR6": case "FREQ6": case "EX6": return VALID_SCALE_VALUES.has(raw);
    case "SC4": return VALID_SC4_VALUES.has(raw);
    case "FC3": return VALID_FC3_VALUES.has(raw);
    case "FC2": return VALID_FC2_VALUES.has(raw);
    default: return false;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const { session_id, resume_token, responses } = body;

  if (typeof session_id !== "string" || !isUuid(session_id)) {
    return json(400, { error: "A valid session_id is required." }, cors);
  }
  if (typeof resume_token !== "string" || resume_token.length < 32) {
    return json(400, { error: "A valid resume_token is required." }, cors);
  }
  if (!Array.isArray(responses) || responses.length === 0) {
    return json(400, { error: "responses must be a non-empty array." }, cors);
  }
  if (responses.length > 100) {
    return json(400, { error: "Too many responses in a single request." }, cors);
  }

  const tokenHash = await sha256hex(resume_token);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Verify session
  const { data: session } = await supabase
    .from("assessment_sessions")
    .select("id, version_id, status, resume_token_hash")
    .eq("id", session_id)
    .single();

  if (!session) return json(404, { error: "Session not found." }, cors);
  if (session.resume_token_hash !== tokenHash) return json(403, { error: "Invalid token." }, cors);
  if (session.status !== "in_progress") {
    return json(400, { error: "This session is no longer accepting responses." }, cors);
  }

  // Load item metadata for validation
  const pilotIds = responses.map((r: Record<string, unknown>) => r.pilot_id as string);
  const { data: items } = await supabase
    .from("assessment_items")
    .select("id, pilot_id, response_format")
    .eq("version_id", session.version_id)
    .eq("is_active", true)
    .in("pilot_id", pilotIds);

  if (!items) return json(500, { error: "Could not load items for validation." }, cors);

  const itemMap: Record<string, { id: string; response_format: string }> = {};
  for (const item of items) itemMap[item.pilot_id] = { id: item.id, response_format: item.response_format };

  // Build upsert rows
  const rows = [];
  const skipped = [];

  for (const r of responses) {
    const pilotId = r.pilot_id as string;
    const raw = r.response_raw as string;

    if (!pilotId || !raw || typeof pilotId !== "string" || typeof raw !== "string") {
      skipped.push(pilotId ?? "unknown");
      continue;
    }

    const item = itemMap[pilotId];
    if (!item) {
      skipped.push(pilotId);
      continue;
    }

    if (!isValidResponse(item.response_format, raw)) {
      skipped.push(pilotId);
      continue;
    }

    rows.push({
      session_id,
      item_id: item.id,
      pilot_id: pilotId,
      response_raw: raw,
      response_num: toResponseNum(item.response_format, raw),
      responded_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("assessment_responses")
      .upsert(rows, { onConflict: "session_id,item_id" });

    if (upsertErr) {
      console.error("[assessment-save] upsert error:", upsertErr);
      return json(500, { error: "Could not save responses. Please try again." }, cors);
    }
  }

  // Update last_active_at
  await supabase
    .from("assessment_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", session_id);

  // Get total response count
  const { count } = await supabase
    .from("assessment_responses")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id);

  console.log(`[assessment-save] session=${session_id} saved=${rows.length} skipped=${skipped.length} total=${count}`);

  return json(200, {
    saved: rows.length,
    skipped: skipped.length,
    total_responses: count ?? 0,
  }, cors);
});
