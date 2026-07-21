// Deno unit tests for the shared spam-protection module.
// Run with:  deno test supabase/functions/_shared/spamProtection.test.ts
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkRateLimit,
  DEFAULT_RATE_LIMIT_LAYERS,
  hashEmail,
  hashIp,
  HONEYPOT_FIELD,
  isHoneypotFilled,
  isOriginAllowed,
  validateEmail,
  validateName,
  verifyTurnstile,
} from "./spamProtection.ts";

// --------------------------------------------------------------------------
// Honeypot
// --------------------------------------------------------------------------
Deno.test("honeypot: empty / missing → not filled", () => {
  assertFalse(isHoneypotFilled({}));
  assertFalse(isHoneypotFilled({ [HONEYPOT_FIELD]: "" }));
  assertFalse(isHoneypotFilled({ [HONEYPOT_FIELD]: "   " }));
});

Deno.test("honeypot: populated → filled", () => {
  assert(isHoneypotFilled({ [HONEYPOT_FIELD]: "http://spam.example" }));
});

// --------------------------------------------------------------------------
// Name validation
// --------------------------------------------------------------------------
Deno.test("name: accepts international, accented, hyphenated, apostrophe, CJK, single-word", () => {
  const good = [
    "María", "José", "Nguyễn Thị Hương", "田中太郎", "Åsa",
    "Anne-Marie", "O'Brien", "Al-Rashid", "McDonald", "DeShawn",
    "MacLeod", "LaToya", "Li", "Ng", "Bo", "Jean-Pierre O'Connor",
    "van der Berg", "Renée", "D'Angelo",
  ];
  for (const n of good) {
    assert(validateName(n).ok, `expected "${n}" to be accepted`);
  }
});

Deno.test("name: rejects the observed bot tokens (random interior caps)", () => {
  assertFalse(validateName("QBQqQkUbAiqdHNDCLdXUb").ok);
  assertFalse(validateName("wlbpcqRJtxgeoEECcRmvJXp").ok);
  assertFalse(validateName("xXxXxXxXxXxX").ok);
});

Deno.test("name: rejects mostly punctuation / numbers / empty-ish", () => {
  assertFalse(validateName("!!!###$$$").ok);
  assertFalse(validateName("1234567890").ok);
  assertFalse(validateName("a").ok); // too short
  assertFalse(validateName("").ok);
  assertFalse(validateName(123 as unknown).ok);
});

Deno.test("name: rejects control / invisible characters", () => {
  assertFalse(validateName("John\u202EDoe").ok); // bidi override
  assertFalse(validateName("John\u0000Doe").ok); // NUL control char
});

Deno.test("name: rejects unreasonably long values", () => {
  assertFalse(validateName("a".repeat(101)).ok);
});

Deno.test("name: normalizes surrounding/collapsed whitespace only, preserves case & unicode", () => {
  const r = validateName("  José   María  ");
  assert(r.ok);
  assertEquals(r.name, "José María");
});

// --------------------------------------------------------------------------
// Email validation
// --------------------------------------------------------------------------
Deno.test("email: valid addresses normalize to lowercase + trimmed", () => {
  const r = validateEmail("  Person.Name+tag@Example.COM ");
  assert(r.ok);
  assertEquals(r.email, "person.name+tag@example.com");
});

Deno.test("email: rejects malformed and over-long addresses", () => {
  for (const bad of ["nope", "a@b", "a@@b.com", "a b@c.com", "@x.com", "x@.com", ""]) {
    assertFalse(validateEmail(bad).ok, `expected "${bad}" invalid`);
  }
  assertFalse(validateEmail("a".repeat(250) + "@example.com").ok);
});

// --------------------------------------------------------------------------
// Origin
// --------------------------------------------------------------------------
Deno.test("origin: absent origin is allowed; known allowed; unknown rejected", () => {
  const allowed = new Set(["https://covomultipliers.com"]);
  assert(isOriginAllowed(null, allowed));
  assert(isOriginAllowed("https://covomultipliers.com", allowed));
  assertFalse(isOriginAllowed("https://evil.example", allowed));
});

