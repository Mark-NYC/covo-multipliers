// supabase/functions/disciple-maker-results/index.ts
//
// GET /functions/v1/disciple-maker-results?token=<results_token>
//
// Returns the participant's first name and confirmed recognition outcome so the
// results page can render their next step. No scores, no dimensions, no pathway.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function json(status: number, body: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json(405, { error: "Method not allowed." }, cors);

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return json(400, { error: "Token required." }, cors);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const tokenHash = await sha256hex(token);
  const { data: session, error } = await supabase
    .from("disciple_maker_sessions")
    .select("id, first_name, status, recognition_outcome, barrier_summary, seven_day_step, note")
    .eq("results_token_hash", tokenHash)
    .single();

  if (error || !session) return json(404, { error: "Results not found." }, cors);
  if (session.status !== "completed") return json(400, { error: "Assessment not yet completed." }, cors);

  return json(200, {
    first_name: session.first_name,
    recognition_outcome: session.recognition_outcome,
    barrier_summary: session.barrier_summary,
    seven_day_step: session.seven_day_step,
    note: session.note ?? null,
  }, cors);
});
