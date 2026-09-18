// Deno tests for the immersion-applications-sync handler.
// The handler is exercised with a mocked fetchApplications dependency (no DB
// or network), so these tests assert behavior: authorization, pagination
// (keyset cursor + limit), and record shaping.
//
// Run with:  deno test supabase/functions/immersion-applications-sync/handler.test.ts
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createHandler,
  type FetchApplicationsFn,
  type RawApplicationRow,
  type SyncDeps,
} from "./handler.ts";

const TOKEN = "test-sync-token-abc123";

function rawRow(id: string, over: Partial<RawApplicationRow> = {}): RawApplicationRow {
  return {
    id,
    status: "submitted",
    created_at: "2026-09-01T00:00:00Z",
    confirmation_sent_at: null,
    name: "Jane Applicant",
    email: "jane@example.com",
    phone: null,
    city_state: "Brooklyn, NY",
    church_org: null,
    team_status: null,
    team_size: 2,
    why_coming: "Because",
    hoping_to_learn: null,
    prior_training: null,
    lodging_acknowledged: true,
    immersions: { slug: "nyc", title: "NYC Immersion", city: "New York City, NY", start_date: "2027-03-12T22:00:00Z" },
    ...over,
  };
}

function makeDeps(over: Partial<SyncDeps> = {}): SyncDeps {
  const fetchApplications: FetchApplicationsFn = () =>
    Promise.resolve({ rows: [], error: null });
  return {
    syncToken: TOKEN,
    fetchApplications,
    defaultPageSize: 500,
    maxPageSize: 1000,
    ...over,
  };
}

function req(opts: { method?: string; token?: string | null; url?: string } = {}): Request {
  const headers = new Headers();
  if (opts.token !== null && opts.token !== undefined) {
    headers.set("x-sync-token", opts.token);
  }
  return new Request(opts.url ?? "https://x.functions.supabase.co/immersion-applications-sync", {
    method: opts.method ?? "GET",
    headers,
  });
}

// --------------------------------------------------------------------------
// Authorization
// --------------------------------------------------------------------------
Deno.test("auth: missing token -> 401 and never reads the DB", async () => {
  let reads = 0;
  const handler = createHandler(makeDeps({
    fetchApplications: () => {
      reads++;
      return Promise.resolve({ rows: [], error: null });
    },
  }));
  const res = await handler(req({ token: null }));
  assertEquals(res.status, 401);
  assertEquals(reads, 0);
});

Deno.test("auth: wrong token -> 401 and never reads the DB", async () => {
  let reads = 0;
  const handler = createHandler(makeDeps({
    fetchApplications: () => {
      reads++;
      return Promise.resolve({ rows: [], error: null });
    },
  }));
  const res = await handler(req({ token: "not-the-token" }));
  assertEquals(res.status, 401);
  assertEquals(reads, 0);
});

Deno.test("auth: token unset on server -> 500 (fails closed)", async () => {
  const handler = createHandler(makeDeps({ syncToken: undefined }));
  const res = await handler(req({ token: TOKEN }));
  assertEquals(res.status, 500);
});

Deno.test("auth: correct token -> 200", async () => {
  const handler = createHandler(makeDeps({
    fetchApplications: () => Promise.resolve({ rows: [rawRow("a")], error: null }),
  }));
  const res = await handler(req({ token: TOKEN }));
  assertEquals(res.status, 200);
});

Deno.test("auth: a near-miss token of a different length is rejected", async () => {
  const handler = createHandler(makeDeps());
  const res = await handler(req({ token: TOKEN + "x" }));
  assertEquals(res.status, 401);
});

// --------------------------------------------------------------------------
// Method / CORS
// --------------------------------------------------------------------------
Deno.test("non-GET -> 405", async () => {
  const handler = createHandler(makeDeps());
  const res = await handler(req({ method: "POST", token: TOKEN }));
  assertEquals(res.status, 405);
});

Deno.test("OPTIONS preflight -> 204", async () => {
  const handler = createHandler(makeDeps());
  const res = await handler(req({ method: "OPTIONS", token: null }));
  assertEquals(res.status, 204);
});

// --------------------------------------------------------------------------
// Pagination
// --------------------------------------------------------------------------
Deno.test("pagination: a full page advertises next_cursor = last id", async () => {
  const rows = [rawRow("11111111-1111-1111-1111-111111111111"), rawRow("22222222-2222-2222-2222-222222222222")];
  const handler = createHandler(makeDeps({
    defaultPageSize: 2,
    maxPageSize: 2,
    fetchApplications: () => Promise.resolve({ rows, error: null }),
  }));
  const res = await handler(req({ token: TOKEN }));
  const body = await res.json();
  assertEquals(body.count, 2);
  assertEquals(body.next_cursor, "22222222-2222-2222-2222-222222222222");
});

