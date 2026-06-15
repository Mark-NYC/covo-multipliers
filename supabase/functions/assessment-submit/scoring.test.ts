// scoring.test.ts
//
// Unit tests for the shadow-flag condition in computeScore().
//
// Run with: deno test scoring.test.ts
//
// These tests verify the shadow flag condition introduced in the fix to
// assessment-submit/index.ts (shadow flag direction bug).
//
// Design note:
//   Shadow items are reverse_keyed=true with max=6.
//   Scoring formula: scored = (max + 1) - rawNum = 7 - rawNum
//   Flag condition:  scored <= 2  ⟺  rawNum >= 5
//
//   raw 1 (strong disagreement with shadow statement) → scored 6 → NO flag
//   raw 2 (disagreement)                             → scored 5 → NO flag
//   raw 3 (mild disagreement)                        → scored 4 → NO flag
//   raw 4 (mild agreement)                           → scored 3 → NO flag
//   raw 5 (agreement with shadow statement)          → scored 2 → FLAG
//   raw 6 (strong agreement with shadow statement)   → scored 1 → FLAG
//
// The domain score accumulation (raw, weighted, item_count) is unchanged.
// The flag condition is a read-only evaluation after accumulation.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ---------------------------------------------------------------------------
// Mirror the exact types and constants from index.ts
// ---------------------------------------------------------------------------

const FORMAT_MAX: Record<string, number> = {
  AGR6: 6, FREQ6: 6, EX6: 6, SC4: 4, FC2: 2, FC3: 3,
};

interface ScoringRule {
  pilot_id: string;
  domain_key: string;
  construct_key: string | null;
  evidence_label: string;
  reverse_keyed: boolean;
  weight: number;
  scoring_map?: Record<string, Record<string, number>>;
}

interface DomainScore {
  raw: number;
  weighted: number;
  item_count: number;
  evidence_counts: Record<string, number>;
  evidence_scores: Record<string, { score: number; item_count: number }>;
  construct_scores: Record<string, { raw: number; item_count: number }>;
}

function initDomain(map: Record<string, DomainScore>, dk: string) {
  map[dk] = {
    raw: 0, weighted: 0, item_count: 0,
    evidence_counts: {}, evidence_scores: {}, construct_scores: {},
  };
}

// ---------------------------------------------------------------------------
// Exact copy of computeScore from index.ts (fixed version)
// ---------------------------------------------------------------------------

