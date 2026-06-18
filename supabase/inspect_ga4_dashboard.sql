-- supabase/inspect_ga4_dashboard.sql
--
-- Phase 3B-1 verification: GA4 dashboard Supabase-side checks.
-- Run in the Supabase SQL editor (read-only — no mutations here).
--
-- What this checks:
--   1. Existing analytics functions are still intact.
--   2. No GA4 credentials have been accidentally stored in the database.
--   3. No new schema changes were introduced by Phase 3B-1 (none expected).
--   4. Config sanity: ga4-admin lives entirely in an Edge Function; no DB tables.

-- ---------------------------------------------------------------------------
-- 1. Verify existing analytics RPCs still exist
-- ---------------------------------------------------------------------------
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
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
ORDER BY routine_name;
-- Expected: 9 rows, all FUNCTION, all DEFINER

-- ---------------------------------------------------------------------------
-- 2. Confirm no GA credentials are stored in database
-- ---------------------------------------------------------------------------
SELECT
  table_schema,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE column_name ILIKE ANY (ARRAY[
  '%ga4%',
  '%google_key%',
  '%service_account%',
  '%private_key%',
  '%client_email%'
])
ORDER BY table_schema, table_name, column_name;
-- Expected: 0 rows (GA credentials live only in Supabase Edge Function secrets)

-- ---------------------------------------------------------------------------
-- 3. Confirm no new tables were introduced by Phase 3B-1
-- ---------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE ANY (ARRAY['%ga4%', '%google_analytics%', '%external_metrics%'])
ORDER BY table_name;
-- Expected: 0 rows (Phase 3B-1 queries GA4 live; no storage tables yet)

-- ---------------------------------------------------------------------------
-- 4. Spot-check UTM columns still exist (bridge table uses these)
-- ---------------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'registrations'
  AND column_name  ILIKE 'utm_%'
ORDER BY column_name;
-- Expected: utm_campaign, utm_content, utm_medium, utm_source, utm_term
--           + first_utm_* variants (10 columns total)

-- ---------------------------------------------------------------------------
-- Manual Edge Function test (run from terminal, not SQL editor)
-- ---------------------------------------------------------------------------
-- Replace <SECRET> with the value of ADMIN_ANALYTICS_SECRET.
-- Replace <SUPABASE_URL> with https://mryjrvinzbxebzvxtggi.supabase.co
--
-- 1. Overview:
--    curl -s -X POST <SUPABASE_URL>/functions/v1/ga4-admin \
--      -H "Content-Type: application/json" \
--      -H "x-admin-secret: <SECRET>" \
--      -d '{"action":"overview","startDate":"2024-01-01","endDate":"2024-12-31"}' | jq .
--
-- 2. Traffic sources:
--    curl -s -X POST <SUPABASE_URL>/functions/v1/ga4-admin \
--      -H "Content-Type: application/json" \
--      -H "x-admin-secret: <SECRET>" \
--      -d '{"action":"traffic_sources","startDate":"2024-01-01","endDate":"2024-12-31"}' | jq .
--
-- 3. Events:
--    curl -s -X POST <SUPABASE_URL>/functions/v1/ga4-admin \
--      -H "Content-Type: application/json" \
--      -H "x-admin-secret: <SECRET>" \
--      -d '{"action":"events","startDate":"2024-01-01","endDate":"2024-12-31"}' | jq .
--
-- Expected: { "success": true, "data": { ... }, "generated_at": "..." }
-- If GA4 secrets are not yet configured: { "success": false, "error": "GA4 credentials not configured." }
-- If secret is wrong:                   { "success": false, "error": "Unauthorized." }
