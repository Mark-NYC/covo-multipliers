// supabase/functions/ga4-admin/index.ts
//
// Covo Multipliers — GA4 Data API proxy for the operating dashboard.
//
// POST /functions/v1/ga4-admin
// Header: x-admin-secret: <ADMIN_ANALYTICS_SECRET>
// Body:   { action, startDate, endDate }
//         startDate / endDate: "YYYY-MM-DD"
//
// Supported actions:
//   overview        — aggregate totals for the date range
//   traffic_sources — sessions by sessionSource / sessionMedium
//   landing_pages   — sessions by landingPagePlusQueryString
//   page_paths      — pageViews by pagePathPlusQueryString
//   campaigns       — sessions by sessionCampaignName / source / medium
//   events          — eventCount for the 9 named CoVo events
//
// Required secrets (supabase secrets set KEY=value):
//   ADMIN_ANALYTICS_SECRET  — shared secret (same as analytics-admin)
//   GA4_PROPERTY_ID         — numeric property ID, e.g. 542284522
//   GA4_CLIENT_EMAIL        — service account email
//   GA4_PRIVATE_KEY         — PKCS8 PEM private key (literal \n or real newlines both work)
//
// No GA credentials are returned to the caller.
// No PII is requested or logged.

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
// Google OAuth2: JWT → access token
// ---------------------------------------------------------------------------
function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64url(data: unknown): string {
  return btoa(JSON.stringify(data))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const enc = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(normalizePem(privateKeyPem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(signingInput),
  );

  const sigBytes = new Uint8Array(sigBuf);
  let binary = "";
  sigBytes.forEach((b) => (binary += String.fromCharCode(b)));
  const sig = btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => "(unreadable)");
    // Strip anything that looks like a key/credential from the log
    const safeBody = errBody.replace(/assertion=[^&\s]*/g, "assertion=REDACTED");
    console.error("[ga4-admin] Token exchange failed:", tokenRes.status, safeBody.substring(0, 400));
    throw new Error(`Google token exchange failed (${tokenRes.status}).`);
  }

  const { access_token } = await tokenRes.json();
  return access_token as string;
}

// ---------------------------------------------------------------------------
// GA4 Data API
// ---------------------------------------------------------------------------
interface Ga4Row {
  [key: string]: string | number;
}

interface Ga4Result {
  summary?: Record<string, number>;
  rows: Ga4Row[];
  rowCount?: number;
}