function computeScore(
  responses: Array<{ pilot_id: string; response_raw: string; response_num: number | null }>,
  rules: ScoringRule[],
  itemFormats: Record<string, string>,
): {
  domain_scores: Record<string, DomainScore>;
  shadow_flags: Array<{ pilot_id: string; domain_key: string; note: string }>;
} {
  const responseMap = new Map(responses.map((r) => [r.pilot_id, r]));
  const domainScores: Record<string, DomainScore> = {};
  const shadowFlags: Array<{ pilot_id: string; domain_key: string; note: string }> = [];

  for (const rule of rules) {
    const resp = responseMap.get(rule.pilot_id);
    if (!resp) continue;

    const format = itemFormats[rule.pilot_id] ?? "AGR6";
    const max = FORMAT_MAX[format] ?? 6;

    if (rule.scoring_map) {
      const optionScores = rule.scoring_map[resp.response_raw] ?? {};
      for (const [dk, pts] of Object.entries(optionScores)) {
        if (!domainScores[dk]) initDomain(domainScores, dk);
        domainScores[dk].raw += pts * (rule.weight ?? 1.0);
        domainScores[dk].weighted += pts * (rule.weight ?? 1.0);
        domainScores[dk].item_count += 1;
        domainScores[dk].evidence_counts[rule.evidence_label] =
          (domainScores[dk].evidence_counts[rule.evidence_label] ?? 0) + 1;
        if (rule.evidence_label !== "F") {
          if (!domainScores[dk].evidence_scores[rule.evidence_label]) {
            domainScores[dk].evidence_scores[rule.evidence_label] = { score: 0, item_count: 0 };
          }
          domainScores[dk].evidence_scores[rule.evidence_label].score += pts * (rule.weight ?? 1.0);
          domainScores[dk].evidence_scores[rule.evidence_label].item_count += 1;
        }
      }
      continue;
    }

    const rawNum = resp.response_num ?? parseInt(resp.response_raw, 10);
    if (isNaN(rawNum)) continue;

    const scored = rule.reverse_keyed ? (max + 1) - rawNum : rawNum;
    const points = scored * (rule.weight ?? 1.0);

    const dk = rule.domain_key;
    if (!domainScores[dk]) initDomain(domainScores, dk);

    domainScores[dk].raw += scored;
    domainScores[dk].weighted += points;
    domainScores[dk].item_count += 1;
    domainScores[dk].evidence_counts[rule.evidence_label] =
      (domainScores[dk].evidence_counts[rule.evidence_label] ?? 0) + 1;

    if (rule.construct_key) {
      if (!domainScores[dk].construct_scores[rule.construct_key]) {
        domainScores[dk].construct_scores[rule.construct_key] = { raw: 0, item_count: 0 };
      }
      domainScores[dk].construct_scores[rule.construct_key].raw += scored;
      domainScores[dk].construct_scores[rule.construct_key].item_count += 1;
    }

    if (rule.evidence_label !== "F") {
      if (!domainScores[dk].evidence_scores[rule.evidence_label]) {
        domainScores[dk].evidence_scores[rule.evidence_label] = { score: 0, item_count: 0 };
      }
      domainScores[dk].evidence_scores[rule.evidence_label].score += points;
      domainScores[dk].evidence_scores[rule.evidence_label].item_count += 1;
    }

    // Shadow flag: fires when the respondent agreed with a shadow statement (raw 5 or 6).
    // All shadow items are reverse_keyed=true with max=6, so raw >= 5 produces scored <= 2.
    // Checking scored <= 2 correctly catches agreement for both AGR6 and EX6 formats.
    if (rule.evidence_label === "F" && scored <= 2) {
      shadowFlags.push({
        pilot_id: rule.pilot_id,
        domain_key: dk,
        note: `One of your answers raised a caution flag in the ${dk} pattern. Hold that score more loosely and test it with people who know you.`,
      });
    }
  }

  return { domain_scores: domainScores, shadow_flags: shadowFlags };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// One AGR6 shadow rule representative of all 9 AGR6 shadow items in the bank.
const AGR6_SHADOW_RULE: ScoringRule = {
  pilot_id: "PP-012",
  domain_key: "prophetic",
  construct_key: "PL-4",
  evidence_label: "F",
  reverse_keyed: true,
  weight: 1.0,
};

// One EX6 shadow rule representative of PAD-010 (only EX6 shadow item).
const EX6_SHADOW_RULE: ScoringRule = {
  pilot_id: "PAD-010",
  domain_key: "apostolic_direction",
  construct_key: "FI-1",
  evidence_label: "F",
  reverse_keyed: true,
  weight: 1.0,
};

// One normal (non-shadow) A-evidence forward-keyed rule for scoring sanity checks.
const NORMAL_RULE: ScoringRule = {
  pilot_id: "PP-002",
  domain_key: "prophetic",
  construct_key: "PL-1",
  evidence_label: "A",
  reverse_keyed: false,
  weight: 1.0,
};

function makeResp(pilot_id: string, raw: number) {
  return { pilot_id, response_raw: String(raw), response_num: raw };
}

function runSingle(rule: ScoringRule, raw: number): {
  scored: number;
  domainWeighted: number;
  domainItemCount: number;
  flagCount: number;
} {
  const format = rule.evidence_label === "F" && rule.pilot_id === "PAD-010" ? "EX6" : "AGR6";
  const { domain_scores, shadow_flags } = computeScore(
    [makeResp(rule.pilot_id, raw)],
    [rule],
    { [rule.pilot_id]: format },
  );
  const ds = domain_scores[rule.domain_key];
  const max = FORMAT_MAX[format];
  const scored = rule.reverse_keyed ? (max + 1) - raw : raw;
  return {
    scored,
    domainWeighted: ds?.weighted ?? 0,
    domainItemCount: ds?.item_count ?? 0,
    flagCount: shadow_flags.length,
  };
}

// ---------------------------------------------------------------------------
// Tests: AGR6 shadow item — all six raw responses
// ---------------------------------------------------------------------------

Deno.test("AGR6 shadow — raw 1 (strongly disagree): no flag, score = 6", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 1);
  assertEquals(r.scored, 6, "reverse-keyed score");
  assertEquals(r.domainWeighted, 6, "domain weighted contribution");
  assertEquals(r.domainItemCount, 1, "item counted once");
  assertEquals(r.flagCount, 0, "no caution flag");
});

