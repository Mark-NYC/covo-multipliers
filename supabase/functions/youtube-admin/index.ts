// supabase/functions/youtube-admin/index.ts
//
// Covo Multipliers — YouTube Analytics proxy for the operating dashboard.
//
// POST /functions/v1/youtube-admin
// Header: x-admin-secret: <ADMIN_ANALYTICS_SECRET>
// Body:   { action, startDate, endDate }
//         startDate / endDate: "YYYY-MM-DD"
//
// Supported actions:
//   overview        — channel totals: views, watch time, avg duration, subs gained/lost
//   top_videos      — top 10 videos by views, with titles (Analytics + Data API)
//   traffic_sources — views and watch time by traffic source type
//
// Required secrets (supabase secrets set KEY=value):
//   ADMIN_ANALYTICS_SECRET  — shared secret (same as analytics-admin and ga4-admin)
//   YOUTUBE_CLIENT_ID       — OAuth2 client ID from Google Cloud Console
//   YOUTUBE_CLIENT_SECRET   — OAuth2 client secret
//   YOUTUBE_REFRESH_TOKEN   — long-lived refresh token for the channel owner
//   YOUTUBE_CHANNEL_ID      — channel ID (UCxxxxxxxxxx)
//
// Scopes needed when generating the refresh token:
//   https://www.googleapis.com/auth/yt-analytics.readonly
//   https://www.googleapis.com/auth/youtube.readonly
//
// See: https://developers.google.com/youtube/analytics/reference

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

function ok(data: unknown, cors: Record<string, string>): Response {
  return json(200, { success: true, data, generated_at: new Date().toISOString() }, cors);
}

function err(status: number, message: string, cors: Record<string, string>): Response {
  return json(status, { success: false, error: message }, cors);
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
// Date validation: YYYY-MM-DD
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validateDate(v: unknown): string | null {
  if (typeof v !== "string" || !DATE_RE.test(v)) return null;
  return v;
}

// ---------------------------------------------------------------------------
// OAuth2: exchange refresh token for access token
// ---------------------------------------------------------------------------
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[youtube-admin] Token exchange failed:", res.status, body.substring(0, 300));
    throw new Error(`YouTube token exchange failed (${res.status}).`);
  }

  const { access_token } = await res.json();
  if (!access_token) throw new Error("Token exchange returned no access_token.");
  return access_token as string;
}

// ---------------------------------------------------------------------------
// YouTube Analytics API  — run a report
// Docs: https://developers.google.com/youtube/analytics/reference/reports/query
// ---------------------------------------------------------------------------
interface AnalyticsRow {
  [key: string]: string | number;
}

