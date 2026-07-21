// supabase/functions/register/handler.ts
//
// Covo Multipliers — Event Registration handler + dependency wiring.
// The deployable entrypoint is index.ts, which calls createHandler(buildRealDeps()).
//
// POST /functions/v1/register
// Body: { event_id, name, email, turnstile_token,
//         marketing_opt_in?, marketing_consent_copy?, company_website? (honeypot),
//         ...UTM attribution... }
//
// Pipeline (spam controls run BEFORE any DB write or email so rejected
// submissions never create a registration, never send email, and never
// increase signup totals):
//   1. Honeypot check          → silent success (bot can't tell it was caught)
//   2. Origin check            → reject clearly-unauthorized browser origins
//   3. Field validation        → event_id / name / email
//   4. Turnstile verification  → primary control, server-side, fails closed
//   5. Layered rate limiting   → IP-hash + email-hash + per-event, DB-backed
//   6. register_for_event() RPC (atomic capacity + deduplication)
//   7. Attribution + consent write
//   8. Confirmation email (Resend)
//   9. Admin signup notification (optional)
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY        — from resend.com dashboard
//   RESEND_FROM_EMAIL     — verified sender, e.g. labs@covomultipliers.com
//   ADMIN_NOTIFY_EMAILS   — optional, comma-separated admin notification addresses
//   TURNSTILE_SECRET_KEY  — Cloudflare Turnstile secret. When set, Turnstile is
//                           ENFORCED (missing/invalid token is rejected). When
//                           unset, verification is skipped so the site keeps
//                           working during rollout (a loud warning is logged).
//   TURNSTILE_DEV_BYPASS  — "true" to skip Turnstile locally without a secret.
//                           NEVER set this in production.
//   IP_HASH_SALT          — salt for hashing IPs/emails in the audit log.
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  type CountRecentFn,
  getClientIp,
  hashEmail,
  hashIp,
  isHoneypotFilled,
  isOriginAllowed,
  readTurnstileEnv,
  type RejectionCategory,
  type TurnstileEnv,
  type TurnstileResult,
  validateEmail,
  validateName,
  verifyTurnstile,
} from "../_shared/spamProtection.ts";

// ---------------------------------------------------------------------------
// CORS / allowed submission origins
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
  // Multiplying Disciples' homepage embeds the shared lab registration widget
  // (see embeds/lab-registration-widget.js), submitting to this same endpoint.
  // NOTE: if that embed is ever removed and multiplyingdisciples.us only *links*
  // to CoVo lab pages, these two entries can be dropped — links submit from the
  // covomultipliers.com origin, not from multiplyingdisciples.us.
  "https://multiplyingdisciples.us",
  "https://www.multiplyingdisciples.us",
  // Pre-launch Vercel preview domain for Multiplying Disciples.
  "https://multiplying-disciples.vercel.app",
  // Local / preview development origins already used by the project.
  "https://mark-nyc.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
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

// Generic, human error copy. Never reveals which control tripped.
const ERR_TURNSTILE = "We couldn't verify your submission. Please try again.";
const ERR_RATE_LIMITED =
  "We've received a lot of requests from your network. Please wait a few minutes and try again.";
const ERR_ORIGIN = "This request could not be processed.";
const SUCCESS_MESSAGE =
  "You're registered! Check your inbox for a confirmation email.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RpcResult {
  success: boolean;
  error?: "event_not_found" | "already_registered" | "event_full";
  registration_id?: string;
  reactivated?: boolean;
  event_title?: string;
  event_date?: string;
  zoom_link?: string | null;
  seats_remaining?: number;
}

interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string | null;
  referrer: string | null;
  latest_touch_at: string | null;
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
  first_utm_content: string | null;
  first_utm_term: string | null;
  first_landing_page: string | null;
  first_referrer: string | null;
  first_touch_at: string | null;
}

interface Consent {
  marketing_opt_in: boolean;
  marketing_consent_at: string | null;
  marketing_consent_copy: string | null;
}

function safeStr(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t.slice(0, maxLen) : null;
}

