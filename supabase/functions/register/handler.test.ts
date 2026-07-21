// Deno integration tests for the register handler pipeline.
// The handler is exercised with fully mocked dependencies (no DB, network, or
// email provider), so these tests assert the *behavior* of every spam-control
// branch: what gets rejected, and — critically — that rejected submissions
// never call the RPC or send any email.
//
// Run with:  deno test supabase/functions/register/handler.test.ts
import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createHandler,
  type RegisterDeps,
  type SecurityEvent,
} from "./handler.ts";
import { verifyTurnstile } from "../_shared/spamProtection.ts";

const VALID_EVENT_ID = "11111111-1111-1111-1111-111111111111";

interface Spy {
  deps: RegisterDeps;
  calls: {
    register: number;
    confirmationEmail: number;
    adminEmail: number;
    updates: Record<string, unknown>[];
    security: SecurityEvent[];
  };
}

function makeSpy(overrides: Partial<RegisterDeps> = {}): Spy {
  const calls = {
    register: 0,
    confirmationEmail: 0,
    adminEmail: 0,
    updates: [] as Record<string, unknown>[],
    security: [] as SecurityEvent[],
  };

  const deps: RegisterDeps = {
    turnstileEnv: { secret: undefined, devBypass: true }, // skipped-ok by default
    hashSalt: "test-salt",
    verifyTurnstileFn: () => Promise.resolve({ ok: true }),
    countRecent: () => Promise.resolve(0),
    recordSecurityEvent: (e) => {
      calls.security.push(e);
      return Promise.resolve();
    },
    registerForEvent: () => {
      calls.register++;
      return Promise.resolve({
        data: {
          success: true,
          registration_id: "reg-1",
          event_title: "4 Questions Lab",
          event_date: "2026-08-19T19:00:00Z",
          zoom_link: null,
          seats_remaining: 10,
        },
        error: null,
      });
    },
    updateRegistration: (_id, patch) => {
      calls.updates.push(patch);
      return Promise.resolve({ error: null });
    },
    fetchEventSlug: () => Promise.resolve("four-questions-august-2026"),
    countActiveRegistrations: () => Promise.resolve(7),
    sendConfirmationEmail: () => {
      calls.confirmationEmail++;
      return Promise.resolve("resend-msg-1");
    },
    sendAdminNotification: () => {
      calls.adminEmail++;
      return Promise.resolve();
    },
    adminEmails: [],
    ...overrides,
  };

  return { deps, calls };
}

function req(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function baseBody(extra: Record<string, unknown> = {}) {
  return {
    event_id: VALID_EVENT_ID,
    event_slug: "four-questions",
    name: "Jane Smith",
    email: "jane@example.com",
    marketing_opt_in: false,
    turnstile_token: "test-token",
    ...extra,
  };
}

const outcomes = (spy: Spy) => spy.calls.security.map((s) => s.outcome);

// --------------------------------------------------------------------------
// Valid registrations
// --------------------------------------------------------------------------
Deno.test("valid: normal registration → 200, RPC + confirmation email fire", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(req(baseBody()));
  assertEquals(res.status, 200);
  const json = await res.json();
  assert(json.success);
  assertEquals(spy.calls.register, 1);
  assertEquals(spy.calls.confirmationEmail, 1);
  assert(outcomes(spy).includes("accepted"));
});

Deno.test("valid: international / accented name preserved through to the RPC", async () => {
  let capturedName = "";
  const spy = makeSpy({
    registerForEvent: (args) => {
      capturedName = args.name;
      return Promise.resolve({
        data: { success: true, registration_id: "r", event_title: "L", event_date: "2026-08-19T19:00:00Z", zoom_link: null, seats_remaining: 3 },
        error: null,
      });
    },
  });
  const res = await createHandler(spy.deps)(req(baseBody({ name: "José María García" })));
  assertEquals(res.status, 200);
  assertEquals(capturedName, "José María García");
});

Deno.test("valid: single-word name is accepted", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(req(baseBody({ name: "Li" })));
  assertEquals(res.status, 200);
  assertEquals(spy.calls.register, 1);
});

Deno.test("valid: UTM attribution is preserved and written", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody({
      utm_source: "multiplyingdisciples",
      utm_medium: "article",
      utm_campaign: "4q-cta",
      utm_content: "hero",
      first_utm_source: "substack",
    })),
  );
  assertEquals(res.status, 200);
  // First update carries attribution + consent.
  const attrPatch = spy.calls.updates[0];
  assertEquals(attrPatch.utm_source, "multiplyingdisciples");
  assertEquals(attrPatch.utm_medium, "article");
  assertEquals(attrPatch.utm_campaign, "4q-cta");
  assertEquals(attrPatch.utm_content, "hero");
  assertEquals(attrPatch.first_utm_source, "substack");
});

