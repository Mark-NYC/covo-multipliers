// supabase/functions/immersion-applications-sync/handler.ts
//
// Covo Multipliers — Immersion Applications Sync (read-only) handler + wiring.
// The deployable entrypoint is index.ts, which calls
// createHandler(buildRealDeps()). All logic lives here so it can be imported
// and unit-tested without starting a server or a real Supabase client
// (see handler.test.ts).
//
// GET /functions/v1/immersion-applications-sync?after_id=<uuid>&limit=<n>
// Header: x-sync-token: <IMMERSION_SYNC_TOKEN>
//
// Returns the immersion-application fields useful to city immersion leaders,
// one stable Supabase application id per record, paginated with a keyset
// cursor so an initial sync can walk every existing application.
//
// This is READ-ONLY. It never writes to the database. The service-role key
// stays inside Supabase (used only server-side to read past RLS); it is never
// returned to the caller. The only client-facing credential is the dedicated
// IMMERSION_SYNC_TOKEN, which grants read access to this endpoint and nothing
// else.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   IMMERSION_SYNC_TOKEN — dedicated sync token. Requests must present it in
//                          the x-sync-token header. If unset, the function
//                          fails closed (500) rather than serving data.
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS. This endpoint is called server-to-server from Google Apps Script
// (no browser Origin), so we do not echo arbitrary origins. A same-site
// browser origin is allowed only for manual testing.
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type, x-sync-token",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

// ---------------------------------------------------------------------------
// Pagination bounds
// ---------------------------------------------------------------------------
export const DEFAULT_PAGE_SIZE = 500;
export const MAX_PAGE_SIZE = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The nested immersion, as returned by a PostgREST embed. Supabase returns a
// single related row as an object, but a defensive read also tolerates an
// array (some client/relationship shapes).
interface ImmersionEmbed {
  slug?: string | null;
  title?: string | null;
  city?: string | null;
  start_date?: string | null;
}

// A raw row as read from immersion_applications with the immersions embed.
export interface RawApplicationRow {
  id: string;
  status: string | null;
  created_at: string | null;
  confirmation_sent_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  city_state: string | null;
  church_org: string | null;
  team_status: string | null;
  team_size: number | null;
  why_coming: string | null;
  hoping_to_learn: string | null;
  prior_training: string | null;
  lodging_acknowledged: boolean | null;
  immersions?: ImmersionEmbed | ImmersionEmbed[] | null;
}

// The flat, leader-facing record shape returned by the endpoint.
// Keep this list and its order in sync with the Apps Script SUPABASE_COLUMNS.
export interface SyncApplicationRecord {
  application_id: string;
  immersion_title: string | null;
  immersion_city: string | null;
  immersion_slug: string | null;
  immersion_start_date: string | null;
  status: string | null;
  created_at: string | null;
  confirmation_sent_at: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  city_state: string | null;
  church_org: string | null;
  team_status: string | null;
  team_size: number | null;
  why_coming: string | null;
  hoping_to_learn: string | null;
  prior_training: string | null;
  lodging_acknowledged: boolean | null;
}

export interface FetchApplicationsResult {
  rows: RawApplicationRow[];
  error: unknown;
}

// Fetch one keyset page of applications: rows with id > afterId (or from the
// start when afterId is null), ordered by id ascending, at most `limit` rows.
export type FetchApplicationsFn = (
  afterId: string | null,
  limit: number,
) => Promise<FetchApplicationsResult>;

