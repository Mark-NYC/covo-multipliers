// Deno tests for the pure row-merge logic used by the Google Apps Script sync.
// These prove the properties that matter for a repeatable one-way sync:
//   - repeated runs never create duplicate rows for the same application_id
//   - Supabase-owned columns are refreshed when a record changes
//   - leader-owned columns (Notes, Follow-up Owner, Follow-up Status) survive
//   - applicant text cannot become a spreadsheet formula
//
// Run with:  deno test google-apps-script/rowMerge.test.ts
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeHeader,
  headerRow,
  LEADER_COLUMNS,
  mergeApplications,
  sanitizeCell,
  SUPABASE_COLUMNS,
  type SyncRecord,
} from "./rowMerge.ts";

function record(id: string, over: Partial<SyncRecord> = {}): SyncRecord {
  return {
    application_id: id,
    immersion_title: "NYC Immersion",
    immersion_city: "New York City, NY",
    immersion_slug: "nyc",
    immersion_start_date: "2027-03-12T22:00:00Z",
    status: "submitted",
    created_at: "2026-09-01T00:00:00Z",
    confirmation_sent_at: null,
    name: "Jane Applicant",
    email: "jane@example.com",
    phone: null,
    city_state: "Brooklyn, NY",
    church_org: "Redemption Church",
    team_status: "have_team",
    team_size: 3,
    why_coming: "Reasons",
    hoping_to_learn: "Things",
    prior_training: null,
    lodging_acknowledged: true,
    ...over,
  };
}

const H = headerRow();
const col = (name: string) => H.indexOf(name);

// --------------------------------------------------------------------------
// First sync into an empty sheet
// --------------------------------------------------------------------------
Deno.test("first run: appends every record once, header first", () => {
  const res = mergeApplications({
    grid: [],
    records: [record("a"), record("b")],
  });
  assertEquals(res.grid[0], H);
  assertEquals(res.grid.length, 3); // header + 2
  assertEquals(res.created, 2);
  assertEquals(res.updated, 0);
});

// --------------------------------------------------------------------------
// Duplicate-free: re-running never grows the row count
// --------------------------------------------------------------------------
Deno.test("idempotent: same records twice -> no duplicate rows", () => {
  const first = mergeApplications({ grid: [], records: [record("a"), record("b")] });
  const second = mergeApplications({ grid: first.grid, records: [record("a"), record("b")] });
  assertEquals(second.grid.length, 3); // header + 2, unchanged
  assertEquals(second.created, 0);
  assertEquals(second.updated, 2);
  // application_id column has exactly one row each
  const ids = second.grid.slice(1).map((r) => r[col("application_id")]);
  assertEquals(ids.sort(), ["a", "b"]);
});

Deno.test("duplicate ids within one fetch are collapsed to a single row", () => {
  const res = mergeApplications({ grid: [], records: [record("a"), record("a")] });
  assertEquals(res.grid.length, 2); // header + 1
});

Deno.test("a pre-existing duplicate row in the sheet is collapsed, not propagated", () => {
  const dupGrid = [
    H,
    H.map((h) => (h === "application_id" ? "a" : "")),
    H.map((h) => (h === "application_id" ? "a" : "")),
  ];
  const res = mergeApplications({ grid: dupGrid, records: [record("a")] });
  const rows = res.grid.slice(1).filter((r) => r[col("application_id")] === "a");
  assertEquals(rows.length, 1);
});

// --------------------------------------------------------------------------
// Supabase columns refresh; leader columns are preserved
// --------------------------------------------------------------------------
Deno.test("update: Supabase columns refresh, leader columns preserved", () => {
  const first = mergeApplications({ grid: [], records: [record("a", { status: "submitted" })] });

  // A leader fills in their columns by hand.
  const grid = first.grid.map((r) => r.slice());
  grid[1][col("Notes")] = "Called, left voicemail";
  grid[1][col("Follow-up Owner")] = "Pat";
  grid[1][col("Follow-up Status")] = "In progress";

  // Supabase now reports the applicant approved.
  const second = mergeApplications({ grid, records: [record("a", { status: "approved" })] });
  const row = second.grid[1];
  assertEquals(row[col("status")], "approved"); // refreshed
  assertEquals(row[col("Notes")], "Called, left voicemail"); // preserved
  assertEquals(row[col("Follow-up Owner")], "Pat");
  assertEquals(row[col("Follow-up Status")], "In progress");
});

