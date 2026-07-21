// supabase/functions/_shared/spamProtection.ts
//
// Covo Multipliers — shared bot / spam protection for public form endpoints.
//
// This module is intentionally made of small, pure, individually testable
// pieces. The register Edge Function composes them; nothing here talks to the
// database or network except verifyTurnstile (which takes an injectable fetch
// so it can be tested without a real Cloudflare call).
//
// Design principles:
//   * Turnstile + server-side verification is the PRIMARY control.
//   * Name/email heuristics are ONE additional signal — deliberately
//     conservative so they never reject unfamiliar, international, accented,
//     hyphenated, short, or single-word legitimate names.
//   * Nothing here ever logs Turnstile secrets, full tokens, or raw IPs.

// ---------------------------------------------------------------------------
// Rejection categories (kept in sync with registration_security_events.outcome)
// ---------------------------------------------------------------------------
export type RejectionCategory =
  | "turnstile_failed"
  | "honeypot_filled"
  | "invalid_name"
  | "invalid_email"
  | "rate_limited"
  | "invalid_origin";

// ---------------------------------------------------------------------------
// Honeypot
// ---------------------------------------------------------------------------
// The registration forms render a hidden, off-screen field named
// `company_website`. Real users never see or fill it; bots that auto-fill
// every input do. A non-empty value is a strong bot signal.
export const HONEYPOT_FIELD = "company_website";

export function isHoneypotFilled(body: Record<string, unknown>): boolean {
  const v = body[HONEYPOT_FIELD];
  return typeof v === "string" && v.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Email validation + normalization
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_EMAIL_LEN = 254; // RFC 5321 maximum

export interface EmailResult {
  ok: boolean;
  /** Normalized (trimmed + lowercased) email — only present when ok. */
  email?: string;
}

export function validateEmail(raw: unknown): EmailResult {
  if (typeof raw !== "string") return { ok: false };
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LEN) return { ok: false };
  if (!EMAIL_RE.test(email)) return { ok: false };
  return { ok: true, email };
}

// ---------------------------------------------------------------------------
// Name validation + normalization
// ---------------------------------------------------------------------------
// Conservative machine-generated-input detection. This must NOT reject:
//   * international / accented names  (Maria, Nguyen, CJK, Asa, Jose)
//   * hyphenated / apostrophe names   (Anne-Marie, O'Brien, Al-Rashid)
//   * internal-capital names          (McDonald, DeShawn, MacLeod, LaToya)
//   * short or single-word names      (Li, Bo, Ng)
//
// It SHOULD reject the obvious bot shapes we are seeing, e.g.
//   "QBQqQkUbAiqdHNDCLdXUb", "wlbpcqRJtxgeoEECcRmvJXp":
// long, space-less tokens with an implausible scatter of interior capitals,
// plus names that are mostly punctuation/numbers or contain control chars.

export const MIN_NAME_LEN = 2;
export const MAX_NAME_LEN = 100;

