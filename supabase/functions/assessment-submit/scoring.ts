// supabase/functions/assessment-submit/scoring.ts
//
// Pure shared module. Imported by both index.ts and scoring.test.ts.
// No Deno runtime, no Supabase client, no environment access.

export function shouldFlagShadow(
  evidenceLabel: string,
  scored: number,
): boolean {
  return evidenceLabel === "F" && scored <= 2;
}
