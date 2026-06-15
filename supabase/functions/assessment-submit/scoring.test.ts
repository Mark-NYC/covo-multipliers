// scoring.test.ts
//
// Unit tests for shouldFlagShadow() — the shared shadow-flag predicate.
//
// Run with:
//   deno test supabase/functions/assessment-submit/scoring.test.ts
//
// These tests import the exact function used by index.ts (production).
// They do NOT copy or re-implement any scoring logic.
//
// Shadow items are reverse_keyed=true with max=6.
// Scoring formula: scored = (max + 1) - rawNum = 7 - rawNum
// Flag condition:  shouldFlagShadow("F", scored) ← scored <= 2 ← rawNum >= 5
//
//   raw 1 → scored 6 → no flag
//   raw 2 → scored 5 → no flag
//   raw 3 → scored 4 → no flag
//   raw 4 → scored 3 → no flag
//   raw 5 → scored 2 → FLAG
//   raw 6 → scored 1 → FLAG

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldFlagShadow } from "./scoring.ts";

// ---------------------------------------------------------------------------
// Direct unit tests: shouldFlagShadow(evidenceLabel, scored)
// ---------------------------------------------------------------------------

// evidence_label = "F", all scored values 1 through 6

Deno.test("F label, scored 1 → flag (raw 6: strong agreement with shadow)", () => {
  assertEquals(shouldFlagShadow("F", 1), true);
});

Deno.test("F label, scored 2 → flag (raw 5: agreement with shadow)", () => {
  assertEquals(shouldFlagShadow("F", 2), true);
});

Deno.test("F label, scored 3 → no flag (raw 4: mild agreement)", () => {
  assertEquals(shouldFlagShadow("F", 3), false);
});

Deno.test("F label, scored 4 → no flag (raw 3: mild disagreement)", () => {
  assertEquals(shouldFlagShadow("F", 4), false);
});

Deno.test("F label, scored 5 → no flag (raw 2: disagreement)", () => {
  assertEquals(shouldFlagShadow("F", 5), false);
});

Deno.test("F label, scored 6 → no flag (raw 1: strong disagreement)", () => {
  assertEquals(shouldFlagShadow("F", 6), false);
});

// ---------------------------------------------------------------------------
// Non-shadow evidence labels never flag — at every scored value
// ---------------------------------------------------------------------------

for (const label of ["A", "B", "X", "E", ""]) {
  for (const scored of [1, 2, 3, 4, 5, 6]) {
    Deno.test(`Non-shadow label "${label}", scored ${scored} → no flag`, () => {
      assertEquals(shouldFlagShadow(label, scored), false);
    });
  }
}

// ---------------------------------------------------------------------------
// Raw-response translation through the reverse-key formula
// These verify the formula that index.ts uses before calling shouldFlagShadow.
// They do NOT call computeScore — they document the expected chain.
// ---------------------------------------------------------------------------

Deno.test("AGR6 shadow reverse-key chain: raw 5 → scored 2 → shouldFlagShadow = true", () => {
  const max = 6;           // AGR6
  const rawNum = 5;
  const scored = (max + 1) - rawNum;  // 2
  assertEquals(scored, 2);
  assertEquals(shouldFlagShadow("F", scored), true);
});

Deno.test("AGR6 shadow reverse-key chain: raw 6 → scored 1 → shouldFlagShadow = true", () => {
  const max = 6;
  const rawNum = 6;
  const scored = (max + 1) - rawNum;  // 1
  assertEquals(scored, 1);
  assertEquals(shouldFlagShadow("F", scored), true);
});

Deno.test("AGR6 shadow reverse-key chain: raw 4 → scored 3 → shouldFlagShadow = false", () => {
  const max = 6;
  const rawNum = 4;
  const scored = (max + 1) - rawNum;  // 3
  assertEquals(scored, 3);
  assertEquals(shouldFlagShadow("F", scored), false);
});

Deno.test("AGR6 shadow reverse-key chain: raw 1 → scored 6 → shouldFlagShadow = false", () => {
  const max = 6;
  const rawNum = 1;
  const scored = (max + 1) - rawNum;  // 6
  assertEquals(scored, 6);
  assertEquals(shouldFlagShadow("F", scored), false);
});

Deno.test("EX6 shadow reverse-key chain: raw 5 → scored 2 → shouldFlagShadow = true", () => {
  const max = 6;           // EX6 also has max=6
  const rawNum = 5;
  const scored = (max + 1) - rawNum;  // 2
  assertEquals(scored, 2);
  assertEquals(shouldFlagShadow("F", scored), true);
});

Deno.test("EX6 shadow reverse-key chain: raw 6 → scored 1 → shouldFlagShadow = true", () => {
  const max = 6;
  const rawNum = 6;
  const scored = (max + 1) - rawNum;  // 1
  assertEquals(scored, 1);
  assertEquals(shouldFlagShadow("F", scored), true);
});

Deno.test("EX6 shadow reverse-key chain: raw 4 → scored 3 → shouldFlagShadow = false", () => {
  const max = 6;
  const rawNum = 4;
  const scored = (max + 1) - rawNum;  // 3
  assertEquals(scored, 3);
  assertEquals(shouldFlagShadow("F", scored), false);
});

Deno.test("EX6 shadow reverse-key chain: raw 1 → scored 6 → shouldFlagShadow = false", () => {
  const max = 6;
  const rawNum = 1;
  const scored = (max + 1) - rawNum;  // 6
  assertEquals(scored, 6);
  assertEquals(shouldFlagShadow("F", scored), false);
});
