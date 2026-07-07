// supabase/functions/public-labs/index.ts
//
// Public "single source of truth" feed for upcoming Covo Multipliers labs.
//
//   GET /functions/v1/public-labs?limit=3
//
// Returns published labs that have not started yet, soonest first, each
// with a ready-to-use `url` (its own landing page, or the /#upcoming-labs
// anchor if that lab has no landing_path yet). Consumers should never
// hardcode lab titles/dates/URLs — fetch this instead. Known consumers:
// Covo's own homepage (#upcoming-labs), and Multiplying Disciples' homepage
// lab CTA + blog "Next Live Lab" cards.
//
// Read-only, unauthenticated, public, no PII — the same exposure level as
// the events_with_availability REST view this wraps (already publicly
// queryable with the anon key). CORS is intentionally open so any site can
// embed a live lab card without needing to be allow-listed here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_ORIGIN = "https://www.covomultipliers.com";
const FALLBACK_URL = `${SITE_ORIGIN}/#upcoming-labs`;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

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
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return json(405, { error: "Method not allowed." });
  }

  const url = new URL(req.url);
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

  // events_with_availability already restricts to is_published = true;
  // the event_date filter here is what makes this "upcoming" rather than
  // "all published". Past labs are never returned, by construction.
  const { data, error } = await supabase
    .from("events_with_availability")
    .select("slug,title,hook,description,event_date,seats_remaining,has_availability,landing_path")
    .gte("event_date", nowIso)
    .order("event_date", { ascending: true })
    .limit(limit);

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
  }));

  // Fresh enough that a new lab or a seat count change shows up within a
  // minute or two, cheap enough that a busy page doesn't hit the DB on
  // every single view.
  return json(
    200,
    { labs, generated_at: nowIso },
    { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  );
});
