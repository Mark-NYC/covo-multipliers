// supabase/functions/shortlink-redirect/index.ts
//
// Redirect from shortlink to long URL
// Called by middleware or custom routing
//
// GET /functions/v1/shortlink-redirect?code=abc123
//
// Returns: 302 redirect to long_url

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function redirectShortlink(
  code: string,
  supabase: ReturnType<typeof createClient>
): Promise<Response> {
  if (!code || typeof code !== "string") {
    return new Response("Short code is required", { status: 400 });
  }

  try {
    // Fetch the shortlink
    const { data, error } = await supabase
      .from("shortlinks")
      .select("long_url, click_count")
      .eq("short_code", code)
      .single();

    if (error || !data) {
      return new Response("Shortlink not found", { status: 404 });
    }

    // Update click count asynchronously
    supabase
      .from("shortlinks")
      .update({
        click_count: (data.click_count || 0) + 1,
        last_clicked_at: new Date().toISOString(),
      })
      .eq("short_code", code)
      .then()
      .catch((err) => console.error("Failed to update click count:", err));

    // Redirect to the long URL
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.long_url,
      },
    });
  } catch (err) {
    console.error("Error redirecting shortlink:", err);
    return new Response("Server error", { status: 500 });
  }
}

export default async function handler(req: Request): Promise<Response> {
  // Get short code from query parameter
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials");
    return new Response("Server configuration error", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  return redirectShortlink(code || "", supabase);
}