Deno.test("valid: admin notification fires when ADMIN_NOTIFY_EMAILS configured", async () => {
  const spy = makeSpy({ adminEmails: ["admin@covomultipliers.com"] });
  await createHandler(spy.deps)(req(baseBody()));
  assertEquals(spy.calls.adminEmail, 1);
});

// --------------------------------------------------------------------------
// Turnstile
// --------------------------------------------------------------------------
Deno.test("invalid turnstile token → 400, no RPC, no email, logged", async () => {
  const spy = makeSpy({
    turnstileEnv: { secret: "real-secret", devBypass: false },
    verifyTurnstileFn: () => Promise.resolve({ ok: false, reason: "verification_failed" }),
  });
  const res = await createHandler(spy.deps)(req(baseBody({ turnstile_token: "bad" })));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error, "We couldn't verify your submission. Please try again.");
  assertEquals(spy.calls.register, 0);
  assertEquals(spy.calls.confirmationEmail, 0);
  assert(outcomes(spy).includes("turnstile_failed"));
});

Deno.test("missing turnstile token (enforced) → 400 via real verifier, no RPC", async () => {
  const spy = makeSpy({
    turnstileEnv: { secret: "real-secret", devBypass: false },
    verifyTurnstileFn: (t, ip, env) => verifyTurnstile(t, ip, env),
  });
  const body = baseBody();
  delete (body as Record<string, unknown>).turnstile_token;
  const res = await createHandler(spy.deps)(req(body));
  assertEquals(res.status, 400);
  assertEquals(spy.calls.register, 0);
  assertEquals(spy.calls.confirmationEmail, 0);
});

// --------------------------------------------------------------------------
// Honeypot
// --------------------------------------------------------------------------
Deno.test("filled honeypot → 200 success-looking, but NO RPC and NO email", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody({ company_website: "http://spam.example" })),
  );
  assertEquals(res.status, 200);
  const json = await res.json();
  assert(json.success); // looks like success to the bot
  assertEquals(spy.calls.register, 0);
  assertEquals(spy.calls.confirmationEmail, 0);
  assertEquals(spy.calls.adminEmail, 0);
  assertEquals(outcomes(spy), ["honeypot_filled"]);
});

// --------------------------------------------------------------------------
// Name / email validation
// --------------------------------------------------------------------------
Deno.test("random-looking bot name → 400, no RPC, logged invalid_name", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody({ name: "QBQqQkUbAiqdHNDCLdXUb" })),
  );
  assertEquals(res.status, 400);
  assertEquals(spy.calls.register, 0);
  assertEquals(spy.calls.confirmationEmail, 0);
  assert(outcomes(spy).includes("invalid_name"));
});

Deno.test("malformed email → 400, no RPC, logged invalid_email", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody({ email: "not-an-email" })),
  );
  assertEquals(res.status, 400);
  assertEquals(spy.calls.register, 0);
  assert(outcomes(spy).includes("invalid_email"));
});

// --------------------------------------------------------------------------
// Rate limiting
// --------------------------------------------------------------------------
Deno.test("rate-limited attempt → 429, no RPC, no email, logged", async () => {
  const spy = makeSpy({ countRecent: () => Promise.resolve(9999) });
  const res = await createHandler(spy.deps)(req(baseBody()));
  assertEquals(res.status, 429);
  assertEquals(spy.calls.register, 0);
  assertEquals(spy.calls.confirmationEmail, 0);
  assert(outcomes(spy).includes("rate_limited"));
});

// --------------------------------------------------------------------------
// Duplicate handling (delegated to the RPC)
// --------------------------------------------------------------------------
Deno.test("duplicate submission → 409, no confirmation email", async () => {
  let called = 0;
  const spy = makeSpy({
    registerForEvent: () => {
      called++;
      return Promise.resolve({
        data: { success: false, error: "already_registered" },
        error: null,
      });
    },
  });
  const res = await createHandler(spy.deps)(req(baseBody()));
  assertEquals(res.status, 409);
  assertEquals(called, 1);
  assertEquals(spy.calls.confirmationEmail, 0);
});

// --------------------------------------------------------------------------
// Origin
// --------------------------------------------------------------------------
Deno.test("disallowed browser origin → 403, no RPC", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody(), { Origin: "https://evil.example" }),
  );
  assertEquals(res.status, 403);
  assertEquals(spy.calls.register, 0);
  assert(outcomes(spy).includes("invalid_origin"));
});

Deno.test("allowed origin → processed normally", async () => {
  const spy = makeSpy();
  const res = await createHandler(spy.deps)(
    req(baseBody(), { Origin: "https://www.covomultipliers.com" }),
  );
  assertEquals(res.status, 200);
  assertEquals(spy.calls.register, 1);
});