Deno.test("rows fetched on a later page (not in this fetch) are preserved", () => {
  const grid = mergeApplications({ grid: [], records: [record("page1")] }).grid;
  // A second sync run only contains page-2 ids; page1 must survive.
  const res = mergeApplications({ grid, records: [record("page2")] });
  const ids = res.grid.slice(1).map((r) => r[col("application_id")]).sort();
  assertEquals(ids, ["page1", "page2"]);
  assertEquals(res.preserved, 1);
});

// --------------------------------------------------------------------------
// Formula-injection safety
// --------------------------------------------------------------------------
Deno.test("sanitizeCell neutralizes leading = + - @", () => {
  assertEquals(sanitizeCell("=SUM(A1:A9)"), "'=SUM(A1:A9)");
  assertEquals(sanitizeCell("+1-800-555"), "'+1-800-555");
  assertEquals(sanitizeCell("-5"), "'-5");
  assertEquals(sanitizeCell("@handle"), "'@handle");
  assertEquals(sanitizeCell("  =danger"), "'  =danger"); // after leading spaces
  assertEquals(sanitizeCell("Jane Smith"), "Jane Smith"); // untouched
  assertEquals(sanitizeCell(3), 3); // non-string untouched
});

Deno.test("merge applies formula-safety to applicant cells", () => {
  const res = mergeApplications({
    grid: [],
    records: [record("a", { name: "=HYPERLINK(\"http://evil\")", church_org: "@everyone" })],
  });
  assertEquals(res.grid[1][col("name")], "'=HYPERLINK(\"http://evil\")");
  assertEquals(res.grid[1][col("church_org")], "'@everyone");
});

Deno.test("null/undefined values become empty strings", () => {
  const res = mergeApplications({ grid: [], records: [record("a", { phone: null, prior_training: undefined })] });
  assertEquals(res.grid[1][col("phone")], "");
  assertEquals(res.grid[1][col("prior_training")], "");
});

// --------------------------------------------------------------------------
// Column contract
// --------------------------------------------------------------------------
Deno.test("header = Supabase columns then leader columns, application_id first", () => {
  assertEquals(H[0], "application_id");
  assertEquals(H.slice(0, SUPABASE_COLUMNS.length), SUPABASE_COLUMNS);
  assertEquals(H.slice(SUPABASE_COLUMNS.length), LEADER_COLUMNS);
  assert(LEADER_COLUMNS.includes("Notes"));
});

Deno.test("computeHeader: empty sheet -> Supabase + default leader columns", () => {
  assertEquals(computeHeader([]), headerRow());
});

Deno.test("computeHeader: preserves a leader-added column and its order", () => {
  const existing = [...SUPABASE_COLUMNS, "Priority", "Notes", "Follow-up Owner"];
  const h = computeHeader(existing);
  // Priority (custom) kept in place; missing default (Follow-up Status) appended.
  assertEquals(h.slice(SUPABASE_COLUMNS.length), ["Priority", "Notes", "Follow-up Owner", "Follow-up Status"]);
});

Deno.test("merge preserves values in a leader-added custom column", () => {
  const first = mergeApplications({ grid: [], records: [record("a")] });
  // Leader adds a custom "Priority" column and fills it.
  const grid = first.grid.map((r) => r.slice());
  grid[0].push("Priority");
  grid[1].push("High");
  const res = mergeApplications({ grid, records: [record("a", { status: "approved" })] });
  const pCol = res.header.indexOf("Priority");
  assert(pCol !== -1);
  assertEquals(res.grid[1][pCol], "High"); // custom leader column preserved
  assertEquals(res.grid[1][res.header.indexOf("status")], "approved"); // supabase refreshed
});