Deno.test("AGR6 shadow — raw 2 (disagree): no flag, score = 5", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 2);
  assertEquals(r.scored, 5);
  assertEquals(r.domainWeighted, 5);
  assertEquals(r.domainItemCount, 1);
  assertEquals(r.flagCount, 0, "no caution flag");
});

Deno.test("AGR6 shadow — raw 3 (somewhat disagree): no flag, score = 4", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 3);
  assertEquals(r.scored, 4);
  assertEquals(r.domainWeighted, 4);
  assertEquals(r.domainItemCount, 1);
  assertEquals(r.flagCount, 0, "no caution flag");
});

Deno.test("AGR6 shadow — raw 4 (somewhat agree): no flag, score = 3", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 4);
  assertEquals(r.scored, 3);
  assertEquals(r.domainWeighted, 3);
  assertEquals(r.domainItemCount, 1);
  assertEquals(r.flagCount, 0, "no caution flag at mild agreement");
});

Deno.test("AGR6 shadow — raw 5 (agree): flag fires, score = 2", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 5);
  assertEquals(r.scored, 2);
  assertEquals(r.domainWeighted, 2, "domain score still accumulates");
  assertEquals(r.domainItemCount, 1, "item still counted");
  assertEquals(r.flagCount, 1, "caution flag fires at raw 5");
});

Deno.test("AGR6 shadow — raw 6 (strongly agree): flag fires, score = 1", () => {
  const r = runSingle(AGR6_SHADOW_RULE, 6);
  assertEquals(r.scored, 1);
  assertEquals(r.domainWeighted, 1, "domain score still accumulates");
  assertEquals(r.domainItemCount, 1, "item still counted");
  assertEquals(r.flagCount, 1, "caution flag fires at raw 6");
});

// ---------------------------------------------------------------------------
// Tests: EX6 shadow item (PAD-010) — all six raw responses
// ---------------------------------------------------------------------------

Deno.test("EX6 shadow — raw 1 (no examples): no flag, score = 6", () => {
  const r = runSingle(EX6_SHADOW_RULE, 1);
  assertEquals(r.scored, 6);
  assertEquals(r.domainWeighted, 6);
  assertEquals(r.flagCount, 0, "no caution flag when person cannot identify impulsive examples");
});

Deno.test("EX6 shadow — raw 2 (one with effort): no flag, score = 5", () => {
  const r = runSingle(EX6_SHADOW_RULE, 2);
  assertEquals(r.scored, 5);
  assertEquals(r.flagCount, 0);
});

Deno.test("EX6 shadow — raw 3 (one clearly): no flag, score = 4", () => {
  const r = runSingle(EX6_SHADOW_RULE, 3);
  assertEquals(r.scored, 4);
  assertEquals(r.flagCount, 0);
});

Deno.test("EX6 shadow — raw 4 (more than one): no flag, score = 3", () => {
  const r = runSingle(EX6_SHADOW_RULE, 4);
  assertEquals(r.scored, 3);
  assertEquals(r.flagCount, 0, "no flag at moderate shadow example density");
});

Deno.test("EX6 shadow — raw 5 (several examples): flag fires, score = 2", () => {
  const r = runSingle(EX6_SHADOW_RULE, 5);
  assertEquals(r.scored, 2);
  assertEquals(r.domainWeighted, 2, "domain score still accumulates");
  assertEquals(r.flagCount, 1, "caution flag fires at several shadow examples");
});

Deno.test("EX6 shadow — raw 6 (others could confirm): flag fires, score = 1", () => {
  const r = runSingle(EX6_SHADOW_RULE, 6);
  assertEquals(r.scored, 1);
  assertEquals(r.domainWeighted, 1, "domain score still accumulates");
  assertEquals(r.flagCount, 1, "caution flag fires when shadow pattern is confirmed by others");
});

// ---------------------------------------------------------------------------
// Tests: Aggregate flag counts across multiple shadow items
// ---------------------------------------------------------------------------

