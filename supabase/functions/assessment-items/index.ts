// supabase/functions/assessment-items/index.ts
//
// CoVo Fivefold Stewardship Assessment — Load Items for a Session
//
// POST /functions/v1/assessment-items
// Body: { session_id: string, resume_token: string }
//
// Returns the ordered item list for this session, with options for
// scenario/forced-choice items. Does not return scoring weights or rules.

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

function json(status: number, body: unknown, cors: Record<string, string>): Response {
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

// Response format scale labels (sent to client so UI can render labels)
const SCALE_LABELS: Record<string, string[]> = {
  AGR6: ["Strongly disagree","Disagree","Somewhat disagree","Somewhat agree","Agree","Strongly agree"],
  FREQ6: ["Never","Once or twice in the year","Monthly","Bi-weekly","Weekly","Weekly or more"],
  EX6: [
    "Cannot identify any example",
    "I could name one with significant effort",
    "I can identify one example clearly",
    "I can identify more than one example",
    "I can identify several examples",
    "Others could readily confirm this",
  ],
};

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const { session_id, resume_token } = body;

  if (typeof session_id !== "string" || !isUuid(session_id)) {
    return json(400, { error: "A valid session_id is required." }, cors);
  }
  if (typeof resume_token !== "string" || resume_token.length < 32) {
    return json(400, { error: "A valid resume_token is required." }, cors);
  }

  const tokenHash = await sha256hex(resume_token);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Verify session and token
  const { data: session, error: sessionErr } = await supabase
    .from("assessment_sessions")
    .select("id, version_id, status, resume_token_hash, item_order")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) return json(404, { error: "Session not found." }, cors);
  if (session.resume_token_hash !== tokenHash) return json(403, { error: "Invalid token." }, cors);
  if (session.status === "scored") {
    return json(400, { error: "This assessment has already been submitted." }, cors);
  }

  const itemOrder: string[] = session.item_order ?? [];

  // Load items (public fields only — no scoring weights)
  const { data: items } = await supabase
    .from("assessment_items")
    .select("id, pilot_id, item_text, response_format, timeframe")
    .eq("version_id", session.version_id)
    .eq("is_active", true);

  if (!items) return json(500, { error: "Could not load items." }, cors);

  // Load options for scenario/forced-choice items
  const itemIds = items.map((i) => i.id);
  const { data: options } = await supabase
    .from("assessment_item_options")
    .select("item_id, option_key, option_text, sort_order")
    .in("item_id", itemIds)
    .order("sort_order");

  const optionsByItemId: Record<string, Array<{ key: string; text: string }>> = {};
  for (const opt of options ?? []) {
    if (!optionsByItemId[opt.item_id]) optionsByItemId[opt.item_id] = [];
    optionsByItemId[opt.item_id].push({ key: opt.option_key, text: opt.option_text });
  }

  // Map items by id for ordering
  const itemById: Record<string, typeof items[0]> = {};
  for (const item of items) itemById[item.id] = item;

  // Load existing responses
  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("pilot_id, response_raw")
    .eq("session_id", session_id);

  const savedResponses: Record<string, string> = {};
  for (const r of responses ?? []) savedResponses[r.pilot_id] = r.response_raw;

  // Build ordered item list (no domain/construct keys — no scoring info exposed)
  const orderedItems = itemOrder
    .map((id) => {
      const item = itemById[id];
      if (!item) return null;
      return {
        id: item.id,
        pilot_id: item.pilot_id,
        item_text: item.item_text,
        response_format: item.response_format,
        timeframe: item.timeframe,
        scale_labels: SCALE_LABELS[item.response_format] ?? null,
        options: optionsByItemId[item.id] ?? null,
        saved_response: savedResponses[item.pilot_id] ?? null,
      };
    })
    .filter(Boolean);

  // Update last_active_at
  await supabase
    .from("assessment_sessions")
    .update({ last_active_at: new Date().toISOString() })
    .eq("id", session_id);

  return json(200, {
    session_id,
    item_count: orderedItems.length,
    items: orderedItems,
    response_count: Object.keys(savedResponses).length,
  }, cors);
});
