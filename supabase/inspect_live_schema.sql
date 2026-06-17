-- =============================================================================
-- COVO MULTIPLIERS — LIVE SCHEMA INSPECTION
-- Run this entire file in the Supabase SQL Editor (read-only; no writes).
-- Paste the full output back before any migrations are written.
-- =============================================================================

-- Tables to inspect. Edit this list if the live database differs.
-- ---------------------------------------------------------------
-- registrations
-- events
-- subscribers
-- lab_interest
-- participants
-- assessment_sessions
-- whatsapp_requests
-- contact_messages
-- immersion_applications
-- admin_audit_log
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. COLUMNS — name, type, default, nullable, position
-- -----------------------------------------------------------------------------
SELECT
  table_name,
  ordinal_position                          AS pos,
  column_name,
  data_type,
  udt_name,                                 -- exact Postgres type (e.g. uuid, int4)
  character_maximum_length                  AS max_len,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY table_name, ordinal_position;


-- -----------------------------------------------------------------------------
-- 2. PRIMARY KEYS
-- -----------------------------------------------------------------------------
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints   tc
JOIN information_schema.key_column_usage     kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY tc.table_name, kcu.ordinal_position;


-- -----------------------------------------------------------------------------
-- 3. FOREIGN KEYS — source column → target table.column
-- -----------------------------------------------------------------------------
SELECT
  tc.table_name                             AS from_table,
  kcu.column_name                           AS from_column,
  ccu.table_name                            AS to_table,
  ccu.column_name                           AS to_column,
  tc.constraint_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints   tc
JOIN information_schema.key_column_usage     kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema   = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = rc.unique_constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY from_table, from_column;


-- -----------------------------------------------------------------------------
-- 4. UNIQUE CONSTRAINTS
-- -----------------------------------------------------------------------------
SELECT
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints   tc
JOIN information_schema.key_column_usage     kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_name;


-- -----------------------------------------------------------------------------
-- 5. CHECK CONSTRAINTS
-- -----------------------------------------------------------------------------
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints   tc
JOIN information_schema.check_constraints   cc
  ON tc.constraint_name = cc.constraint_name
  AND tc.table_schema   = cc.constraint_schema
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY tc.table_name, tc.constraint_name;


-- -----------------------------------------------------------------------------
-- 6. INDEXES (all, including those backing constraints)
-- -----------------------------------------------------------------------------
SELECT
  t.relname                                 AS table_name,
  i.relname                                 AS index_name,
  ix.indisunique                            AS is_unique,
  ix.indisprimary                           AS is_primary,
  array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum::smallint))
                                            AS indexed_columns,
  pg_get_indexdef(ix.indexrelid)            AS index_definition
FROM pg_class      t
JOIN pg_index      ix ON t.oid = ix.indrelid
JOIN pg_class      i  ON i.oid = ix.indexrelid
JOIN pg_attribute  a  ON a.attrelid = t.oid
                      AND a.attnum = ANY(ix.indkey)
JOIN pg_namespace  n  ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relkind = 'r'
  AND t.relname IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary, ix.indexrelid
ORDER BY t.relname, i.relname;


-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY — enabled / forced per table
-- -----------------------------------------------------------------------------
SELECT
  relname                                   AS table_name,
  relrowsecurity                            AS rls_enabled,
  relforcerowsecurity                       AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relkind = 'r'
  AND relname IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY relname;


-- -----------------------------------------------------------------------------
-- 8. RLS POLICIES — name, role, command, using / with-check expressions
-- -----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd                                       AS command,
  qual                                      AS using_expr,
  with_check                                AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY tablename, policyname;


-- -----------------------------------------------------------------------------
-- 9. TRIGGERS — name, timing, events, function called
-- -----------------------------------------------------------------------------
SELECT
  trigger_schema,
  event_object_table                        AS table_name,
  trigger_name,
  event_manipulation                        AS trigger_event,
  action_timing,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY event_object_table, trigger_name, event_manipulation;


-- -----------------------------------------------------------------------------
-- 10. FUNCTIONS / PROCEDURES referenced by triggers or used by edge functions
--     Lists all public functions whose name contains a keyword we care about.
-- -----------------------------------------------------------------------------
SELECT
  routine_name,
  routine_type,
  data_type                                 AS return_type,
  external_language                         AS language,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (
    routine_name ILIKE '%register%'
    OR routine_name ILIKE '%contact%'
    OR routine_name ILIKE '%subscriber%'
    OR routine_name ILIKE '%attendance%'
    OR routine_name ILIKE '%participant%'
    OR routine_name ILIKE '%assessment%'
    OR routine_name ILIKE '%event%'
    OR routine_name ILIKE '%audit%'
    OR routine_name ILIKE '%whatsapp%'
    OR routine_name ILIKE '%utm%'
    OR routine_name ILIKE '%immersion%'
    OR routine_name ILIKE '%lab%'
  )
ORDER BY routine_name;


-- -----------------------------------------------------------------------------
-- 11. ROW COUNTS — sanity check; confirms tables exist and have data
-- -----------------------------------------------------------------------------
SELECT 'registrations'       AS table_name, count(*) AS row_count FROM registrations
UNION ALL
SELECT 'events',                            count(*) FROM events
UNION ALL
SELECT 'subscribers',                       count(*) FROM subscribers
UNION ALL
SELECT 'lab_interest',                      count(*) FROM lab_interest
UNION ALL
SELECT 'participants',                      count(*) FROM participants
UNION ALL
SELECT 'assessment_sessions',               count(*) FROM assessment_sessions
UNION ALL
SELECT 'whatsapp_requests',                 count(*) FROM whatsapp_requests
UNION ALL
SELECT 'contact_messages',                  count(*) FROM contact_messages
UNION ALL
SELECT 'immersion_applications',            count(*) FROM immersion_applications
UNION ALL
SELECT 'admin_audit_log',                   count(*) FROM admin_audit_log
ORDER BY table_name;


-- -----------------------------------------------------------------------------
-- 12. SAMPLE COLUMN NAMES ONLY (no data) — catches any columns that
--     information_schema may miss due to permission filtering.
--     Run pg_attribute directly against each table's OID.
-- -----------------------------------------------------------------------------
SELECT
  c.relname                                 AS table_name,
  a.attnum                                  AS pos,
  a.attname                                 AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
  a.attnotnull                              AS not_null,
  pg_get_expr(d.adbin, d.adrelid)           AS column_default
FROM pg_class      c
JOIN pg_namespace  n  ON n.oid = c.relnamespace
JOIN pg_attribute  a  ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'registrations',
    'events',
    'subscribers',
    'lab_interest',
    'participants',
    'assessment_sessions',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'admin_audit_log'
  )
ORDER BY c.relname, a.attnum;


-- =============================================================================
-- END OF INSPECTION
-- Copy the full result set (all 12 sections) and paste it back.
-- =============================================================================