// All shadow items from the real bank, for aggregate tests
const ALL_SHADOW_RULES: ScoringRule[] = [
  { pilot_id: "PP-012",  domain_key: "prophetic",              construct_key: "PL-4", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PE-009",  domain_key: "evangelistic",           construct_key: "EV-1", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PS-010",  domain_key: "shepherding",            construct_key: "SH-1", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PT-012",  domain_key: "teaching",               construct_key: "TE-3", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAD-010", domain_key: "apostolic_direction",    construct_key: "FI-1", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAF-003", domain_key: "apostolic_formation",    construct_key: "SD-2", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAF-006", domain_key: "apostolic_formation",    construct_key: "SD-5", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAF-010", domain_key: "apostolic_formation",    construct_key: "SD-2", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAF-011", domain_key: "apostolic_formation",    construct_key: "SD-5", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
  { pilot_id: "PAM-010", domain_key: "apostolic_multiplying",  construct_key: "DT-2", evidence_label: "F", reverse_keyed: true, weight: 1.0 },
];

const ALL_SHADOW_FORMATS: Record<string, string> = {
  "PP-012":  "AGR6",
  "PE-009":  "AGR6",
  "PS-010":  "AGR6",
  "PT-012":  "AGR6",
  "PAD-010": "EX6",
  "PAF-003": "AGR6",
  "PAF-006": "AGR6",
  "PAF-010": "AGR6",
  "PAF-011": "AGR6",
  "PAM-010": "AGR6",
};

Deno.test("No shadow concerns: all shadow items at raw 1-4 → zero flags", () => {
  // Test at various healthy response levels: 1, 2, 3, 4
  for (const healthyRaw of [1, 2, 3, 4]) {
    const responses = ALL_SHADOW_RULES.map((r) => makeResp(r.pilot_id, healthyRaw));
    const { shadow_flags } = computeScore(responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS);
    assertEquals(
      shadow_flags.length, 0,
      `raw=${healthyRaw}: healthy responses should produce zero flags, got ${shadow_flags.length}`,
    );
  }
});

Deno.test("Healthy disagreement with every shadow statement → zero flags", () => {
  // All shadow items answered at raw=1 (strongest healthy response)
  const responses = ALL_SHADOW_RULES.map((r) => makeResp(r.pilot_id, 1));
  const { shadow_flags, domain_scores } = computeScore(
    responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS,
  );
  assertEquals(shadow_flags.length, 0, "zero flags for all healthy responses");
  // Domain scores should still be populated (reverse-keyed contributions are maximum)
  assertEquals(domain_scores["prophetic"].weighted, 6, "prophetic domain score at maximum");
  assertEquals(domain_scores["evangelistic"].weighted, 6, "evangelistic domain score at maximum");
});

Deno.test("One shadow concern at raw=5 → exactly one flag", () => {
  // All shadow items at raw=2 (healthy) except PP-012 at raw=5 (concerning)
  const responses = ALL_SHADOW_RULES.map((r) =>
    makeResp(r.pilot_id, r.pilot_id === "PP-012" ? 5 : 2),
  );
  const { shadow_flags } = computeScore(responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS);
  assertEquals(shadow_flags.length, 1, "exactly one flag");
  assertEquals(shadow_flags[0].pilot_id, "PP-012");
  assertEquals(shadow_flags[0].domain_key, "prophetic");
});

Deno.test("One shadow concern at raw=6 → exactly one flag", () => {
  const responses = ALL_SHADOW_RULES.map((r) =>
    makeResp(r.pilot_id, r.pilot_id === "PE-009" ? 6 : 1),
  );
  const { shadow_flags } = computeScore(responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS);
  assertEquals(shadow_flags.length, 1, "exactly one flag");
  assertEquals(shadow_flags[0].pilot_id, "PE-009");
  assertEquals(shadow_flags[0].domain_key, "evangelistic");
});

Deno.test("Three shadow concerns → exactly three flags", () => {
  // PP-012 at raw=5, PT-012 at raw=6, PAM-010 at raw=5; all others at raw=2
  const concerning = new Set(["PP-012", "PT-012", "PAM-010"]);
  const concerningRaw: Record<string, number> = {
    "PP-012": 5, "PT-012": 6, "PAM-010": 5,
  };
  const responses = ALL_SHADOW_RULES.map((r) =>
    makeResp(r.pilot_id, concerning.has(r.pilot_id) ? concerningRaw[r.pilot_id] : 2),
  );
  const { shadow_flags } = computeScore(responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS);
  assertEquals(shadow_flags.length, 3, "exactly three flags");
  const flaggedIds = new Set(shadow_flags.map((f) => f.pilot_id));
  assertEquals(flaggedIds.has("PP-012"), true, "PP-012 flagged");
  assertEquals(flaggedIds.has("PT-012"), true, "PT-012 flagged");
  assertEquals(flaggedIds.has("PAM-010"), true, "PAM-010 flagged");
});

Deno.test("All ten shadow items at raw=6 → ten flags", () => {
  const responses = ALL_SHADOW_RULES.map((r) => makeResp(r.pilot_id, 6));
  const { shadow_flags } = computeScore(responses, ALL_SHADOW_RULES, ALL_SHADOW_FORMATS);
  assertEquals(shadow_flags.length, 10, "all ten shadow items flagged at raw=6");
});

// ---------------------------------------------------------------------------
// Tests: Domain score values are identical before and after the flag fix
//
// The flag condition is read-only: it does not modify raw, weighted, or item_count.
// These tests confirm that domain contributions are correct and unchanged.
// ---------------------------------------------------------------------------

Deno.test("Shadow flag does not affect domain score accumulation (AGR6, raw=5)", () => {
  // raw=5 on AGR6 shadow → scored=2, domain gets +2 weighted, +1 item_count
  // Flag fires, but the accumulation below is identical to before the fix
  const { domain_scores, shadow_flags } = computeScore(
    [makeResp("PP-012", 5)],
    [AGR6_SHADOW_RULE],
    { "PP-012": "AGR6" },
  );
  const ds = domain_scores["prophetic"];
  assertEquals(ds.raw, 2, "raw score = (7-5) = 2");
  assertEquals(ds.weighted, 2, "weighted = 2 × 1.0");
  assertEquals(ds.item_count, 1, "item counted exactly once");
  assertEquals(ds.evidence_counts["F"], 1, "F evidence count incremented");
  assertEquals(ds.evidence_scores["F"], undefined, "F not added to evidence_scores");
  assertEquals(shadow_flags.length, 1, "flag fires");
});

Deno.test("Shadow flag does not affect domain score accumulation (AGR6, raw=1)", () => {
  // raw=1 on AGR6 shadow → scored=6, domain gets +6 weighted, +1 item_count, NO flag
  const { domain_scores, shadow_flags } = computeScore(
    [makeResp("PP-012", 1)],
    [AGR6_SHADOW_RULE],
    { "PP-012": "AGR6" },
  );
  const ds = domain_scores["prophetic"];
  assertEquals(ds.raw, 6, "raw score = (7-1) = 6");
  assertEquals(ds.weighted, 6, "weighted = 6 × 1.0");
  assertEquals(ds.item_count, 1);
  assertEquals(shadow_flags.length, 0, "no flag at raw=1");
});

Deno.test("Non-shadow items are completely unaffected by shadow flag logic", () => {
  // A normal forward-keyed A-evidence item: no flag regardless of response
  for (const raw of [1, 2, 3, 4, 5, 6]) {
    const { shadow_flags, domain_scores } = computeScore(
      [makeResp("PP-002", raw)],
      [NORMAL_RULE],
      { "PP-002": "AGR6" },
    );
    assertEquals(shadow_flags.length, 0, `raw=${raw}: normal item must never trigger shadow flag`);
    assertEquals(domain_scores["prophetic"].weighted, raw, `raw=${raw}: score = rawNum × 1.0`);
    assertEquals(
      domain_scores["prophetic"].evidence_scores["A"]?.score,
      raw,
      `raw=${raw}: contributes to A evidence_scores`,
    );
  }
});

Deno.test("Mixed: shadow and non-shadow items together — only shadow concerns flagged", () => {
  // PP-002 (normal A, raw=6) + PP-012 (shadow, raw=5) in the same domain
  const rules = [NORMAL_RULE, AGR6_SHADOW_RULE];
  const responses = [makeResp("PP-002", 6), makeResp("PP-012", 5)];
  const { domain_scores, shadow_flags } = computeScore(
    responses, rules, { "PP-002": "AGR6", "PP-012": "AGR6" },
  );
  const ds = domain_scores["prophetic"];
  // PP-002: scored=6, weighted=6; PP-012: scored=2, weighted=2
  assertEquals(ds.weighted, 8, "total weighted = 6 + 2");
  assertEquals(ds.item_count, 2, "two items counted");
  assertEquals(ds.evidence_scores["A"]?.score, 6, "A evidence only from PP-002");
  assertEquals(ds.evidence_scores["F"], undefined, "F not in evidence_scores");
  assertEquals(shadow_flags.length, 1, "exactly one flag from PP-012");
  assertEquals(shadow_flags[0].pilot_id, "PP-012");
});
