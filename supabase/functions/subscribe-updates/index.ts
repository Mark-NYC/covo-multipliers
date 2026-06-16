// supabase/functions/subscribe-updates/index.ts
//
// Covo Multipliers — Email Subscription Edge Function
//
// POST /functions/v1/subscribe-updates
// Body: { email, full_name?, utm_source?, utm_medium?, utm_campaign?,
//         utm_content?, utm_term?, landing_page?, referrer?,
//         latest_touch_at?, first_utm_source?, first_utm_medium?,
//         first_utm_campaign?, first_utm_content?, first_utm_term?,
//         first_landing_page?, first_referrer?, first_touch_at? }
//
// Upserts a row in the subscribers table.
// first_touch_at is written once and never overwritten on subsequent
// subscriptions (COALESCE guard in the upsert).
//
// Secrets (auto-injected by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
  "https://mark-nyc.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
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

function json(
  status: number,
  body: Record<string, unknown>,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeStr(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, maxLen) : null;
}

function safeTimestamp(v: unknown): string | null {
  const s = safeStr(v, 50);
  if (!s) return null;
  // Accept ISO 8601 strings only
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const emailStr = typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";

  if (!emailStr || !isEmail(emailStr) || emailStr.length > 254) {
    return json(400, { error: "Please enter a valid email address." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Check whether a row already exists so we can preserve first_touch_at
  const { data: existing } = await supabase
    .from("subscribers")
    .select("id, first_touch_at")
    .eq("email", emailStr)
    .maybeSingle();

  const now = new Date().toISOString();
  const isNew = !existing;

  // Only write first-touch fields on new rows (or if existing row has no first_touch_at)
  const hasExistingFirstTouch = existing?.first_touch_at != null;

  const row: Record<string, unknown> = {
    email: emailStr,
    full_name: safeStr(body.full_name, 200),
    subscribed: true,
    updated_at: now,
    // Latest-touch (always update)
    utm_source:    safeStr(body.utm_source, 100),
    utm_medium:    safeStr(body.utm_medium, 100),
    utm_campaign:  safeStr(body.utm_campaign, 200),
    utm_content:   safeStr(body.utm_content, 200),
    utm_term:      safeStr(body.utm_term, 200),
    landing_page:  safeStr(body.landing_page),
    referrer:      safeStr(body.referrer),
    latest_touch_at: safeTimestamp(body.latest_touch_at) ?? now,
  };

  // First-touch: only set if this is a new row or no first-touch was stored yet
  if (!hasExistingFirstTouch) {
    row.first_utm_source   = safeStr(body.first_utm_source, 100);
    row.first_utm_medium   = safeStr(body.first_utm_medium, 100);
    row.first_utm_campaign = safeStr(body.first_utm_campaign, 200);
    row.first_utm_content  = safeStr(body.first_utm_content, 200);
    row.first_utm_term     = safeStr(body.first_utm_term, 200);
    row.first_landing_page = safeStr(body.first_landing_page);
    row.first_referrer     = safeStr(body.first_referrer);
    row.first_touch_at     = safeTimestamp(body.first_touch_at) ?? (isNew ? now : null);
  }

  const { error: upsertError } = await supabase
    .from("subscribers")
    .upsert(row, { onConflict: "email" });

  if (upsertError) {
    console.error("[subscribe-updates] upsert error:", JSON.stringify(upsertError));
    return json(500, { error: "Subscription failed. Please try again." }, cors);
  }

  console.log(`[subscribe-updates] subscribed: ${emailStr} (${isNew ? "new" : "returning"})`);
  return json(200, { success: true }, cors);
});
