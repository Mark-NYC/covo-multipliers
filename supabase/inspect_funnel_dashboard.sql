-- supabase/inspect_funnel_dashboard.sql
--
-- Verification queries for Phase 3A funnel dashboard functions.
-- Run against the Supabase project to confirm correct deployment.

-- =============================================================================
-- 1. Check all 9 functions exist
-- =============================================================================
SELECT proname, pronargs
FROM pg_proc
WHERE proname IN (
  'get_funnel_overview',
  'get_cohort_funnel',
  'get_funnel_activity',
  'get_acquisition_breakdown',
  'get_lab_performance',
  'get_audience_movement',
  'get_assessment_pathway',
  'get_data_health',
  'get_contact_funnel_history'
)
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
-- Expected: 9 rows

-- =============================================================================
-- 2. Check all 9 have SECURITY DEFINER (prosecdef = true)
-- =============================================================================
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN (
  'get_funnel_overview',
  'get_cohort_funnel',
  'get_funnel_activity',
  'get_acquisition_breakdown',
  'get_lab_performance',
  'get_audience_movement',
  'get_assessment_pathway',
  'get_data_health',
  'get_contact_funnel_history'
)
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
-- Expected: all prosecdef = true

-- =============================================================================
-- 3. Check all 9 have search_path in proconfig
-- =============================================================================
SELECT proname, proconfig
FROM pg_proc
WHERE proname IN (
  'get_funnel_overview',
  'get_cohort_funnel',
  'get_funnel_activity',
  'get_acquisition_breakdown',
  'get_lab_performance',
  'get_audience_movement',
  'get_assessment_pathway',
  'get_data_health',
  'get_contact_funnel_history'
)
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
-- Expected: proconfig contains search_path=pg_catalog, public for all 9

-- =============================================================================
-- 4. Check service_role has EXECUTE on all 9
-- =============================================================================
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_funnel_overview',
    'get_cohort_funnel',
    'get_funnel_activity',
    'get_acquisition_breakdown',
    'get_lab_performance',
    'get_audience_movement',
    'get_assessment_pathway',
    'get_data_health',
    'get_contact_funnel_history'
  )
  AND grantee = 'service_role'
ORDER BY routine_name;
-- Expected: 9 rows with privilege_type = 'EXECUTE'

-- =============================================================================
-- 5. Check no anon or authenticated EXECUTE grants
-- =============================================================================
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_funnel_overview',
    'get_cohort_funnel',
    'get_funnel_activity',
    'get_acquisition_breakdown',
    'get_lab_performance',
    'get_audience_movement',
    'get_assessment_pathway',
    'get_data_health',
    'get_contact_funnel_history'
  )
  AND grantee IN ('anon', 'authenticated')
ORDER BY routine_name, grantee;
-- Expected: 0 rows

-- =============================================================================
-- 6. Assessment inconsistency check (should ideally be 0)
--    submitted_at IS NOT NULL but status not in (submitted, scored)
--    OR status in (submitted, scored) but submitted_at IS NULL
-- =============================================================================
SELECT
  COUNT(*) FILTER (WHERE submitted_at IS NOT NULL AND status NOT IN ('submitted','scored')) AS submitted_at_but_wrong_status,
  COUNT(*) FILTER (WHERE status IN ('submitted','scored') AND submitted_at IS NULL)         AS right_status_but_no_submitted_at,
  COUNT(*) AS total_inconsistencies
FROM assessment_sessions
WHERE
  (submitted_at IS NOT NULL AND status NOT IN ('submitted','scored'))
  OR (status IN ('submitted','scored') AND submitted_at IS NULL);
-- Expected: 0 total_inconsistencies (data quality check)

-- =============================================================================
-- 7. Cohort funnel sample (wide range)
-- =============================================================================
SELECT get_cohort_funnel(
  '2020-01-01T00:00:00Z'::timestamptz,
  now()
);

-- =============================================================================
-- 8. Data health sample (last 90 days)
-- =============================================================================
SELECT get_data_health(
  (now() - interval '90 days')::timestamptz,
  now()::timestamptz
);

-- =============================================================================
-- 9. Overview sample (last 30 days)
-- =============================================================================
SELECT get_funnel_overview(
  (now() - interval '30 days')::timestamptz,
  now()::timestamptz
);
