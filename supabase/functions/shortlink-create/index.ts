// supabase/functions/shortlink-create/index.ts
//
// Create a new shortlink
//
// POST /functions/v1/shortlink-create
// Body: { long_url: string }
//
// Returns: { short_code, short_url, long_url, created_at }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

const BASE_DOMAIN = "https://covomultipliers.com";

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
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function generateShortCode(): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    const body = await req.json();
    const { long_url } = body;

    if (!long_url || typeof long_url !== "string") {
      return json(
        400,
        { error: "long_url is required and must be a string" },
        cors
      );
    }

    // Basic URL validation
    try {
      new URL(long_url);
    } catch (err) {
      return json(400, { error: "Invalid URL format" }, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase credentials");
      return json(500, { error: "Server configuration error" }, cors);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate unique short code
    let short_code = "";
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      short_code = generateShortCode();
      const { data: existing } = await supabase
        .from("shortlinks")
        .select("short_code")
        .eq("short_code", short_code)
        .single();

      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return json(
        500,
        { error: "Failed to generate unique short code" },
        cors
      );
    }

    // Insert shortlink
    const { data, error } = await supabase
      .from("shortlinks")
      .insert({
        short_code,
        long_url,
        metadata: {
          user_agent: req.headers.get("user-agent"),
          created_ip: req.headers.get("x-forwarded-for"),
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return json(500, { error: "Failed to create shortlink" }, cors);
    }

    return json(
      201,
      {
        short_code: data.short_code,
        short_url: `${BASE_DOMAIN}/s/${data.short_code}`,
        long_url: data.long_url,
        created_at: data.created_at,
      },
      cors
    );
  } catch (err) {
    console.error("Error creating shortlink:", err);
    return json(500, { error: "Server error" }, cors);
  }
});
