// supabase/functions/public-labs/index.ts
//
// Public "single source of truth" feed for Covo Multipliers labs.
//
//   GET /functions/v1/public-labs?limit=3               (upcoming, default)
//   GET /functions/v1/public-labs?scope=past&limit=50    (past, newest first)
//   GET /functions/v1/public-labs?scope=all&limit=100     (past + upcoming)
//
// Returns published labs, each with a ready-to-use `url` (its own landing
// page, or the /#upcoming-labs anchor if that lab has no landing_path yet)
// and an optional `slides_url` (its slide deck, when one exists). Consumers
// should never hardcode lab titles/dates/URLs — fetch this instead. Known
// consumers: Covo's own homepage (#upcoming-labs, default upcoming scope),
// the /labs listing page (upcoming + past tabs), and Multiplying Disciples'
// homepage lab CTA + blog "Next Live Lab" cards.
//
// scope:
//   "upcoming" (default) — event_date >= now, soonest first
//   "past"               — event_date <  now, most recent first
//   "all"                — every published lab, soonest first
//
// Read-only, unauthenticated, public, no PII — the same exposure level as
// the events_with_availability REST view this wraps (already publicly
// queryable with the anon key). CORS is intentionally open so any site can
// embed a live lab card without needing to be allow-listed here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_ORIGIN = "https://www.covomultipliers.com";
const FALLBACK_URL = `${SITE_ORIGIN}/#upcoming-labs`;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 100;

type Scope = "upcoming" | "past" | "all";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

interface EventRow {
  slug: string;
  title: string;
  hook: string | null;
  description: string | null;
  event_date: string;
  seats_remaining: number;
  has_availability: boolean;
  landing_path: string | null;
  slides_url: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return json(405, { error: "Method not allowed." });
  }

  const url = new URL(req.url);

  const scopeParam = (url.searchParams.get("scope") ?? "upcoming").toLowerCase();
  const scope: Scope =
    scopeParam === "past" || scopeParam === "all" ? scopeParam : "upcoming";

  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("public-labs missing Supabase credentials");
    return json(500, { error: "Configuration error." });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const nowIso = new Date().toISOString();

  // events_with_availability already restricts to is_published = true; the
  // event_date filter + ordering below is what makes a query "upcoming",
  // "past", or "all". Past labs surface only when explicitly requested, so
  // the default (upcoming) behavior every existing consumer relies on is
  // unchanged.
  let query = supabase
    .from("events_with_availability")
    .select(
      "slug,title,hook,description,event_date,seats_remaining,has_availability,landing_path,slides_url",
    );

  if (scope === "upcoming") {
    query = query.gte("event_date", nowIso).order("event_date", { ascending: true });
  } else if (scope === "past") {
    query = query.lt("event_date", nowIso).order("event_date", { ascending: false });
  } else {
    query = query.order("event_date", { ascending: true });
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    console.error("public-labs query error", JSON.stringify(error));
    return json(500, { error: "Failed to load labs." });
  }

  const labs = ((data ?? []) as EventRow[]).map((row) => ({
    slug: row.slug,
    title: row.title,
    hook: row.hook,
    description: row.description,
    event_date: row.event_date,
    seats_remaining: row.seats_remaining,
    has_availability: row.has_availability,
    url: row.landing_path ? `${SITE_ORIGIN}${row.landing_path}` : FALLBACK_URL,
    slides_url: row.slides_url,
  }));

  // Fresh enough that a new lab or a seat count change shows up within a
  // minute or two, cheap enough that a busy page doesn't hit the DB on
  // every single view.
  return json(
    200,
    { labs, scope, generated_at: nowIso },
    { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  );
});
