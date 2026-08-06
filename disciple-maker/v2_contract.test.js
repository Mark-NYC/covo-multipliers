// Disciple Maker Next Step V2 — contract & routing tests (node, no deps)
//
//   node disciple-maker/v2_contract.test.js
//
// Guards the rollout: request/response contracts, versioned endpoints, legacy
// handling, resume, expired tokens, outcome-map completeness, and client↔server
// routing parity. Pure static + logic checks — safe to run in CI without a DB.

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const NEXT_STEP = require("./questions.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; }
}

// ── Server-side deriveOutcome mirror (must match questions.js scoreOutcomes) ──
// Kept in sync with supabase/functions/disciple-maker-v2-submit/index.ts.
function serverDerive(a) {
  const s = { learning_not_practicing:0,intending_not_acting:0,no_relational_field:0,started_but_stalled:0,practicing_alone:0,reproducing_widen:0 };
  const hasField = ["several","one_two"].includes(a.q2_field);
  const noField = ["not_really","around_christians"].includes(a.q2_field);
  const practicing = ["this_week","this_month"].includes(a.q1_recency) || ["recently","once_twice"].includes(a.q3_tool) || a.q4_followup==="kept_meeting";
  if (noField) s.no_relational_field += 3;
  if (a.q4_followup==="no_one") s.no_relational_field += 1;
  if (a.q3_tool==="learned_not_used") s.learning_not_practicing += 2;
  if (a.q5_consume==="learning_more") s.learning_not_practicing += 2;
  if (["months","longer"].includes(a.q1_recency) && a.q3_tool!=="recently") s.learning_not_practicing += 1;
  if (hasField && a.q6_rhythm==="whenever") s.intending_not_acting += 2;
  if (hasField && ["months","longer"].includes(a.q1_recency) && !practicing) s.intending_not_acting += 2;
  if (a.q4_followup==="meant_to") s.intending_not_acting += 1;
  if (a.q7_stalled==="yes") s.started_but_stalled += 3;
  if (a.q7_stalled==="little") s.started_but_stalled += 1;
  if (a.q4_followup==="didnt_know" && practicing) s.started_but_stalled += 1;
  if (practicing && ["alone","informal"].includes(a.q8_practitioner)) s.practicing_alone += 2;
  if (practicing && a.q6_rhythm==="sometimes") s.practicing_alone += 1;
  if (practicing && a.q8_practitioner==="yes" && a.q4_followup==="kept_meeting" && a.q6_rhythm==="consistently") s.reproducing_widen += 4;
  const ranked = Object.entries(s).sort((x,y)=>y[1]-x[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "learning_not_practicing";
}

const OUTCOME_KEYS = Object.keys(NEXT_STEP.outcomes);
const PERSONAS = {
  learner:    {q1_recency:"months",q2_field:"one_two",q3_tool:"learned_not_used",q4_followup:"no_one",q5_consume:"learning_more",q6_rhythm:"whenever",q8_practitioner:"alone"},
  nofield:    {q1_recency:"longer",q2_field:"around_christians",q3_tool:"none",q4_followup:"no_one",q5_consume:"learning_more",q6_rhythm:"whenever",q8_practitioner:"alone"},
  intender:   {q1_recency:"longer",q2_field:"several",q3_tool:"once_twice",q4_followup:"meant_to",q5_consume:"even",q6_rhythm:"whenever",q8_practitioner:"alone"},
  stalled:    {q1_recency:"this_month",q2_field:"several",q3_tool:"once_twice",q4_followup:"didnt_know",q5_consume:"even",q6_rhythm:"sometimes",q7_stalled:"yes",q8_practitioner:"informal"},
  alone:      {q1_recency:"this_week",q2_field:"several",q3_tool:"recently",q4_followup:"kept_meeting",q5_consume:"practicing_more",q6_rhythm:"sometimes",q7_stalled:"no",q8_practitioner:"alone"},
  reproducing:{q1_recency:"this_week",q2_field:"several",q3_tool:"recently",q4_followup:"kept_meeting",q5_consume:"practicing_more",q6_rhythm:"consistently",q7_stalled:"no",q8_practitioner:"yes"},
};

console.log("Disciple Maker V2 — contract & routing tests\n");

// ── 1. Outcome map completeness (results copy + server email map) ───────────
test("results.html COPY covers all 6 outcomes", () => {
  const html = read("disciple-maker/results.html");
  for (const k of OUTCOME_KEYS) assert(new RegExp(`\\b${k}\\s*:`).test(html), `missing COPY.${k}`);
});
test("v2-submit OUTCOMES covers all 6 outcomes", () => {
  const ts = read("supabase/functions/disciple-maker-v2-submit/index.ts");
  for (const k of OUTCOME_KEYS) assert(new RegExp(`\\b${k}\\s*:`).test(ts), `missing OUTCOMES.${k}`);
});

// ── 2. Routing: every persona yields exactly 2 valid, distinct candidates ────
for (const [name, a] of Object.entries(PERSONAS)) {
  test(`candidates valid & distinct — ${name}`, () => {
    const c = NEXT_STEP.candidateOutcomes(a);
    assert.strictEqual(c.length, 2, "expected 2 candidates");
    assert(c[0] !== c[1], "candidates must differ");
    c.forEach((k) => assert(OUTCOME_KEYS.includes(k), "unknown outcome " + k));
  });
}
test("empty answers still yields a safe default", () => {
  const c = NEXT_STEP.candidateOutcomes({});
  assert.strictEqual(c.length, 2);
  assert(OUTCOME_KEYS.includes(c[0]));
});

// ── 3. Client↔server routing parity (confirm vs server fallback agree) ───────
for (const [name, a] of Object.entries(PERSONAS)) {
  test(`client top-1 === server derive — ${name}`, () => {
    const clientTop = NEXT_STEP.scoreOutcomes(a)[0].key;
    assert.strictEqual(clientTop, serverDerive(a), `client ${clientTop} vs server ${serverDerive(a)}`);
  });
}

// ── 4. Branching: q7 only shown to people who've started ────────────────────
test("q7 hidden for a pure beginner", () => {
  const ids = NEXT_STEP.activeQuestions(PERSONAS.nofield).map((q) => q.id);
  assert(!ids.includes("q7_stalled"), "q7 should be hidden");
});
test("q7 shown for someone practicing", () => {
  const ids = NEXT_STEP.activeQuestions(PERSONAS.alone).map((q) => q.id);
  assert(ids.includes("q7_stalled"), "q7 should be shown");
});

// ── 5. Versioned endpoints: V2 frontend must NOT touch V1 endpoints ──────────
test("take.html posts to disciple-maker-v2-submit (not V1)", () => {
  const html = read("disciple-maker/take.html");
  assert(html.includes("disciple-maker-v2-submit"), "must call v2-submit");
  assert(!/\/disciple-maker-submit`/.test(html), "must not call V1 submit");
});
test("results.html reads disciple-maker-v2-results (not V1)", () => {
  const html = read("disciple-maker/results.html");
  assert(html.includes("disciple-maker-v2-results"), "must call v2-results");
  assert(!/\/disciple-maker-results\?token=/.test(html), "must not call V1 results");
});
test("frontend uses versioned event endpoint", () => {
  assert(read("disciple-maker/take.html").includes("disciple-maker-v2-event"));
  assert(read("disciple-maker/results.html").includes("disciple-maker-v2-event"));
});

// ── 6. Request/response contract shapes ──────────────────────────────────────
test("v2-submit contract: reads answers+recognition_outcome, returns results_token", () => {
  const ts = read("supabase/functions/disciple-maker-v2-submit/index.ts");
  assert(/const \{ session_id, session_token, answers, recognition_outcome, note \}/.test(ts));
  assert(/results_token:\s*resultsToken/.test(ts));
});
test("v2-results contract: returns recognition_outcome + legacy branch", () => {
  const ts = read("supabase/functions/disciple-maker-v2-results/index.ts");
  assert(/recognition_outcome:\s*session\.recognition_outcome/.test(ts));
  assert(/legacy:\s*true/.test(ts), "must return legacy:true for V1 rows");
});
test("results.html handles legacy + expired states", () => {
  const html = read("disciple-maker/results.html");
  assert(/data\.legacy/.test(html), "must branch on legacy");
  assert(/function showLegacy/.test(html), "must render legacy view");
  assert(/function showError/.test(html), "must render expired/not-found view");
});

// ── 7. Regression guard: V1 endpoints remain untouched (rollback safety) ─────
test("V1 disciple-maker-submit still reads `responses`", () => {
  const ts = read("supabase/functions/disciple-maker-submit/index.ts");
  assert(/const \{ session_id, session_token, responses \}/.test(ts), "V1 submit contract changed!");
});
test("V1 disciple-maker-results still returns dimension_scores/pathway", () => {
  const ts = read("supabase/functions/disciple-maker-results/index.ts");
  assert(/dimension_scores:/.test(ts) && /pathway:/.test(ts), "V1 results contract changed!");
});

// ── 8. Resume flow unchanged (shared start/resume; sessionStorage keys) ──────
test("resume + take share session keys via disciple-maker-start/resume", () => {
  assert(read("disciple-maker/resume.html").includes("disciple-maker-resume"));
  assert(read("disciple-maker/take.html").includes("dm_session_id"));
  assert(read("disciple-maker/take.html").includes("dm_session_token"));
});

// ── 9. v2-followup skips legacy rows (no duplicate/broken legacy emails) ─────
test("v2-followup only nudges V2 rows (recognition_outcome not null)", () => {
  const ts = read("supabase/functions/disciple-maker-v2-followup/index.ts");
  assert(/\.not\(\s*["']recognition_outcome["']\s*,\s*["']is["']\s*,\s*null\s*\)/.test(ts));
});
test("cron points at v2-followup", () => {
  assert(read(".github/workflows/send-disciple-maker-cfc-followup.yml").includes("disciple-maker-v2-followup"));
});

// ── 10. Deploy workflow ships all four v2 functions ─────────────────────────
test("deploy workflow deploys the 4 v2 functions", () => {
  const yml = read(".github/workflows/deploy-supabase-functions.yml");
  ["v2-submit","v2-results","v2-event","v2-followup"].forEach((f) =>
    assert(yml.includes("disciple-maker-" + f), "missing deploy for " + f));
});

console.log(`\n${passed} checks passed`);
