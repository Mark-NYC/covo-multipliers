// supabase/functions/assessment-admin/index.ts
//
// CoVo Fivefold Stewardship Assessment — Admin API
//
// POST /functions/v1/assessment-admin
// Header: x-admin-secret: <ADMIN_ASSESSMENT_SECRET>
// Body: { action: "overview" | "analytics" | "sessions" | "items", ...params }
//
// Protected by a secret header. Never exposes individual response data.
// All analytics are labeled as Pilot Analytics — not validated.

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
  const expectedSecret = Deno.env.get("ADMIN_ASSESSMENT_SECRET");

  if (!expectedSecret) {
    console.error("[assessment-admin] ADMIN_ASSESSMENT_SECRET not set");
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
  // overview: session counts + active version info
  // -------------------------------------------------------------------------
  if (action === "overview") {
    const [sessionsRes, versionRes] = await Promise.all([
      supabase.from("assessment_sessions").select("status"),
      supabase.from("assessment_versions").select("label, version_tag, config").eq("is_active", true).single(),
    ]);

    const sessions = sessionsRes.data ?? [];
    const total = sessions.length;
    const scored = sessions.filter((s) => s.status === "scored").length;
    const inProgress = sessions.filter((s) => s.status === "in_progress").length;

    const version = versionRes.data;

    return json(200, {
      total_sessions: total,
      scored_sessions: scored,
      in_progress_sessions: inProgress,
      active_version: version ? {
        label: version.label,
        version_tag: version.version_tag,
        item_count: (version.config as Record<string, unknown>)?.item_count ?? null,
      } : null,
    }, cors);
  }

  // -------------------------------------------------------------------------
  // analytics: domain average scores across all completed sessions
  // -------------------------------------------------------------------------
  if (action === "analytics") {
    const { data: results } = await supabase
      .from("assessment_results")
      .select("domain_scores");

    if (!results || results.length === 0) {
      return json(200, { domain_averages: [] }, cors);
    }

    const DOMAIN_LABELS: Record<string, string> = {
      prophetic: "Prophetic",
      evangelistic: "Evangelistic",
      shepherding: "Shepherding",
      teaching: "Teaching",
      apostolic_direction: "Apostolic Direction",
      apostolic_formation: "Apostolic Formation",
      apostolic_multiplying: "Apostolic Multiplying",
    };

    // Aggregate weighted averages
    const totals: Record<string, { sum: number; count: number }> = {};
    for (const result of results) {
      const ds = result.domain_scores as Record<string, { weighted: number; item_count: number }>;
      for (const [dk, score] of Object.entries(ds)) {
        if (dk === "cross_function") continue;
        if (!totals[dk]) totals[dk] = { sum: 0, count: 0 };
        if (score.item_count > 0) {
          totals[dk].sum += score.weighted / score.item_count;
          totals[dk].count += 1;
        }
      }
    }

    const domainAverages = Object.entries(totals).map(([dk, t]) => ({
      domain_key: dk,
      label: DOMAIN_LABELS[dk] ?? dk,
      average: t.count > 0 ? t.sum / t.count : 0,
      count: t.count,
    })).sort((a, b) => b.average - a.average);

    return json(200, {
      domain_averages: domainAverages,
      session_count: results.length,
      pilot_note: "These are unvalidated pilot analytics. Do not report as psychometrically validated.",
    }, cors);
  }

  // -------------------------------------------------------------------------
  // sessions: recent session list (no raw responses)
  // -------------------------------------------------------------------------
  if (action === "sessions") {
    const limit = Math.min(Number(body.limit ?? 50), 200);

    const { data: sessions } = await supabase
      .from("assessment_sessions")
      .select(`
        id, status, started_at, submitted_at,
        participants (email)
      `)
      .order("started_at", { ascending: false })
      .limit(limit);

    // Get response counts separately
    const sessionIds = (sessions ?? []).map((s) => s.id);
    const { data: responseCounts } = sessionIds.length > 0
      ? await supabase
          .from("assessment_responses")
          .select("session_id")
          .in("session_id", sessionIds)
      : { data: [] };

    const countBySession: Record<string, number> = {};
    for (const r of responseCounts ?? []) {
      countBySession[r.session_id] = (countBySession[r.session_id] ?? 0) + 1;
    }

    const formatted = (sessions ?? []).map((s) => ({
      id: s.id,
      email: (s.participants as Record<string, unknown> | null)?.email ?? null,
      status: s.status,
      started_at: s.started_at,
      submitted_at: s.submitted_at,
      response_count: countBySession[s.id] ?? 0,
    }));

    return json(200, { sessions: formatted }, cors);
  }

  // -------------------------------------------------------------------------
  // items: item list (no scoring weights)
  // -------------------------------------------------------------------------
  if (action === "items") {
    const { data: items } = await supabase
      .from("assessment_items")
      .select("pilot_id, domain_key, construct_key, phenotype_layer, evidence_label, response_format, reverse_keyed, is_active, sort_order")
      .order("sort_order");

    return json(200, { items: items ?? [] }, cors);
  }

  return json(400, { error: "Unknown action." }, cors);
});