function safeTimestamp(v: unknown): string | null {
  const s = safeStr(v, 50);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function extractAttribution(body: Record<string, unknown>): Attribution {
  return {
    utm_source:    safeStr(body.utm_source, 100),
    utm_medium:    safeStr(body.utm_medium, 100),
    utm_campaign:  safeStr(body.utm_campaign, 200),
    utm_content:   safeStr(body.utm_content, 200),
    utm_term:      safeStr(body.utm_term, 200),
    landing_page:  safeStr(body.landing_page),
    referrer:      safeStr(body.referrer),
    latest_touch_at: safeTimestamp(body.latest_touch_at),
    first_utm_source:   safeStr(body.first_utm_source, 100),
    first_utm_medium:   safeStr(body.first_utm_medium, 100),
    first_utm_campaign: safeStr(body.first_utm_campaign, 200),
    first_utm_content:  safeStr(body.first_utm_content, 200),
    first_utm_term:     safeStr(body.first_utm_term, 200),
    first_landing_page: safeStr(body.first_landing_page),
    first_referrer:     safeStr(body.first_referrer),
    first_touch_at:     safeTimestamp(body.first_touch_at),
  };
}

// The exact consent disclosure shown to users on all lab registration pages.
// This constant is authoritative — the client-provided value is never trusted.
const MARKETING_CONSENT_COPY_V1 =
  "Yes, email me about future CoVo Multipliers labs, resources, and training. I can unsubscribe at any time.";

export function extractConsent(body: Record<string, unknown>): Consent {
  const optIn = body.marketing_opt_in === true;
  if (!optIn) {
    return { marketing_opt_in: false, marketing_consent_at: null, marketing_consent_copy: null };
  }
  return {
    marketing_opt_in: true,
    marketing_consent_at: new Date().toISOString(),
    marketing_consent_copy: MARKETING_CONSENT_COPY_V1,
  };
}

// ---------------------------------------------------------------------------
// Dependency-injected handler (so the full flow is testable without a real DB,
// network, or email provider). buildRealDeps() wires the production deps.
// ---------------------------------------------------------------------------
export interface SecurityEvent {
  ipHash: string | null;
  emailHash: string | null;
  eventId: string | null;
  outcome: RejectionCategory | "accepted";
  detail?: string | null;
}

export interface RegisterDeps {
  turnstileEnv: TurnstileEnv;
  hashSalt: string | undefined;
  verifyTurnstileFn: (
    token: unknown,
    ip: string | null,
    env: TurnstileEnv,
  ) => Promise<TurnstileResult>;
  countRecent: CountRecentFn;
  recordSecurityEvent: (e: SecurityEvent) => Promise<void>;
  registerForEvent: (args: {
    event_id: string;
    name: string;
    email: string;
  }) => Promise<{ data: unknown; error: unknown }>;
  updateRegistration: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<{ error: unknown }>;
  fetchEventSlug: (eventId: string) => Promise<string | null>;
  countActiveRegistrations: (eventId: string) => Promise<number | null>;
  sendConfirmationEmail: (args: SendEmailArgs) => Promise<string | null>;
  sendAdminNotification: (args: AdminNotifyArgs) => Promise<void>;
  adminEmails: string[];
}

export function createHandler(deps: RegisterDeps) {
  return async function handler(req: Request): Promise<Response> {
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

    const ip = getClientIp(req);
    const ipHash = await hashIp(ip, deps.hashSalt);
    const origin = req.headers.get("Origin");
    const eventIdRaw = body.event_id;
    const eventIdForLog =
      typeof eventIdRaw === "string" && isUuid(eventIdRaw) ? eventIdRaw : null;

    // -- 1. Honeypot: return a normal-looking success without doing anything. --
    if (isHoneypotFilled(body)) {
      await deps.recordSecurityEvent({
        ipHash, emailHash: null, eventId: eventIdForLog,
        outcome: "honeypot_filled",
      });
      // Same shape as the real success response so the bot can't distinguish it.
      return json(200, { success: true, message: SUCCESS_MESSAGE, seats_remaining: null }, cors);
    }

    // -- 2. Origin: reject clearly-unauthorized browser origins (secondary). --
    if (!isOriginAllowed(origin, ALLOWED_ORIGINS)) {
      await deps.recordSecurityEvent({
        ipHash, emailHash: null, eventId: eventIdForLog,
        outcome: "invalid_origin", detail: safeStr(origin, 100),
      });
      return json(403, { error: ERR_ORIGIN }, cors);
    }

    // -- 3. Field validation. --
    if (typeof eventIdRaw !== "string" || !isUuid(eventIdRaw)) {
      return json(400, { error: "A valid event_id is required." }, cors);
    }
    const event_id = eventIdRaw;

    const nameResult = validateName(body.name);
    if (!nameResult.ok) {
      await deps.recordSecurityEvent({
        ipHash, emailHash: null, eventId: event_id,
        outcome: "invalid_name", detail: nameResult.reason ?? null,
      });
      return json(400, { error: "Please enter your full name." }, cors);
    }
    const cleanName = nameResult.name!;

    const emailResult = validateEmail(body.email);
    if (!emailResult.ok) {
      await deps.recordSecurityEvent({
        ipHash, emailHash: null, eventId: event_id,
        outcome: "invalid_email",
      });
      return json(400, { error: "Please enter a valid email address." }, cors);
    }
    const cleanEmail = emailResult.email!;
    const emailHash = await hashEmail(cleanEmail, deps.hashSalt);

    // -- 4. Turnstile verification (primary control). --
    const ts = await deps.verifyTurnstileFn(body.turnstile_token, ip, deps.turnstileEnv);
    if (ts.skipped && ts.reason === "unconfigured") {
      console.warn(
        "[register] TURNSTILE NOT CONFIGURED — registrations are not protected by Turnstile. Set TURNSTILE_SECRET_KEY to enforce.",
      );
    }
    if (!ts.ok) {
      await deps.recordSecurityEvent({
        ipHash, emailHash, eventId: event_id,
        outcome: "turnstile_failed", detail: ts.reason ?? null,
      });
      return json(400, { error: ERR_TURNSTILE }, cors);
    }

    // -- 5. Layered rate limiting (DB-backed, generous, IP+email+event). --
    const rl = await checkRateLimit(
      { ipHash, emailHash, eventId: event_id },
      deps.countRecent,
    );
    if (rl.limited) {
      await deps.recordSecurityEvent({
        ipHash, emailHash, eventId: event_id,
        outcome: "rate_limited", detail: rl.layer ?? null,
      });
      return json(429, { error: ERR_RATE_LIMITED }, cors);
    }

    // -- 6. Everything below is unchanged registration business logic. --
    const attribution = extractAttribution(body);
    const consent = extractConsent(body);
    const eventSlug = safeSlug(body.event_slug);

    console.log(`[register] calling register_for_event RPC for event=${event_id} email=${cleanEmail}`);
    const { data, error: rpcError } = await deps.registerForEvent({
      event_id, name: cleanName, email: cleanEmail,
    });

    if (rpcError) {
      console.error("[register] RPC error:", JSON.stringify(rpcError));
      return json(500, { error: "Registration failed. Please try again." }, cors);
    }

    const result = data as RpcResult;
    console.log("[register] RPC result:", JSON.stringify(result));

    if (!result.success) {
      switch (result.error) {
        case "event_not_found":
          return json(404, { error: "This event could not be found or is no longer available." }, cors);
        case "already_registered":
          return json(409, { error: "This email address is already registered for this event." }, cors);
        case "event_full":
          return json(409, { error: "This event is full. No seats are remaining." }, cors);
        default:
          console.error("[register] unexpected RPC result:", JSON.stringify(result));
          return json(500, { error: "Registration failed. Please try again." }, cors);
      }
    }

    if (!result.registration_id) {
      console.error("[register] registration_id missing from RPC result — cannot save attribution or consent.");
      return json(500, { error: "Registration was created but could not be completed. Please contact us." }, cors);
    }

    // Log the accepted attempt (feeds rate-limit accounting + audit trail).
    await deps.recordSecurityEvent({
      ipHash, emailHash, eventId: event_id, outcome: "accepted",
    });

    // Phase 1: attribution + consent.
    const { error: attrConsentErr } = await deps.updateRegistration(
      result.registration_id, { ...attribution, ...consent },
    );
    if (attrConsentErr) {
      console.error(`[register] attribution/consent update FAILED for registration_id=${result.registration_id}:`, JSON.stringify(attrConsentErr));
      return json(500, { error: "Registration was created but could not be completed. Please contact us." }, cors);
    }
    console.log(`[register] attribution and consent saved. opt_in=${consent.marketing_opt_in} consent_at=${consent.marketing_consent_at ?? "null"}`);

    // Canonical DB slug for the branded join-lab redirect.
    const dbSlug = await deps.fetchEventSlug(event_id);
    console.log(`[register] fetched canonical event slug for join-lab redirect: ${dbSlug ?? "MISSING"}`);

    // Phase 2: confirmation email (non-fatal).
    console.log(`[register] attempting confirmation email to=${cleanEmail} event="${result.event_title}"`);
    const resendMessageId = await deps.sendConfirmationEmail({
      to: cleanEmail,
      toName: cleanName,
      eventTitle: result.event_title!,
      eventDate: result.event_date!,
      zoomLink: result.zoom_link ?? null,
      pageSlug: eventSlug,
      dbSlug,
      originAttribution: attribution,
    });
    console.log(`[register] Resend result: ${resendMessageId ? `sent, id=${resendMessageId}` : "FAILED — email not sent"}`);

    // Phase 3: record confirmation_sent_at.
    if (resendMessageId) {
      const { error: confirmErr } = await deps.updateRegistration(
        result.registration_id, { confirmation_sent_at: new Date().toISOString() },
      );
      if (confirmErr) {
        console.error("[register] confirmation_sent_at update FAILED:", JSON.stringify(confirmErr));
      } else {
        console.log("[register] confirmation_sent_at updated successfully");
      }
    } else {
      console.warn("[register] skipping confirmation_sent_at update — email was not sent");
    }

    // Phase 4: admin signup notification (fully non-blocking).
    try {
      if (deps.adminEmails.length > 0) {
        const activeCount = await deps.countActiveRegistrations(event_id);
        await deps.sendAdminNotification({
          adminEmails: deps.adminEmails,
          registrantName: cleanName,
          registrantEmail: cleanEmail,
          eventTitle: result.event_title ?? "(unknown lab)",
          eventDate: result.event_date ?? "",
          totalSignups: activeCount,
          reactivated: result.reactivated === true,
          firstSource: attribution.first_utm_source ?? attribution.utm_source,
          firstLandingPage: attribution.first_landing_page,
        });
      }
    } catch (err) {
      console.error("[register] admin notification failed (non-fatal):", err);
    }

    return json(200, {
      success: true,
      message: SUCCESS_MESSAGE,
      seats_remaining: result.seats_remaining ?? null,
    }, cors);
  };
}

// ---------------------------------------------------------------------------
// Production dependency wiring
// ---------------------------------------------------------------------------
export function buildRealDeps(): RegisterDeps {
  const supabase: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const hashSalt = Deno.env.get("IP_HASH_SALT");
  if (!hashSalt) {
    console.warn(
      "[register] IP_HASH_SALT is not set — audit-log hashes use a known development salt. Set IP_HASH_SALT for production.",
    );
  }
  const adminEmails = (Deno.env.get("ADMIN_NOTIFY_EMAILS") ?? "")
    .split(",").map((e) => e.trim()).filter((e) => e.length > 0);

  const countRecent: CountRecentFn = async ({ key, value, sinceMs, eventId }) => {
    const since = new Date(Date.now() - sinceMs).toISOString();
    let q = supabase
      .from("registration_security_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq(key, value);
    if (eventId) q = q.eq("event_id", eventId);
    const { count, error } = await q;
    if (error) {
      // Fail open on a counting error — never block a legit user because the
      // audit table hiccuped. Turnstile remains the primary control.
      console.error("[register] rate-limit count error:", JSON.stringify(error));
      return 0;
    }
    return count ?? 0;
  };

  const recordSecurityEvent = async (e: SecurityEvent): Promise<void> => {
    try {
      await supabase.from("registration_security_events").insert({
        ip_hash: e.ipHash,
        email_hash: e.emailHash,
        event_id: e.eventId,
        outcome: e.outcome,
        detail: e.detail ?? null,
      });
    } catch (err) {
      console.error("[register] failed to record security event:", err);
    }
  };

  return {
    turnstileEnv: readTurnstileEnv((k) => Deno.env.get(k)),
    hashSalt,
    verifyTurnstileFn: (token, ip, env) => verifyTurnstile(token, ip, env),
    countRecent,
    recordSecurityEvent,
    registerForEvent: (args) =>
      supabase.rpc("register_for_event", {
        p_event_id: args.event_id,
        p_name: args.name,
        p_email: args.email,
      }),
    updateRegistration: (id, patch) =>
      supabase.from("registrations").update(patch).eq("id", id),
    fetchEventSlug: async (eventId) => {
      const { data } = await supabase.from("events").select("slug").eq("id", eventId).single();
      return (data as { slug?: string } | null)?.slug ?? null;
    },
    countActiveRegistrations: async (eventId) => {
      const { count } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("registration_status", "active");
      return count ?? null;
    },
    sendConfirmationEmail: sendEmail,
    sendAdminNotification,
    adminEmails,
  };
}

// ---------------------------------------------------------------------------
// Confirmation email
// ---------------------------------------------------------------------------
interface SendEmailArgs {
  to: string;
  toName: string;
  eventTitle: string;
  eventDate: string;
  zoomLink: string | null;
  pageSlug: string | null;
  dbSlug: string | null;
  originAttribution: Pick<Attribution, "first_utm_source" | "first_utm_medium" | "first_utm_campaign">;
}

async function sendEmail({
  to, toName, eventTitle, eventDate, zoomLink, pageSlug, dbSlug, originAttribution,
}: SendEmailArgs): Promise<string | null> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[register] RESEND_API_KEY is not set — skipping confirmation email.");
    return null;
  }

  const calendarUrl = pageSlug
    ? `https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar?event=${encodeURIComponent(pageSlug)}`
    : null;

  const joinLabUrl = dbSlug
    ? `https://www.covomultipliers.com/join-lab.html?event=${encodeURIComponent(dbSlug)}`
    : null;

  const zoomSecondaryLink = zoomLink && joinLabUrl
    ? `<p style="text-align:center;margin:14px 0 0;font-size:14px;line-height:20px;color:#888888;">
        When it's time, <a href="${esc(joinLabUrl)}" style="color:#1b4d3e;text-decoration:underline;font-weight:600;">join the lab here</a>.
      </p>`
    : "";

  const ctaSection = calendarUrl
    ? `<div style="text-align:center;margin:28px 0 0;">
        <a href="${esc(calendarUrl)}"
           style="display:inline-block;padding:15px 40px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
          Add to Calendar
        </a>
      </div>
      <p style="text-align:center;margin:12px 0 0;font-size:14px;line-height:20px;color:#888888;">
        Add it now so it doesn't slip — we'll remind you before we start.
      </p>
      ${zoomSecondaryLink}`
    : zoomLink && joinLabUrl
    ? `<div style="text-align:center;margin:28px 0 0;">
        <a href="${esc(joinLabUrl)}"
           style="display:inline-block;padding:15px 40px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
          Join the Lab
        </a>
      </div>`
    : `<p style="text-align:center;margin:28px 0 0;font-size:14px;line-height:20px;color:#888888;">
        The Zoom link will be sent before the lab.
      </p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10281f 0%,#1b4d3e 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">
                Covo Multipliers Labs
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
                You're registered!
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">

              <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(toName)},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
                You're confirmed for <strong>${esc(eventTitle)}</strong>.
                This is a free 45-minute live lab — practical, simple, and built to use right away.
                The people who get the most out of it are the ones who show up live.
              </p>

              <!-- Event detail rows -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;font-size:15px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;width:110px;white-space:nowrap;">Event</td>
                  <td style="padding:11px 14px;color:#1a1a1a;font-weight:600;">${esc(eventTitle)}</td>
                </tr>
                <tr>
                  <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Date</td>
                  <td style="padding:11px 14px;color:#1a1a1a;">${formatDate(eventDate)}</td>
                </tr>
              </table>

              ${ctaSection}

              <!-- WhatsApp Field Room secondary CTA -->
              <div style="margin:28px 0 0;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
                <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#15803d;">WhatsApp Field Room</p>
                <p style="margin:0 0 10px;font-size:14px;color:#374151;line-height:1.55;">Want to start practicing before the lab? Join the WhatsApp Field Room for prompts, reminders, and next steps with other disciple makers.</p>
                <a href="${esc(whatsAppJoinUrl(
                    { utm_source: "lab_confirmation_email", utm_medium: "email", utm_campaign: "whatsapp_field_room" },
                    originAttribution,
                  ))}"
                   style="font-size:14px;font-weight:600;color:#15803d;text-decoration:underline;">Join the WhatsApp Field Room →</a>
              </div>

              <p style="margin:28px 0 0;font-size:15px;color:#555555;">
                Looking forward to seeing you there.
              </p>

              ${renderTransactionalFooter()}

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: [to],
        subject: `You're registered — ${eventTitle}`,
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[register] Resend API error status=${res.status}:`, JSON.stringify(resBody));
      return null;
    }

    const messageId: string | null = (resBody as Record<string, unknown>)?.id as string ?? null;
    console.log(`[register] Resend accepted email, message_id=${messageId}`);
    return messageId;
  } catch (err) {
    console.error("[register] fetch to Resend threw an exception:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin signup notification
// ---------------------------------------------------------------------------
interface AdminNotifyArgs {
  adminEmails: string[];
  registrantName: string;
  registrantEmail: string;
  eventTitle: string;
  eventDate: string;
  totalSignups: number | null;
  reactivated: boolean;
  firstSource: string | null;
  firstLandingPage: string | null;
}

async function sendAdminNotification({
  adminEmails, registrantName, registrantEmail, eventTitle, eventDate,
  totalSignups, reactivated, firstSource, firstLandingPage,
}: AdminNotifyArgs): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("[register] RESEND_API_KEY not set — skipping admin notification.");
    return;
  }

  const dashboardUrl = "https://www.covomultipliers.com/lab-admin.html";
  const totalLine = totalSignups != null ? `${totalSignups}` : "—";
  const kind = reactivated ? "Re-registration" : "New signup";

  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:8px 12px;font-weight:600;color:#245c4a;width:140px;">${esc(label)}</td>
       <td style="padding:8px 12px;color:#1a1a1a;">${value}</td>
     </tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">
        <tr><td style="background:#10281f;padding:22px 24px;border-radius:12px 12px 0 0;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.6);">Lab Admin</p>
          <h1 style="margin:4px 0 0;font-size:20px;font-weight:800;color:#ffffff;">${esc(kind)}: ${esc(eventTitle)}</h1>
        </td></tr>
        <tr><td style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
            style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:14px;">
            ${row("Name", esc(registrantName))}
            ${row("Email", esc(registrantEmail))}
            ${row("Lab", esc(eventTitle))}
            ${row("Lab date", eventDate ? formatDate(eventDate) : "—")}
            ${row("Total signups", esc(totalLine))}
            ${row("First source", esc(firstSource ?? "direct / unknown"))}
            ${row("First page", esc(firstLandingPage ?? "—"))}
          </table>
          <div style="text-align:center;margin:24px 0 0;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;background:#1b4d3e;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;">Open the dashboard</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: adminEmails,
        subject: `${kind}: ${eventTitle} (${totalLine} total)`,
        html,
      }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      console.error(`[register] admin notification Resend error status=${res.status}:`, JSON.stringify(b));
    } else {
      console.log(`[register] admin notification sent to ${adminEmails.length} recipient(s)`);
    }
  } catch (err) {
    console.error("[register] admin notification fetch threw:", err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(status: number, body: Record<string, unknown>, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function safeSlug(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9-]{1,100}$/.test(s) ? s : null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function renderTransactionalFooter(): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      You're receiving this because you registered for this CoVo Multipliers Lab.
    </p>

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      CoVo Multipliers<br />
      14839 61st Road<br />
      Flushing, Queens, NYC
    </p>

    <p style="margin:0;font-size:12px;line-height:18px;color:#888888;">
      Questions? <a href="https://www.covomultipliers.com/contact.html" style="color:#1b4d3e;text-decoration:underline;">Contact us here</a>.
    </p>
  `;
}

function whatsAppJoinUrl(
  placement: Record<string, string>,
  origin: { first_utm_source: string | null; first_utm_medium: string | null; first_utm_campaign: string | null },
): string {
  const url = new URL("https://www.covomultipliers.com/join-whatsapp");
  for (const [k, v] of Object.entries(placement)) url.searchParams.set(k, v);
  if (origin.first_utm_source)   url.searchParams.set("origin_utm_source", origin.first_utm_source);
  if (origin.first_utm_medium)   url.searchParams.set("origin_utm_medium", origin.first_utm_medium);
  if (origin.first_utm_campaign) url.searchParams.set("origin_utm_campaign", origin.first_utm_campaign);
  return url.toString();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
