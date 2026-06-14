// supabase/functions/assessment-results/index.ts
//
// CoVo Fivefold Stewardship Assessment — Retrieve Results
//
// POST /functions/v1/assessment-results
// Body: { result_token: string }
//
// Validates the result_token hash and returns the stored result_copy.
// Raw scores and construct_scores are NOT returned to the client.
// result_copy and a safe evidence_profile summary are returned.

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

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const { result_token } = body;

  if (typeof result_token !== "string" || result_token.length < 32) {
    return json(400, { error: "A valid result_token is required." }, cors);
  }

  const tokenHash = await sha256hex(result_token);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: result, error } = await supabase
    .from("assessment_results")
    .select("id, result_copy, summary_flags, scoring_version, created_at, domain_scores")
    .eq("result_token_hash", tokenHash)
    .single();

  if (error || !result) {
    return json(404, { error: "Results not found. Your link may be invalid or expired." }, cors);
  }

  // Build evidence_profile from per-domain evidence_scores (stored by updated assessment-submit).
  // Maps internal evidence labels to human-facing category keys.
  // Returns null for results scored before this field was added.
  const EVIDENCE_MAP: Record<string, string> = {
    A: "orientation", B: "behavior", O: "outcome", S: "scenario", FC: "forced_choice",
  };
  let evidenceProfile: Record<string, Record<string, { score: number; item_count: number } | null>> | null = null;
  const ds = result.domain_scores as Record<string, Record<string, unknown>> | null;
  if (ds) {
    let hasData = false;
    const profile: typeof evidenceProfile = {};
    for (const [dk, domainData] of Object.entries(ds)) {
      if (dk === "cross_function") continue;
      const es = domainData?.evidence_scores as Record<string, { score: number; item_count: number }> | undefined;
      if (!es) continue;
      hasData = true;
      const entry: Record<string, { score: number; item_count: number } | null> = {};
      for (const [label, mapped] of Object.entries(EVIDENCE_MAP)) {
        entry[mapped] = es[label] ?? null;
      }
      profile![dk] = entry;
    }
    if (hasData) evidenceProfile = profile;
  }

  // Return rendered copy, flags, and evidence profile — no raw scores or domain_scores
  return json(200, {
    result_copy: result.result_copy,
    summary_flags: result.summary_flags,
    scoring_version: result.scoring_version,
    completed_at: result.created_at,
    evidence_profile: evidenceProfile,
  }, cors);
});
