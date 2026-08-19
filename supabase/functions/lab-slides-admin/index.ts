// supabase/functions/lab-slides-admin/index.ts
//
// Lab slide-deck editor — lets an allow-listed admin set each lab's
// slides_url (the "Slides" link shown on the /labs planner) without SQL.
//
//   GET  /functions/v1/lab-slides-admin           -> list all published labs
//   POST /functions/v1/lab-slides-admin           -> { id, slides_url }
//   Headers: Authorization: Bearer <access_token>
//
// Same auth model as lab-admin: verify the caller's Supabase JWT, then
// require their email to be in the LAB_ADMIN_EMAILS allowlist. Writes go
// through the service-role client (anon/authenticated have no write policy
// on public.events, by design), so this function is the only path that can
// change slides_url. JWT verification is enabled by default on deploy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL_LEN = 2048;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function jsonResp(status: number, data: unknown, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// Returns the cleaned slides_url (string) or null, or throws a message string
// when the input is not an acceptable value.
function normalizeSlidesUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") throw "slides_url must be a string or null.";
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > MAX_URL_LEN) throw "slides_url is too long.";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw "slides_url must be a valid URL (starting with https://).";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw "slides_url must be an http(s) link.";
  }
  return trimmed;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed" }, cors);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResp(401, { error: "Missing Authorization header" }, cors);
  }
  const token = authHeader.substring("Bearer ".length);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller's JWT.
  const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await supabasePublic.auth.getUser(token);
  if (authError || !authData.user) {
    console.warn("[lab-slides-admin] JWT verification failed:", authError?.message);
    return jsonResp(401, { error: "Unauthorized" }, cors);
  }

  // Allowlist check.
  const allowListEnv = Deno.env.get("LAB_ADMIN_EMAILS") || "";
  const allowList = allowListEnv.split(",").map((e) => e.trim()).filter((e) => e);
  const userEmail = authData.user.email;
  if (!userEmail || !allowList.includes(userEmail)) {
    console.warn(`[lab-slides-admin] forbidden — ${userEmail} not in allowlist`);
    return jsonResp(403, { error: "Forbidden" }, cors);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (req.method === "GET") {
      // Every published lab, most recent first (past labs — the ones that
      // usually have decks — surface at the top).
      const { data, error } = await supabaseAdmin
        .from("events")
        .select("id, slug, title, event_date, landing_path, slides_url")
        .eq("is_published", true)
        .order("event_date", { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResp(200, { labs: data ?? [] }, cors);
    }

    // POST — update one lab's slides_url.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResp(400, { error: "Invalid JSON body." }, cors);
    }

    const id = body.id;
    if (typeof id !== "string" || !UUID_RE.test(id)) {
      return jsonResp(400, { error: "A valid lab id is required." }, cors);
    }

    let slidesUrl: string | null;
    try {
      slidesUrl = normalizeSlidesUrl(body.slides_url);
    } catch (msg) {
      return jsonResp(400, { error: typeof msg === "string" ? msg : "Invalid slides_url." }, cors);
    }

    const { data, error } = await supabaseAdmin
      .from("events")
      .update({ slides_url: slidesUrl })
      .eq("id", id)
      .select("id, slug, title, event_date, landing_path, slides_url")
      .single();

    if (error) throw new Error(error.message);
    if (!data) return jsonResp(404, { error: "Lab not found." }, cors);

    return jsonResp(200, { lab: data }, cors);
  } catch (err) {
    console.error("[lab-slides-admin] error:", err);
    return jsonResp(500, { error: err instanceof Error ? err.message : "Internal server error" }, cors);
  }
});
