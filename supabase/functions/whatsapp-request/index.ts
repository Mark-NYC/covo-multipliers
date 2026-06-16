// supabase/functions/whatsapp-request/index.ts
//
// Covo Multipliers — WhatsApp Request Form Edge Function
//
// POST /functions/v1/whatsapp-request
// Body: { honeypot, first_name, last_name, phone, email, city,
//         church_org, lab_attended, consent }
//
// 1. Honeypot check
// 2. Validate required fields (first_name, phone, consent)
// 3. Insert row into whatsapp_requests
//
// Secrets (injected automatically):
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

const VALID_LABS = new Set([
  "How to Make Disciples Without Quitting Your Job",
  "Aquila & Priscilla Pattern",
  "Find Your Marketplace Field",
  "Rhythms of a Covo Multiplier",
  "From Lost to Leader",
  "Six-Week Multiplier Plan",
  "Other",
]);

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

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

function getClientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    null
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
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

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." }, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { success: false, error: "Invalid request." }, cors);
  }

  const {
    honeypot,
    first_name,
    last_name,
    phone,
    email,
    city,
    church_org,
    lab_attended,
    consent,
  } = body;

  function safeAttr(v: unknown, maxLen = 500): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t.slice(0, maxLen) : null;
  }
  function safeTs(v: unknown): string | null {
    const s = safeAttr(v, 50);
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Honeypot: silently succeed so bots can't tell they were blocked
  if (typeof honeypot === "string" && honeypot.trim().length > 0) {
    return json(200, { success: true }, cors);
  }

  // Validate first_name (required)
  const firstNameStr = typeof first_name === "string" ? first_name.trim() : "";
  if (firstNameStr.length < 2 || firstNameStr.length > 100) {
    return json(
      400,
      { success: false, error: "Please enter your first name (2–100 characters)." },
      cors,
    );
  }

  // Validate phone (required)
  const phoneStr = typeof phone === "string" ? phone.trim() : "";
  const phoneDigits = phoneStr.replace(/\D/g, "");
  if (phoneStr.length < 7 || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return json(
      400,
      { success: false, error: "Please enter a valid mobile number with country code." },
      cors,
    );
  }

  // Validate consent (required)
  if (consent !== true) {
    return json(
      400,
      { success: false, error: "Consent is required to continue." },
      cors,
    );
  }

  // Optional fields with light sanitisation
  const lastNameStr  = typeof last_name  === "string" ? last_name.trim().slice(0, 100)  : null;
  const cityStr      = typeof city       === "string" ? city.trim().slice(0, 100)       : null;
  const churchStr    = typeof church_org === "string" ? church_org.trim().slice(0, 200) : null;

  let emailStr: string | null = null;
  if (typeof email === "string" && email.trim().length > 0) {
    const e = email.trim().toLowerCase();
    if (!isEmail(e) || e.length > 254) {
      return json(
        400,
        { success: false, error: "Please enter a valid email address, or leave it blank." },
        cors,
      );
    }
    emailStr = e;
  }

  let labStr: string | null = null;
  if (typeof lab_attended === "string" && lab_attended.trim().length > 0) {
    if (!VALID_LABS.has(lab_attended.trim())) {
      return json(
        400,
        { success: false, error: "Please select a valid lab." },
        cors,
      );
    }
    labStr = lab_attended.trim();
  }

  // Rate limiting
  const ip = getClientIp(req);
  if (ip !== null && !checkRateLimit(ip)) {
    return json(200, { success: true }, cors); // soft-succeed
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { error: insertError } = await supabase
    .from("whatsapp_requests")
    .insert({
      first_name:   firstNameStr,
      last_name:    lastNameStr,
      phone:        phoneStr,
      email:        emailStr,
      city:         cityStr,
      church_org:   churchStr,
      lab_attended: labStr,
      consent:      true,
      ip_address:   ip,
      user_agent:   req.headers.get("user-agent") ?? null,
      utm_source:    safeAttr(body.utm_source, 100),
      utm_medium:    safeAttr(body.utm_medium, 100),
      utm_campaign:  safeAttr(body.utm_campaign, 200),
      utm_content:   safeAttr(body.utm_content, 200),
      utm_term:      safeAttr(body.utm_term, 200),
      landing_page:  safeAttr(body.landing_page),
      referrer:      safeAttr(body.referrer),
      latest_touch_at: safeTs(body.latest_touch_at),
      first_utm_source:   safeAttr(body.first_utm_source, 100),
      first_utm_medium:   safeAttr(body.first_utm_medium, 100),
      first_utm_campaign: safeAttr(body.first_utm_campaign, 200),
      first_utm_content:  safeAttr(body.first_utm_content, 200),
      first_utm_term:     safeAttr(body.first_utm_term, 200),
      first_landing_page: safeAttr(body.first_landing_page),
      first_referrer:     safeAttr(body.first_referrer),
      first_touch_at:     safeTs(body.first_touch_at),
    });

  if (insertError) {
    console.error("DB insert failed:", insertError);
    return json(500, { success: false, error: "Something went wrong. Please try again." }, cors);
  }

  console.log(`WhatsApp request submitted: ${firstNameStr} (${phoneStr})`);
  return json(200, { success: true }, cors);
});