Deno.test("pagination: a partial page ends the walk (next_cursor null)", async () => {
  const handler = createHandler(makeDeps({
    defaultPageSize: 10,
    fetchApplications: () => Promise.resolve({ rows: [rawRow("a")], error: null }),
  }));
  const res = await handler(req({ token: TOKEN }));
  const body = await res.json();
  assertEquals(body.count, 1);
  assertEquals(body.next_cursor, null);
});

Deno.test("pagination: an empty page ends the walk", async () => {
  const handler = createHandler(makeDeps());
  const res = await handler(req({ token: TOKEN }));
  const body = await res.json();
  assertEquals(body.count, 0);
  assertEquals(body.next_cursor, null);
});

Deno.test("pagination: after_id (valid uuid) and limit are passed to the fetch", async () => {
  let seenAfter: string | null = "unset";
  let seenLimit = -1;
  const handler = createHandler(makeDeps({
    maxPageSize: 1000,
    fetchApplications: (afterId, limit) => {
      seenAfter = afterId;
      seenLimit = limit;
      return Promise.resolve({ rows: [], error: null });
    },
  }));
  const uuid = "33333333-3333-3333-3333-333333333333";
  await handler(req({ token: TOKEN, url: `https://x/fn?after_id=${uuid}&limit=250` }));
  assertEquals(seenAfter, uuid);
  assertEquals(seenLimit, 250);
});

Deno.test("pagination: no after_id means start from the beginning (null)", async () => {
  let seenAfter: string | null = "unset";
  const handler = createHandler(makeDeps({
    fetchApplications: (afterId) => {
      seenAfter = afterId;
      return Promise.resolve({ rows: [], error: null });
    },
  }));
  await handler(req({ token: TOKEN }));
  assertEquals(seenAfter, null);
});

Deno.test("pagination: limit is clamped to maxPageSize", async () => {
  let seenLimit = -1;
  const handler = createHandler(makeDeps({
    maxPageSize: 100,
    fetchApplications: (_a, limit) => {
      seenLimit = limit;
      return Promise.resolve({ rows: [], error: null });
    },
  }));
  await handler(req({ token: TOKEN, url: "https://x/fn?limit=99999" }));
  assertEquals(seenLimit, 100);
});

Deno.test("pagination: a malformed after_id is rejected with 400", async () => {
  const handler = createHandler(makeDeps());
  const res = await handler(req({ token: TOKEN, url: "https://x/fn?after_id=not-a-uuid" }));
  assertEquals(res.status, 400);
});

// --------------------------------------------------------------------------
// Record shaping
// --------------------------------------------------------------------------
Deno.test("shape: flattens the immersion embed and drops attribution", async () => {
  const handler = createHandler(makeDeps({
    fetchApplications: () => Promise.resolve({ rows: [rawRow("abc")], error: null }),
  }));
  const res = await handler(req({ token: TOKEN }));
  const body = await res.json();
  const rec = body.records[0];
  assertEquals(rec.application_id, "abc");
  assertEquals(rec.immersion_title, "NYC Immersion");
  assertEquals(rec.immersion_city, "New York City, NY");
  assertEquals(rec.name, "Jane Applicant");
  // Attribution / contact_id are intentionally absent.
  assert(!("utm_source" in rec));
  assert(!("contact_id" in rec));
});

Deno.test("shape: tolerates the immersion embed arriving as an array", async () => {
  const row = rawRow("abc", {
    immersions: [{ slug: "okc", title: "OKC", city: "Oklahoma City, OK", start_date: null }],
  });
  const handler = createHandler(makeDeps({
    fetchApplications: () => Promise.resolve({ rows: [row], error: null }),
  }));
  const res = await handler(req({ token: TOKEN }));
  const body = await res.json();
  assertEquals(body.records[0].immersion_title, "OKC");
});

Deno.test("read error -> 500", async () => {
  const handler = createHandler(makeDeps({
    fetchApplications: () => Promise.resolve({ rows: [], error: { code: "XX000", message: "boom" } }),
  }));
  const res = await handler(req({ token: TOKEN }));
  assertEquals(res.status, 500);
});
