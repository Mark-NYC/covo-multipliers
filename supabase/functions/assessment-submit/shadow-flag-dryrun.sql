-- =============================================================================
-- Shadow Flag Bug Dry-Run Analysis
-- Run in Supabase SQL Editor. Read-only — no writes.
--
-- Purpose: identify which existing assessment_results rows have caution flags
-- that would change under the corrected shadow flag condition (scored <= 2).
--
-- The corrected condition fires when scored <= 2, i.e. rawNum >= 5.
-- The old buggy condition fired when scored >= 5, i.e. rawNum <= 2.
--
-- This query does NOT expose names, emails, tokens, answers, or response text.
-- It reports only counts and structural descriptions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: All shadow item pilot_ids and their domains (no scoring data)
-- ---------------------------------------------------------------------------
WITH shadow_items AS (
  SELECT pilot_id, domain_key
  FROM assessment_items
  WHERE evidence_label = 'F'
    AND reverse_keyed = true
    AND is_active = true
),

-- ---------------------------------------------------------------------------
-- Step 2: For each completed session, find shadow-item responses
-- Includes only sessions that have a result row (scored sessions).
-- response_num is the stored numeric value (1–6); NULL for option items.
-- ---------------------------------------------------------------------------
shadow_responses AS (
  SELECT
    ar.id                          AS result_id,
    ar.session_id,
    resp.pilot_id,
    si.domain_key,
    resp.response_num::int         AS raw,
    -- Old (buggy) condition: fired when scored >= 5, i.e. raw <= 2
    CASE WHEN resp.response_num::int <= 2 THEN true ELSE false END AS old_flag_fires,
    -- New (correct) condition: fires when scored <= 2, i.e. raw >= 5
    CASE WHEN resp.response_num::int >= 5 THEN true ELSE false END AS new_flag_fires
  FROM assessment_results ar
  JOIN assessment_responses resp
    ON resp.session_id = ar.session_id
  JOIN shadow_items si
    ON si.pilot_id = resp.pilot_id
  WHERE resp.response_num IS NOT NULL   -- scale items only; SC4/FC have no response_num
),

-- ---------------------------------------------------------------------------
-- Step 3: Per-result flag summary under old vs new conditions
-- ---------------------------------------------------------------------------
per_result AS (
  SELECT
    result_id,
    session_id,
    COUNT(*) FILTER (WHERE old_flag_fires)   AS old_flag_count,
    COUNT(*) FILTER (WHERE new_flag_fires)   AS new_flag_count,
    COUNT(*) FILTER (WHERE old_flag_fires AND NOT new_flag_fires) AS false_flags_to_remove,
    COUNT(*) FILTER (WHERE new_flag_fires AND NOT old_flag_fires) AS missing_flags_to_add,
    -- Whether both kinds of change occur in the same result (rare)
    (COUNT(*) FILTER (WHERE old_flag_fires AND NOT new_flag_fires) > 0
     AND COUNT(*) FILTER (WHERE new_flag_fires AND NOT old_flag_fires) > 0) AS has_both_changes
  FROM shadow_responses
  GROUP BY result_id, session_id
)

-- ---------------------------------------------------------------------------
-- Step 4: Summary output — no private data
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*)                                                AS total_results_checked,
  COUNT(*) FILTER (WHERE old_flag_count != new_flag_count)  AS results_with_flag_change,
  SUM(false_flags_to_remove)                              AS total_false_flags_to_remove,
  SUM(missing_flags_to_add)                               AS total_missing_flags_to_add,
  COUNT(*) FILTER (WHERE has_both_changes)                AS results_with_both_change_types,
  -- Breakdown by impact type
  COUNT(*) FILTER (WHERE false_flags_to_remove > 0 AND missing_flags_to_add = 0)
                                                          AS results_only_losing_false_flags,
  COUNT(*) FILTER (WHERE missing_flags_to_add > 0 AND false_flags_to_remove = 0)
                                                          AS results_only_gaining_missing_flags
FROM per_result;
