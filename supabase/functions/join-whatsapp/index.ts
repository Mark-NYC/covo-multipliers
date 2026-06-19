// supabase/functions/join-whatsapp/index.ts
//
// GET /functions/v1/join-whatsapp?utm_source=...&utm_medium=...&utm_campaign=...
//
// 1. Read UTMs from the incoming query string
// 2. Log the click to whatsapp_link_clicks (try/catch — never blocks redirect)
// 3. 302 redirect to WHATSAPP_INVITE_URL (set via: supabase secrets set WHATSAPP_INVITE_URL='...')
//
// Deploy: supabase functions deploy join-whatsapp --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request): Promise<Response> => {
  const inviteUrl = Deno.env.get("WHATSAPP_INVITE_URL");

  if (!inviteUrl) {
    console.error("WHATSAPP_INVITE_URL secret is not set");
    return new Response("WhatsApp invite URL not configured.", { status: 503 });
  }

  const url = new URL(req.url);
  const p   = url.searchParams;

  // Log the click — wrapped in try/catch so a DB failure never blocks the redirect
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")              ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("whatsapp_link_clicks").insert({
      utm_source:   p.get("utm_source"),
      utm_medium:   p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_content:  p.get("utm_content"),
      utm_term:     p.get("utm_term"),
      referrer:     req.headers.get("referer") ?? null,
      user_agent:   req.headers.get("user-agent") ?? null,
      ip_address:
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        null,
    });

    if (error) console.error("Click logging failed:", error);
  } catch (err) {
    console.error("Click logging threw:", err);
    // Never rethrow — the redirect below always executes
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Location":      inviteUrl,
      "Cache-Control": "no-store, no-cache",
    },
  });
});