// Control chars (C0/C1), plus specific invisible/bidi abuse we never want in a
// name. ZWNJ/ZWJ (U+200C/U+200D) are deliberately NOT blocked — they are
// required in some Indic and Arabic scripts. Expressed with \u escapes so the
// source file stays plain ASCII:
//   -, - : C0 / C1 control characters
//   ​                       : zero-width space
//   ‎, ‏               : LTR / RTL marks
//   ‪-‮                : bidi embeddings / overrides
//   ⁦-⁩                : bidi isolates
//   ﻿                       : zero-width no-break space / BOM
const DISALLOWED_INVISIBLES =
  /[\u0000-\u001F\u007F-\u009F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/;

export interface NameResult {
  ok: boolean;
  /** Trimmed name (whitespace-only cleanup — never rewritten) — present when ok. */
  name?: string;
  reason?: string;
}

export function validateName(raw: unknown): NameResult {
  if (typeof raw !== "string") return { ok: false, reason: "not_a_string" };

  // Collapse runs of internal whitespace to single spaces and trim the ends.
  // This is the ONLY normalization applied — capitalization and Unicode are
  // preserved exactly.
  const name = raw.replace(/\s+/g, " ").trim();

  if (name.length < MIN_NAME_LEN) return { ok: false, reason: "too_short" };
  if (name.length > MAX_NAME_LEN) return { ok: false, reason: "too_long" };

  if (DISALLOWED_INVISIBLES.test(name)) {
    return { ok: false, reason: "control_or_invisible" };
  }

  // Character-class census using Unicode property escapes.
  const letters = countMatches(name, /\p{L}/gu);
  const digits = countMatches(name, /\p{Nd}/gu);
  // Punctuation/symbols excluding the ones common in real names
  // (apostrophe, right single quote ’, hyphen, dot, middle dot ·).
  const nameSafePunct = /['’\-.·]/;
  let otherPunct = 0;
  for (const ch of name) {
    if (/\p{P}|\p{S}/u.test(ch) && !nameSafePunct.test(ch)) otherPunct++;
  }

  // Must contain at least one letter.
  if (letters === 0) return { ok: false, reason: "no_letters" };

  // Mostly numbers or punctuation → not a real name.
  if (digits + otherPunct >= letters) {
    return { ok: false, reason: "mostly_non_letters" };
  }

  // Long space-less token with an implausible number of interior capitals.
  // Interior capital = an uppercase letter that is not the first char of a
  // word (word boundary = start, space, hyphen, apostrophe, or dot).
  if (!name.includes(" ") && name.length >= 12) {
    const interiorCaps = countInteriorUppercase(name);
    if (interiorCaps >= 4) return { ok: false, reason: "random_case" };
  }

  return { ok: true, name };
}

function countMatches(s: string, re: RegExp): number {
  const m = s.match(re);
  return m ? m.length : 0;
}

// Counts uppercase (or titlecase) letters that appear mid-word. Real names with
// internal capitals (McDonald, DeShawn) have 1–2; random bot tokens have many.
function countInteriorUppercase(s: string): number {
  let count = 0;
  let atWordStart = true;
  for (const ch of s) {
    const isBreak = ch === " " || ch === "-" || ch === "'" || ch === "’" || ch === ".";
    if (isBreak) {
      atWordStart = true;
      continue;
    }
    const isUpper = /\p{Lu}|\p{Lt}/u.test(ch);
    if (isUpper && !atWordStart) count++;
    atWordStart = false;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Origin check
// ---------------------------------------------------------------------------
// Origin/Referer can be absent or forged, so this is a secondary control only.
// Behavior: a request with NO Origin header is allowed (native apps, some
// privacy setups, and — importantly — the header simply being stripped). A
// request WITH an Origin that is not on the allow-list is rejected.
export function isOriginAllowed(
  origin: string | null,
  allowed: Set<string>,
): boolean {
  if (!origin) return true; // absent → cannot judge; rely on Turnstile
  return allowed.has(origin);
}

// ---------------------------------------------------------------------------
// IP / email hashing (privacy-preserving)
// ---------------------------------------------------------------------------
// Salted SHA-256. The salt comes from the IP_HASH_SALT secret; without it we
// fall back to a fixed development salt so local tests still work (production
// must set a real salt).
const DEV_SALT = "covo-dev-salt-do-not-use-in-prod";

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashIp(ip: string | null, salt?: string): Promise<string | null> {
  if (!ip) return null;
  return await sha256Hex(`${salt ?? DEV_SALT}:ip:${ip}`);
}

export async function hashEmail(email: string | null, salt?: string): Promise<string | null> {
  if (!email) return null;
  return await sha256Hex(`${salt ?? DEV_SALT}:email:${email.trim().toLowerCase()}`);
}

/** Extract the best-effort client IP from proxy headers. */
export function getClientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

// ---------------------------------------------------------------------------
// Turnstile verification
// ---------------------------------------------------------------------------
export const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileEnv {
  secret: string | undefined;
  devBypass: boolean;
}

export interface TurnstileResult {
  ok: boolean;
  /** True when verification was skipped because Turnstile is not configured. */
  skipped?: boolean;
  reason?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Verification policy:
//   * secret present            → verify against Cloudflare; missing/invalid
//                                 token fails closed (rejected).
//   * secret absent + devBypass → skip (explicit local/test opt-in only).
//   * secret absent + no bypass → skip but flag as unconfigured. This keeps the
//                                 site working during rollout BEFORE the secret
//                                 is set; the register function logs a loud
//                                 warning. Set the secret to enforce.
export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null,
  env: TurnstileEnv,
  fetchImpl: FetchLike = fetch,
): Promise<TurnstileResult> {
  if (!env.secret) {
    if (env.devBypass) return { ok: true, skipped: true, reason: "dev_bypass" };
    // Not configured yet — do not block legitimate users during rollout.
    return { ok: true, skipped: true, reason: "unconfigured" };
  }

  // Secret is configured → enforcement is ON. A missing token fails closed.
  if (typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, reason: "missing_token" };
  }

  const form = new URLSearchParams();
  form.set("secret", env.secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const res = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean };
    if (data && data.success === true) return { ok: true };
    return { ok: false, reason: "verification_failed" };
  } catch (_err) {
    // Network error reaching Cloudflare. Fail closed — better to ask a real
    // user to retry than to wave through unverified traffic once enforcement
    // is on.
    return { ok: false, reason: "siteverify_unreachable" };
  }
}

export function readTurnstileEnv(getEnv: (k: string) => string | undefined): TurnstileEnv {
  return {
    secret: getEnv("TURNSTILE_SECRET_KEY"),
    devBypass: getEnv("TURNSTILE_DEV_BYPASS") === "true",
  };
}

// ---------------------------------------------------------------------------
// Layered rate limiting
// ---------------------------------------------------------------------------
// Thresholds are deliberately generous so shared IPs (households, churches,
// offices, conferences) are not blocked. Layers combine a short rolling window
// with a broader daily cap, plus per-email and per-event-per-IP limits.
export interface RateLimitLayer {
  name: string;
  key: "ip_hash" | "email_hash";
  /** Also scope the count to the target event when true. */
  perEvent?: boolean;
  windowMs: number;
  max: number;
}

export const DEFAULT_RATE_LIMIT_LAYERS: RateLimitLayer[] = [
  // Short burst from one IP across all labs.
  { name: "ip_burst", key: "ip_hash", windowMs: 10 * 60 * 1000, max: 8 },
  // Broad daily cap from one IP (still generous for a busy office/church).
  { name: "ip_daily", key: "ip_hash", windowMs: 24 * 60 * 60 * 1000, max: 40 },
  // Same email retried repeatedly.
  { name: "email_hourly", key: "email_hash", windowMs: 60 * 60 * 1000, max: 4 },
  // One IP hammering a single lab.
  { name: "ip_event_hourly", key: "ip_hash", perEvent: true, windowMs: 60 * 60 * 1000, max: 6 },
];

export interface RateLimitKeys {
  ipHash: string | null;
  emailHash: string | null;
  eventId: string | null;
}

// Counts prior events for a key/window. Injected so it can be stubbed in tests.
export type CountRecentFn = (args: {
  key: "ip_hash" | "email_hash";
  value: string;
  sinceMs: number;
  eventId: string | null;
}) => Promise<number>;

export interface RateLimitResult {
  limited: boolean;
  layer?: string;
}

export async function checkRateLimit(
  keys: RateLimitKeys,
  countRecent: CountRecentFn,
  layers: RateLimitLayer[] = DEFAULT_RATE_LIMIT_LAYERS,
): Promise<RateLimitResult> {
  for (const layer of layers) {
    const value = layer.key === "ip_hash" ? keys.ipHash : keys.emailHash;
    if (!value) continue; // no key available for this layer → skip it
    const count = await countRecent({
      key: layer.key,
      value,
      sinceMs: layer.windowMs,
      eventId: layer.perEvent ? keys.eventId : null,
    });
    // The current in-flight attempt is not yet recorded, so >= max means this
    // request would exceed the layer.
    if (count >= layer.max) {
      return { limited: true, layer: layer.name };
    }
  }
  return { limited: false };
}