// --------------------------------------------------------------------------
// Hashing
// --------------------------------------------------------------------------
Deno.test("hashing: deterministic, salted, never returns the raw value", async () => {
  const h1 = await hashIp("203.0.113.5", "salt");
  const h2 = await hashIp("203.0.113.5", "salt");
  const h3 = await hashIp("203.0.113.5", "other-salt");
  assertEquals(h1, h2);
  assert(h1 !== h3);
  assert(!h1!.includes("203.0.113.5"));
  assertEquals(await hashIp(null), null);

  const e1 = await hashEmail("Person@Example.com", "salt");
  const e2 = await hashEmail("person@example.com", "salt");
  assertEquals(e1, e2, "email hash should be case-insensitive");
});

// --------------------------------------------------------------------------
// Turnstile verification
// --------------------------------------------------------------------------
function stubFetch(success: boolean) {
  return () =>
    Promise.resolve(new Response(JSON.stringify({ success }), { status: 200 }));
}

Deno.test("turnstile: no secret + dev bypass → skipped ok", async () => {
  const r = await verifyTurnstile("anything", null, { secret: undefined, devBypass: true });
  assert(r.ok && r.skipped);
});

Deno.test("turnstile: no secret, no bypass → skipped (unconfigured) but ok during rollout", async () => {
  const r = await verifyTurnstile("", null, { secret: undefined, devBypass: false });
  assert(r.ok && r.skipped);
  assertEquals(r.reason, "unconfigured");
});

Deno.test("turnstile: secret set + missing token → fails closed", async () => {
  const r = await verifyTurnstile("", null, { secret: "sekret", devBypass: false }, stubFetch(true));
  assertFalse(r.ok);
  assertEquals(r.reason, "missing_token");
});

Deno.test("turnstile: secret set + Cloudflare says success → ok", async () => {
  const r = await verifyTurnstile("tok", "1.2.3.4", { secret: "sekret", devBypass: false }, stubFetch(true));
  assert(r.ok);
});

Deno.test("turnstile: secret set + Cloudflare says failure → rejected", async () => {
  const r = await verifyTurnstile("tok", null, { secret: "sekret", devBypass: false }, stubFetch(false));
  assertFalse(r.ok);
});

Deno.test("turnstile: siteverify network error → fails closed", async () => {
  const throwing = () => Promise.reject(new Error("network down"));
  const r = await verifyTurnstile("tok", null, { secret: "sekret", devBypass: false }, throwing);
  assertFalse(r.ok);
  assertEquals(r.reason, "siteverify_unreachable");
});

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------
Deno.test("rate limit: under thresholds → not limited", async () => {
  const countRecent = () => Promise.resolve(0);
  const r = await checkRateLimit(
    { ipHash: "iphash", emailHash: "emailhash", eventId: "e1" },
    countRecent,
  );
  assertFalse(r.limited);
});

Deno.test("rate limit: exceeding the IP burst layer → limited", async () => {
  const burst = DEFAULT_RATE_LIMIT_LAYERS.find((l) => l.name === "ip_burst")!;
  const countRecent = (args: { key: string }) =>
    Promise.resolve(args.key === "ip_hash" ? burst.max : 0);
  const r = await checkRateLimit(
    { ipHash: "iphash", emailHash: "emailhash", eventId: "e1" },
    countRecent,
  );
  assert(r.limited);
  assertEquals(r.layer, "ip_burst");
});

Deno.test("rate limit: missing keys skip their layers (no crash)", async () => {
  const countRecent = () => Promise.resolve(999);
  // No ipHash and no emailHash → every layer skipped → not limited.
  const r = await checkRateLimit(
    { ipHash: null, emailHash: null, eventId: null },
    countRecent,
  );
  assertFalse(r.limited);
});