async function runReport(
  token: string,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<Ga4Result> {
  const url =
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "(unreadable)");
    console.error("[ga4-admin] GA4 API error:", res.status, errBody.substring(0, 600));
    throw new Error(`GA4 API returned ${res.status}: ${errBody.substring(0, 200)}`);
  }

  // deno-lint-ignore no-explicit-any
  const report: any = await res.json();

  const dimHeaders: string[] = (report.dimensionHeaders ?? []).map(
    // deno-lint-ignore no-explicit-any
    (h: any) => h.name as string,
  );
  const metHeaders: string[] = (report.metricHeaders ?? []).map(
    // deno-lint-ignore no-explicit-any
    (h: any) => h.name as string,
  );

  // deno-lint-ignore no-explicit-any
  const rows: Ga4Row[] = (report.rows ?? []).map((row: any) => {
    const r: Ga4Row = {};
    (row.dimensionValues ?? []).forEach(
      // deno-lint-ignore no-explicit-any
      (v: any, i: number) => (r[dimHeaders[i]] = v.value as string),
    );
    (row.metricValues ?? []).forEach(
      // deno-lint-ignore no-explicit-any
      (v: any, i: number) => (r[metHeaders[i]] = parseFloat(v.value) || 0),
    );
    return r;
  });

  let summary: Record<string, number> | undefined;
  if (report.totals?.length) {
    summary = {};
    // deno-lint-ignore no-explicit-any
    (report.totals[0].metricValues ?? []).forEach((v: any, i: number) => {
      summary![metHeaders[i]] = parseFloat(v.value) || 0;
    });
  }

  return { summary, rows, rowCount: report.rowCount ?? rows.length };
}

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
    console.error("[ga4-admin] ADMIN_ANALYTICS_SECRET not set");
    return err(500, "Server configuration error.", cors);
  }

  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  if (!secretsEqual(providedSecret, expectedSecret)) {
    return err(401, "Unauthorized.", cors);
  }

  // --- GA4 credentials ---
  const propertyId   = Deno.env.get("GA4_PROPERTY_ID");
  const clientEmail  = Deno.env.get("GA4_CLIENT_EMAIL");
  const privateKey   = Deno.env.get("GA4_PRIVATE_KEY");

  if (!propertyId || !clientEmail || !privateKey) {
    console.error("[ga4-admin] GA4 secrets not configured:",
      { propertyId: !!propertyId, clientEmail: !!clientEmail, privateKey: !!privateKey });
    return err(500, "GA4 credentials not configured.", cors);
  }

  // Diagnostics: confirm secrets are present without logging values
  console.log("[ga4-admin] secrets ok — propertyId:", propertyId,
    "| clientEmail suffix:", clientEmail.slice(-30),
    "| privateKey length:", privateKey.length);

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(400, "Request body must be valid JSON.", cors);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  const startDate = validateDate(body.startDate);
  const endDate   = validateDate(body.endDate);
  if (!startDate || !endDate) {
    return err(400, "startDate and endDate are required (YYYY-MM-DD).", cors);
  }

  const dateRange = { startDate, endDate };

  // --- Get Google access token ---
  let token: string;
  try {
    token = await getAccessToken(clientEmail, privateKey);
    console.log("[ga4-admin] token exchange ok, action:", action, "dates:", startDate, "→", endDate);
  } catch (e) {
    return err(502, (e as Error).message, cors);
  }

  // ---------------------------------------------------------------------------
  // overview — aggregate totals, no dimensions
  // ---------------------------------------------------------------------------
  if (action === "overview") {
    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        metrics: [
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
        ],
        metricAggregations: ["TOTAL"],
        keepEmptyRows: false,
      });
      return ok({ summary: result.summary ?? {} }, cors);
    } catch (e) {
      console.error("[ga4-admin] overview:", (e as Error).message);
      return err(502, "GA4 overview failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // traffic_sources — by sessionSource / sessionMedium
  // ---------------------------------------------------------------------------
  if (action === "traffic_sources") {
    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "newUsers" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      });
      return ok({ rows: result.rows }, cors);
    } catch (e) {
      console.error("[ga4-admin] traffic_sources:", (e as Error).message);
      return err(502, "GA4 traffic_sources failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // landing_pages — by landingPagePlusQueryString
  // ---------------------------------------------------------------------------
  if (action === "landing_pages") {
    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
          { name: "screenPageViews" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      });
      return ok({ rows: result.rows }, cors);
    } catch (e) {
      console.error("[ga4-admin] landing_pages:", (e as Error).message);
      return err(502, "GA4 landing_pages failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // page_paths — by pagePathPlusQueryString
  // ---------------------------------------------------------------------------
  if (action === "page_paths") {
    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "pagePathPlusQueryString" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "activeUsers" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 50,
      });
      return ok({ rows: result.rows }, cors);
    } catch (e) {
      console.error("[ga4-admin] page_paths:", (e as Error).message);
      return err(502, "GA4 page_paths failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // campaigns — by sessionCampaignName / sessionSource / sessionMedium
  // ---------------------------------------------------------------------------
  if (action === "campaigns") {
    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: [
          { name: "sessionCampaignName" },
          { name: "sessionSource" },
          { name: "sessionMedium" },
        ],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "newUsers" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      });
      return ok({ rows: result.rows }, cors);
    } catch (e) {
      console.error("[ga4-admin] campaigns:", (e as Error).message);
      return err(502, "GA4 campaigns failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // events — eventCount for the 9 named CoVo events
  // ---------------------------------------------------------------------------
  if (action === "events") {
    const COVO_EVENTS = [
      "click",
      "form_start",
      "form_submit",
      "generate_lead",
      "sign_up",
      "outbound_click",
      "whatsapp_click",
      "youtube_click",
      "spotify_click",
      "substack_click",
    ];

    try {
      const result = await runReport(token, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            inListFilter: { values: COVO_EVENTS },
          },
        },
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        keepEmptyRows: false,
      });

      // Return all matched events; zero-fill missing ones
      const found = new Map<string, number>(
        result.rows.map((r) => [r.eventName as string, r.eventCount as number]),
      );
      const rows = COVO_EVENTS.map((name) => ({
        eventName: name,
        eventCount: found.get(name) ?? 0,
      }));

      return ok({ rows }, cors);
    } catch (e) {
      console.error("[ga4-admin] events:", (e as Error).message);
      return err(502, "GA4 events failed.", cors);
    }
  }

  // ---------------------------------------------------------------------------
  // Unknown action
  // ---------------------------------------------------------------------------
  return json(400, {
    success: false,
    error: "Unknown action.",
    valid_actions: ["overview", "traffic_sources", "landing_pages", "page_paths", "campaigns", "events"],
  }, cors);
});