export interface SyncDeps {
  // The expected sync token. undefined means the secret is not configured and
  // the handler must fail closed.
  syncToken: string | undefined;
  fetchApplications: FetchApplicationsFn;
  defaultPageSize: number;
  maxPageSize: number;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export function createHandler(
  deps: SyncDeps,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (req.method !== "GET") {
      return json(405, { error: "Method not allowed." }, cors);
    }

    // --- Auth: fail closed if the secret is not configured. -----------------
    if (!deps.syncToken) {
      console.error(
        "[immersion-applications-sync] IMMERSION_SYNC_TOKEN not set",
      );
      return json(500, { error: "Server configuration error." }, cors);
    }

    const provided = req.headers.get("x-sync-token");
    if (!provided || !timingSafeEqual(provided, deps.syncToken)) {
      // Do not log the provided value.
      return json(401, { error: "Invalid or missing sync token." }, cors);
    }

    // --- Pagination inputs --------------------------------------------------
    const url = new URL(req.url);
    const afterId = parseAfterId(url.searchParams.get("after_id"));
    if (afterId === INVALID) {
      return json(400, { error: "after_id must be a valid UUID." }, cors);
    }
    const limit = parseLimit(
      url.searchParams.get("limit"),
      deps.defaultPageSize,
      deps.maxPageSize,
    );

    // --- Read one page ------------------------------------------------------
    const { rows, error } = await deps.fetchApplications(afterId, limit);
    if (error) {
      // Log the shape of the error, never applicant data.
      console.error(
        "[immersion-applications-sync] read error:",
        safeErr(error),
      );
      return json(500, { error: "Could not read applications." }, cors);
    }

    const records = rows.map(toRecord);

    // Keyset cursor: only advertise a next page when this page was full. The
    // cursor is the last row's id; the next request passes it as after_id.
    const nextCursor = records.length === limit && records.length > 0
      ? records[records.length - 1].application_id
      : null;

    return json(200, {
      records,
      next_cursor: nextCursor,
      page_size: limit,
      count: records.length,
    }, cors);
  };
}

// ---------------------------------------------------------------------------
// Mapping: raw DB row -> flat leader-facing record.
// Deliberately omits utm/attribution and contact_id — not useful to immersion
// leaders and needlessly spreads personal/marketing data.
// ---------------------------------------------------------------------------
export function toRecord(row: RawApplicationRow): SyncApplicationRecord {
  const imm = firstEmbed(row.immersions);
  return {
    application_id: row.id,
    immersion_title: imm?.title ?? null,
    immersion_city: imm?.city ?? null,
    immersion_slug: imm?.slug ?? null,
    immersion_start_date: imm?.start_date ?? null,
    status: row.status ?? null,
    created_at: row.created_at ?? null,
    confirmation_sent_at: row.confirmation_sent_at ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    city_state: row.city_state ?? null,
    church_org: row.church_org ?? null,
    team_status: row.team_status ?? null,
    team_size: typeof row.team_size === "number" ? row.team_size : null,
    why_coming: row.why_coming ?? null,
    hoping_to_learn: row.hoping_to_learn ?? null,
    prior_training: row.prior_training ?? null,
    lodging_acknowledged: row.lodging_acknowledged ?? null,
  };
}

function firstEmbed(
  e: ImmersionEmbed | ImmersionEmbed[] | null | undefined,
): ImmersionEmbed | null {
  if (!e) return null;
  return Array.isArray(e) ? (e[0] ?? null) : e;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALID = Symbol("invalid-after-id");

export function parseAfterId(
  raw: string | null,
): string | null | typeof INVALID {
  if (raw === null || raw.trim() === "") return null;
  const v = raw.trim();
  return UUID_RE.test(v) ? v : INVALID;
}

export function parseLimit(
  raw: string | null,
  def: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function json(
  status: number,
  body: unknown,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Constant-time string comparison to avoid leaking the token via timing.
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against the longer length so early-exit does not reveal length,
  // but still return false when lengths differ.
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// Reduce an unknown error to a safe, PII-free shape for logging.
function safeErr(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code : "";
    const message = typeof e.message === "string" ? e.message : "";
    return JSON.stringify({ code, message });
  }
  return String(error);
}

// ---------------------------------------------------------------------------
// Production dependency wiring
// ---------------------------------------------------------------------------
export function buildRealDeps(): SyncDeps {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const SELECT =
    "id, status, created_at, confirmation_sent_at, name, email, phone, " +
    "city_state, church_org, team_status, team_size, why_coming, " +
    "hoping_to_learn, prior_training, lodging_acknowledged, " +
    "immersions(slug, title, city, start_date)";

  const fetchApplications: FetchApplicationsFn = async (afterId, limit) => {
    let q = supabase
      .from("immersion_applications")
      .select(SELECT)
      .order("id", { ascending: true })
      .limit(limit);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q;
    return { rows: (data ?? []) as unknown as RawApplicationRow[], error };
  };

  return {
    syncToken: Deno.env.get("IMMERSION_SYNC_TOKEN"),
    fetchApplications,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maxPageSize: MAX_PAGE_SIZE,
  };
}