async function runAnalyticsReport(
  token: string,
  channelId: string,
  params: Record<string, string>,
): Promise<AnalyticsRow[]> {
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  void channelId; // used for logging only
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error("[youtube-admin] Analytics API error:", res.status, body.substring(0, 500));
    throw new Error(`YouTube Analytics API returned ${res.status}: ${body.substring(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const report: any = await res.json();
  const headers: string[] = (report.columnHeaders ?? []).map(
    // deno-lint-ignore no-explicit-any
    (h: any) => h.name as string,
  );
  // deno-lint-ignore no-explicit-any
  return (report.rows ?? []).map((row: any[]) => {
    const obj: AnalyticsRow = {};
    headers.forEach((name, i) => { obj[name] = row[i]; });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// YouTube Data API v3 — fetch video titles for a list of IDs
// ---------------------------------------------------------------------------
async function fetchVideoTitles(
  token: string,
  videoIds: string[],
): Promise<Map<string, string>> {
  if (videoIds.length === 0) return new Map();

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("maxResults", String(videoIds.length));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error("[youtube-admin] Data API (video titles) error:", res.status);
    return new Map(); // Non-fatal — caller renders IDs as fallback
  }

  // deno-lint-ignore no-explicit-any
  const body: any = await res.json();
  const map = new Map<string, string>();
  // deno-lint-ignore no-explicit-any
  for (const item of (body.items ?? [])) {
    map.set(item.id as string, item.snippet?.title as string ?? item.id);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Traffic source label map (YouTube Analytics API v2 string enum values)
// ---------------------------------------------------------------------------
const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  "YT_SEARCH":        "YouTube Search",
  "BROWSE":           "Browse Features",
  "RELATED_VIDEO":    "Suggested Videos",
  "EXT_URL":          "External Website",
  "NO_LINK_EMBEDDED": "Embedded Player",
  "NO_LINK_OTHER":    "Direct / Unknown",
  "NOTIFICATION":     "Notifications",
  "PLAYLIST":         "Playlist",
  "ADVERTISING":      "Advertising",
  "END_SCREEN":       "End Screen",
  "SHORTS":           "YouTube Shorts",
  "SUBSCRIBER":       "Subscriptions",
  "YT_CHANNEL":       "YouTube Channel Pages",
  "YT_OTHER_PAGE":    "Other YouTube Pages",
  "CAMPAIGN_CARD":    "Campaign Cards",
  "HASHTAGS":         "Hashtags",
  "ANNOTATION":       "Annotations",
  "PROMOTED":         "Promoted / Paid",
  "LIVE_REDIRECT":    "Live Redirect",
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return err(405, "Method not allowed.", cors);

  // --- Auth ---
  const expectedSecret = Deno.env.get("ADMIN_ANALYTICS_SECRET");
  if (!expectedSecret) {
    console.error("[youtube-admin] ADMIN_ANALYTICS_SECRET not set");
    return err(500, "Server configuration error.", cors);
  }
  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  if (!secretsEqual(providedSecret, expectedSecret)) {
    return err(401, "Unauthorized.", cors);
  }

  // --- YouTube credentials ---
  const clientId     = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("YOUTUBE_REFRESH_TOKEN");
  const channelId    = Deno.env.get("YOUTUBE_CHANNEL_ID");

  if (!clientId || !clientSecret || !refreshToken || !channelId) {
    console.error("[youtube-admin] YouTube secrets not configured:", {
      clientId: !!clientId, clientSecret: !!clientSecret,
      refreshToken: !!refreshToken, channelId: !!channelId,
    });
    return err(500, "YouTube credentials not configured.", cors);
  }

  // Diagnostics (no secret values logged)
  console.log("[youtube-admin] secrets ok — channelId:", channelId,
    "| clientId suffix:", clientId.slice(-12));

  // --- Parse body ---
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err(400, "Request body must be valid JSON.", cors); }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  const startDate = validateDate(body.startDate);
  const endDate   = validateDate(body.endDate);
  if (!startDate || !endDate) {
    return err(400, "startDate and endDate are required (YYYY-MM-DD).", cors);
  }

  // --- Get access token ---
  let token: string;
  try {
    token = await getAccessToken(clientId, clientSecret, refreshToken);
    console.log("[youtube-admin] token ok, action:", action, "dates:", startDate, "→", endDate);
  } catch (e) {
    return err(502, (e as Error).message, cors);
  }

  const dateParams = { startDate, endDate };

  // ---------------------------------------------------------------------------
  // overview — channel-level totals
  // ---------------------------------------------------------------------------
  if (action === "overview") {
    try {
      const rows = await runAnalyticsReport(token, channelId, {
        ...dateParams,
        metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",
      });

      const r = rows[0] ?? {};
      return ok({
        views:                    r.views                    ?? 0,
        estimatedMinutesWatched:  r.estimatedMinutesWatched  ?? 0,
        averageViewDuration:      r.averageViewDuration       ?? 0,
        subscribersGained:        r.subscribersGained         ?? 0,
        subscribersLost:          r.subscribersLost           ?? 0,
      }, cors);
    } catch (e) {
      console.error("[youtube-admin] overview:", (e as Error).message);
      return err(502, "YouTube overview failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // top_videos — top 10 videos by views with titles
  // ---------------------------------------------------------------------------
  if (action === "top_videos") {
    try {
      const rows = await runAnalyticsReport(token, channelId, {
        ...dateParams,
        dimensions: "video",
        metrics:    "views,estimatedMinutesWatched,averageViewDuration",
        sort:       "-views",
        maxResults: "10",
      });

      const videoIds = rows.map((r) => r.video as string).filter(Boolean);
      const titles   = await fetchVideoTitles(token, videoIds);

      const videos = rows.map((r) => ({
        id:                   r.video,
        title:                titles.get(r.video as string) ?? r.video,
        views:                r.views,
        estimatedMinutesWatched: r.estimatedMinutesWatched,
        averageViewDuration:  r.averageViewDuration,
      }));

      return ok({ videos }, cors);
    } catch (e) {
      console.error("[youtube-admin] top_videos:", (e as Error).message);
      return err(502, "YouTube top_videos failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // traffic_sources — views by how viewers found the video
  // ---------------------------------------------------------------------------
  if (action === "traffic_sources") {
    try {
      const rows = await runAnalyticsReport(token, channelId, {
        ...dateParams,
        dimensions: "trafficSourceType",
        metrics:    "views,estimatedMinutesWatched",
        sort:       "-views",
      });

      const sources = rows.map((r) => ({
        sourceType:  r.trafficSourceType,
        label:       TRAFFIC_SOURCE_LABELS[r.trafficSourceType as string] ?? `Source ${r.trafficSourceType}`,
        views:       r.views,
        estimatedMinutesWatched: r.estimatedMinutesWatched,
      }));

      return ok({ sources }, cors);
    } catch (e) {
      console.error("[youtube-admin] traffic_sources:", (e as Error).message);
      return err(502, "YouTube traffic_sources failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // Unknown action
  // ---------------------------------------------------------------------------
  return json(400, {
    success: false,
    error: "Unknown action.",
    valid_actions: ["overview", "top_videos", "traffic_sources"],
  }, cors);
});
