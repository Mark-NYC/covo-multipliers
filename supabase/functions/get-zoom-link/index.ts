import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

Deno.serve(async (req: Request) => {
  console.log("get-zoom-link request received", req.method, req.url);

  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const event = url.searchParams.get("event");
  console.log("get-zoom-link event", event);

  if (!event) {
    console.log("get-zoom-link event not provided");
    return new Response(
      JSON.stringify({ success: false, error: "Event parameter is required." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("get-zoom-link missing Supabase credentials");
      return new Response(
        JSON.stringify({ success: false, error: "Configuration error." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...cors },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("events")
      .select("zoom_link")
      .eq("slug", event)
      .eq("is_published", true)
      .single();

    if (error || !data) {
      console.log("get-zoom-link event not found or not published", event);
      return new Response(
        JSON.stringify({ success: false, error: "Lab event not found." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...cors },
        }
      );
    }

    const zoomLink = (data as { zoom_link: string | null }).zoom_link;
    const link = zoomLink && zoomLink.trim().length > 0 ? zoomLink.trim() : null;

    console.log("get-zoom-link returning zoom link", Boolean(link));
    return new Response(
      JSON.stringify({ success: true, zoomLink: link }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
          ...cors,
        },
      }
    );
  } catch (err) {
    console.error("get-zoom-link error", err);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to retrieve Zoom link." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }
});
