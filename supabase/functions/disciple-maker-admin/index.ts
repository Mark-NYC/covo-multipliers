// supabase/functions/disciple-maker-admin/index.ts
//
// Disciple Maker Next Step Finder — Admin API
//
// POST /functions/v1/disciple-maker-admin
// Header: x-admin-secret: <ADMIN_DISCIPLE_MAKER_SECRET>
// Body: { action: "overview" | "sessions" }
//
// disciple_maker_sessions/responses have RLS enabled with no public
// policies (see migration 20270707000000), so the admin dashboards can no
// longer read them directly with the anon key. This function reads them
// with the service role, gated by a shared secret header, mirroring
// assessment-admin/attendance-admin.

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
    "Access-Control-Allow-Headers": "content-type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  // Auth check
  const providedSecret = req.headers.get("x-admin-secret");
  const expectedSecret = Deno.env.get("ADMIN_DISCIPLE_MAKER_SECRET");

  if (!expectedSecret) {
    console.error("[disciple-maker-admin] ADMIN_DISCIPLE_MAKER_SECRET not set");
    return json(500, { error: "Server configuration error." }, cors);
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return json(401, { error: "Invalid admin secret." }, cors);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json(400, { error: "Request body must be valid JSON." }, cors); }

  const action = body.action as string;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // -------------------------------------------------------------------------
  // overview: session counts (for the Admin Hub stat card)
  // -------------------------------------------------------------------------
  if (action === "overview") {
    const { data: sessions, error } = await supabase
      .from("disciple_maker_sessions")
      .select("status");

    if (error) {
      console.error("[disciple-maker-admin] overview error:", JSON.stringify(error));
      return json(500, { error: "Failed to load overview." }, cors);
    }

    const total = sessions?.length ?? 0;
    const completed = (sessions ?? []).filter((s) => s.status === "completed").length;
    const inProgress = (sessions ?? []).filter((s) => s.status === "in_progress").length;

    return json(200, {
      total_sessions: total,
      completed_sessions: completed,
      in_progress_sessions: inProgress,
    }, cors);
  }

  // -------------------------------------------------------------------------
  // sessions: full session list for the results table + CSV export
  // -------------------------------------------------------------------------
  if (action === "sessions") {
    const { data: sessions, error } = await supabase
      .from("disciple_maker_sessions")
      .select("first_name, email, status, pathway, bottleneck, dimension_scores, completed_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[disciple-maker-admin] sessions error:", JSON.stringify(error));
      return json(500, { error: "Failed to load sessions." }, cors);
    }

    return json(200, { sessions: sessions ?? [] }, cors);
  }

  return json(400, { error: "Unknown action." }, cors);
});
