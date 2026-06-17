// supabase/functions/analytics-admin/index.ts
//
// Covo Multipliers — Funnel Analytics Admin API
//
// POST /functions/v1/analytics-admin
// Header: x-admin-secret: <ADMIN_ANALYTICS_SECRET>
// Body: { action: string, ...params }
//
// Supported actions (all read-only):
//   overview          → get_funnel_overview
//   cohort_funnel     → get_cohort_funnel
//   activity          → get_funnel_activity
//   acquisition       → get_acquisition_breakdown
//   lab_performance   → get_lab_performance
//   audience_movement → get_audience_movement
//   assessment_pathway → get_assessment_pathway
//   data_health       → get_data_health
//   contact_drilldown → get_contact_funnel_history
//
// Authentication: shared secret in x-admin-secret header.
// All functions are SECURITY DEFINER and callable only by service_role.
// No mutations — analytics is read-only.
//
// Required secrets (supabase secrets set KEY=value):
//   ADMIN_ANALYTICS_SECRET   — shared secret for x-admin-secret header
// Optional secrets:
//   ADMIN_ANALYTICS_ACTOR    — actor string for logging (default: "analytics_admin")
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Constant-time secret comparison
// ---------------------------------------------------------------------------
function secretsEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// UUID validation
// ---------------------------------------------------------------------------
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  // --- Auth ---
  const expectedSecret = Deno.env.get("ADMIN_ANALYTICS_SECRET");
  if (!expectedSecret) {
    console.error("[analytics-admin] ADMIN_ANALYTICS_SECRET not set");
    return json(500, { error: "Server configuration error." }, cors);
  }

  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  if (!secretsEqual(providedSecret, expectedSecret)) {
    return json(401, { error: "Unauthorized." }, cors);
  }

  // Actor is server-owned — never derived from request body
  const _actor = Deno.env.get("ADMIN_ANALYTICS_ACTOR") ?? "analytics_admin";

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const action = typeof body.action === "string" ? body.action : "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ---------------------------------------------------------------------------
  // Helper: validate attribution mode
  // ---------------------------------------------------------------------------
  function validateAttributionMode(val: unknown): string | null {
    if (val === undefined || val === null) return null; // use DB default
    if (val === "first_touch" || val === "latest_touch") return val;
    return "INVALID";
  }

  // ---------------------------------------------------------------------------
  // Helper: validate required date params (p_start, p_end)
  // ---------------------------------------------------------------------------
  function validateDates(): { p_start: string; p_end: string } | null {
    const p_start = body.p_start;
    const p_end   = body.p_end;
    if (typeof p_start !== "string" || p_start.trim() === "") return null;
    if (typeof p_end   !== "string" || p_end.trim()   === "") return null;
    return { p_start: p_start.trim(), p_end: p_end.trim() };
  }

  // ---------------------------------------------------------------------------
  // overview → get_funnel_overview
  // ---------------------------------------------------------------------------
  if (action === "overview") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const attrMode = validateAttributionMode(body.p_attribution_mode);
    if (attrMode === "INVALID") return json(400, { error: "p_attribution_mode must be 'first_touch' or 'latest_touch'." }, cors);

    const p_event_id = body.p_event_id;
    if (p_event_id !== undefined && p_event_id !== null) {
      if (typeof p_event_id !== "string" || !isUuid(p_event_id)) {
        return json(400, { error: "p_event_id must be a valid UUID." }, cors);
      }
    }

    const params: Record<string, unknown> = {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    };
    if (typeof body.p_utm_source   === "string") params.p_utm_source   = body.p_utm_source;
    if (typeof body.p_utm_medium   === "string") params.p_utm_medium   = body.p_utm_medium;
    if (typeof body.p_utm_campaign === "string") params.p_utm_campaign = body.p_utm_campaign;
    if (attrMode !== null) params.p_attribution_mode = attrMode;
    if (typeof p_event_id === "string") params.p_event_id = p_event_id;

    const { data, error } = await supabase.rpc("get_funnel_overview", params);
    if (error) {
      console.error("[analytics-admin] overview error:", JSON.stringify(error));
      return json(500, { error: "Failed to load overview." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // cohort_funnel → get_cohort_funnel
  // ---------------------------------------------------------------------------
  if (action === "cohort_funnel") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const { data, error } = await supabase.rpc("get_cohort_funnel", {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    });
    if (error) {
      console.error("[analytics-admin] cohort_funnel error:", JSON.stringify(error));
      return json(500, { error: "Failed to load cohort funnel." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // activity → get_funnel_activity
  // ---------------------------------------------------------------------------
  if (action === "activity") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const attrMode = validateAttributionMode(body.p_attribution_mode);
    if (attrMode === "INVALID") return json(400, { error: "p_attribution_mode must be 'first_touch' or 'latest_touch'." }, cors);

    const params: Record<string, unknown> = {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    };
    if (typeof body.p_utm_source   === "string") params.p_utm_source   = body.p_utm_source;
    if (typeof body.p_utm_medium   === "string") params.p_utm_medium   = body.p_utm_medium;
    if (typeof body.p_utm_campaign === "string") params.p_utm_campaign = body.p_utm_campaign;
    if (attrMode !== null) params.p_attribution_mode = attrMode;

    const { data, error } = await supabase.rpc("get_funnel_activity", params);
    if (error) {
      console.error("[analytics-admin] activity error:", JSON.stringify(error));
      return json(500, { error: "Failed to load activity." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // acquisition → get_acquisition_breakdown
  // ---------------------------------------------------------------------------
  if (action === "acquisition") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const attrMode = validateAttributionMode(body.p_attribution_mode);
    if (attrMode === "INVALID") return json(400, { error: "p_attribution_mode must be 'first_touch' or 'latest_touch'." }, cors);

    const params: Record<string, unknown> = {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    };
    if (typeof body.p_utm_source   === "string") params.p_utm_source   = body.p_utm_source;
    if (typeof body.p_utm_medium   === "string") params.p_utm_medium   = body.p_utm_medium;
    if (typeof body.p_utm_campaign === "string") params.p_utm_campaign = body.p_utm_campaign;
    if (attrMode !== null) params.p_attribution_mode = attrMode;

    const { data, error } = await supabase.rpc("get_acquisition_breakdown", params);
    if (error) {
      console.error("[analytics-admin] acquisition error:", JSON.stringify(error));
      return json(500, { error: "Failed to load acquisition breakdown." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // lab_performance → get_lab_performance
  // ---------------------------------------------------------------------------
  if (action === "lab_performance") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const p_event_id = body.p_event_id;
    if (p_event_id !== undefined && p_event_id !== null) {
      if (typeof p_event_id !== "string" || !isUuid(p_event_id)) {
        return json(400, { error: "p_event_id must be a valid UUID." }, cors);
      }
    }

    const params: Record<string, unknown> = {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    };
    if (typeof p_event_id === "string") params.p_event_id = p_event_id;

    const { data, error } = await supabase.rpc("get_lab_performance", params);
    if (error) {
      console.error("[analytics-admin] lab_performance error:", JSON.stringify(error));
      return json(500, { error: "Failed to load lab performance." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // audience_movement → get_audience_movement
  // ---------------------------------------------------------------------------
  if (action === "audience_movement") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const { data, error } = await supabase.rpc("get_audience_movement", {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    });
    if (error) {
      console.error("[analytics-admin] audience_movement error:", JSON.stringify(error));
      return json(500, { error: "Failed to load audience movement." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // assessment_pathway → get_assessment_pathway
  // ---------------------------------------------------------------------------
  if (action === "assessment_pathway") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const attrMode = validateAttributionMode(body.p_attribution_mode);
    if (attrMode === "INVALID") return json(400, { error: "p_attribution_mode must be 'first_touch' or 'latest_touch'." }, cors);

    const params: Record<string, unknown> = {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    };
    if (typeof body.p_utm_source   === "string") params.p_utm_source   = body.p_utm_source;
    if (typeof body.p_utm_medium   === "string") params.p_utm_medium   = body.p_utm_medium;
    if (typeof body.p_utm_campaign === "string") params.p_utm_campaign = body.p_utm_campaign;
    if (attrMode !== null) params.p_attribution_mode = attrMode;

    const { data, error } = await supabase.rpc("get_assessment_pathway", params);
    if (error) {
      console.error("[analytics-admin] assessment_pathway error:", JSON.stringify(error));
      return json(500, { error: "Failed to load assessment pathway." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // data_health → get_data_health
  // ---------------------------------------------------------------------------
  if (action === "data_health") {
    const dates = validateDates();
    if (!dates) return json(400, { error: "p_start and p_end are required non-empty strings." }, cors);

    const { data, error } = await supabase.rpc("get_data_health", {
      p_start: dates.p_start,
      p_end:   dates.p_end,
    });
    if (error) {
      console.error("[analytics-admin] data_health error:", JSON.stringify(error));
      return json(500, { error: "Failed to load data health." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // contact_drilldown → get_contact_funnel_history
  // ---------------------------------------------------------------------------
  if (action === "contact_drilldown") {
    const p_contact_id = body.p_contact_id;
    if (typeof p_contact_id !== "string" || !isUuid(p_contact_id)) {
      return json(400, { error: "p_contact_id must be a valid UUID." }, cors);
    }

    const { data, error } = await supabase.rpc("get_contact_funnel_history", {
      p_contact_id,
    });
    if (error) {
      console.error("[analytics-admin] contact_drilldown error:", JSON.stringify(error));
      return json(500, { error: "Failed to load contact history." }, cors);
    }
    return json(200, { data }, cors);
  }

  // ---------------------------------------------------------------------------
  // Unknown action
  // ---------------------------------------------------------------------------
  return json(400, {
    error: "Unknown action.",
    valid_actions: [
      "overview",
      "cohort_funnel",
      "activity",
      "acquisition",
      "lab_performance",
      "audience_movement",
      "assessment_pathway",
      "data_health",
      "contact_drilldown",
    ],
  }, cors);
});
