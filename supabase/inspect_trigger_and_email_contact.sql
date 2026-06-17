-- =============================================================================
-- COVO MULTIPLIERS — TRIGGER & EMAIL_CONTACT INSPECTION
-- Run this entire file in the Supabase SQL Editor (read-only; no writes).
-- Paste the full output back before any migrations are written.
--
-- Purpose: Discover the definition of sync_registration_to_email_contact(),
-- the table(s) it writes to, and the full schema of those tables.
-- Also surfaces any other functions that reference email_contact,
-- marketing_opt_in, marketing_consent, or registrations.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. FULL DEFINITION OF sync_registration_to_email_contact()
--    Uses pg_get_functiondef() so we see the exact PL/pgSQL body,
--    argument types, return type, volatility, and security definer status.
-- -----------------------------------------------------------------------------
SELECT
  p.proname                                 AS function_name,
  pg_get_functiondef(p.oid)                 AS full_definition,
  p.prosecdef                               AS security_definer,
  p.provolatile                             AS volatility,   -- 'i'=immutable 's'=stable 'v'=volatile
  p.proisstrict                             AS strict,
  l.lanname                                 AS language,
  pg_get_function_result(p.oid)             AS return_type,
  pg_get_function_arguments(p.oid)          AS arguments
FROM pg_proc      p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname = 'sync_registration_to_email_contact';


-- -----------------------------------------------------------------------------
-- 2. ALL TRIGGERS ON registrations (full detail)
--    Confirms the trigger name, timing, events, and which function it calls.
-- -----------------------------------------------------------------------------
SELECT
  t.tgname                                  AS trigger_name,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE
    WHEN t.tgtype & 4  <> 0 THEN 'INSERT'
    WHEN t.tgtype & 8  <> 0 THEN 'DELETE'
    WHEN t.tgtype & 16 <> 0 THEN 'UPDATE'
    ELSE 'OTHER'
  END                                       AS event,
  CASE t.tgtype & 1 WHEN 1 THEN 'ROW' ELSE 'STATEMENT' END AS orientation,
  p.proname                                 AS function_called,
  t.tgenabled                               AS enabled         -- 'O'=on 'D'=disabled 'R'=replica 'A'=always
FROM pg_trigger   t
JOIN pg_class     c ON c.oid  = t.tgrelid
JOIN pg_proc      p ON p.oid  = t.tgfoid
JOIN pg_namespace n ON n.oid  = c.relnamespace
WHERE n.nspname   = 'public'
  AND c.relname   = 'registrations'
  AND NOT t.tgisinternal
ORDER BY t.tgname, event;


-- -----------------------------------------------------------------------------
-- 3. ALL PUBLIC FUNCTIONS WHOSE BODY REFERENCES email_contact,
--    marketing_opt_in, marketing_consent, or registrations.
--    Catches any additional sync or upsert functions we have not yet seen.
-- -----------------------------------------------------------------------------
SELECT
  p.proname                                 AS function_name,
  pg_get_functiondef(p.oid)                 AS full_definition,
  l.lanname                                 AS language,
  pg_get_function_result(p.oid)             AS return_type,
  pg_get_function_arguments(p.oid)          AS arguments
FROM pg_proc      p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language  l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND (
    pg_get_functiondef(p.oid) ILIKE '%email_contact%'
    OR pg_get_functiondef(p.oid) ILIKE '%marketing_opt_in%'
    OR pg_get_functiondef(p.oid) ILIKE '%marketing_consent%'
    OR pg_get_functiondef(p.oid) ILIKE '%registrations%'
  )
ORDER BY p.proname;


-- -----------------------------------------------------------------------------
-- 4. ALL TABLES WHOSE NAME CONTAINS 'contact' OR 'email'
--    Finds any table the trigger might be writing to that is not yet known.
-- -----------------------------------------------------------------------------
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%contact%'
    OR table_name ILIKE '%email%'
  )
ORDER BY table_name;


-- -----------------------------------------------------------------------------
-- 5. COLUMNS OF ANY TABLE FOUND IN SECTION 4
--    Run after you see section 4 results. If the table name differs from
--    'email_contacts', replace it in the WHERE clause below.
--    This version casts the net wide with ILIKE so no manual edit is needed.
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
  AND (
    c.relname ILIKE '%contact%'
    OR c.relname ILIKE '%email%'
  )
ORDER BY c.relname, a.attnum;


-- -----------------------------------------------------------------------------
-- 6. PRIMARY KEYS on any contact/email table
-- -----------------------------------------------------------------------------
SELECT
  tc.table_name,
  tc.constraint_type,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints   tc
JOIN information_schema.key_column_usage    kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND (tc.table_name ILIKE '%contact%' OR tc.table_name ILIKE '%email%')
  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_type;


-- -----------------------------------------------------------------------------
-- 7. FOREIGN KEYS referencing or from any contact/email table
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
JOIN information_schema.key_column_usage    kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
  AND tc.table_schema   = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = rc.unique_constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND (
    tc.table_name   ILIKE '%contact%'
    OR tc.table_name   ILIKE '%email%'
    OR ccu.table_name  ILIKE '%contact%'
    OR ccu.table_name  ILIKE '%email%'
  )
ORDER BY from_table, from_column;


-- -----------------------------------------------------------------------------
-- 8. INDEXES on any contact/email table
-- -----------------------------------------------------------------------------
SELECT
  t.relname                                 AS table_name,
  i.relname                                 AS index_name,
  ix.indisunique                            AS is_unique,
  ix.indisprimary                           AS is_primary,
  pg_get_indexdef(ix.indexrelid)            AS index_definition
FROM pg_class     t
JOIN pg_index     ix ON t.oid = ix.indrelid
JOIN pg_class     i  ON i.oid = ix.indexrelid
JOIN pg_namespace n  ON n.oid = t.relnamespace
WHERE n.nspname   = 'public'
  AND t.relkind   = 'r'
  AND (t.relname ILIKE '%contact%' OR t.relname ILIKE '%email%')
ORDER BY t.relname, i.relname;


-- -----------------------------------------------------------------------------
-- 9. RLS STATUS on any contact/email table
-- -----------------------------------------------------------------------------
SELECT
  relname                                   AS table_name,
  relrowsecurity                            AS rls_enabled,
  relforcerowsecurity                       AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relkind = 'r'
  AND (relname ILIKE '%contact%' OR relname ILIKE '%email%')
ORDER BY relname;


-- -----------------------------------------------------------------------------
-- 10. RLS POLICIES on any contact/email table
-- -----------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  roles,
  cmd                                       AS command,
  qual                                      AS using_expr,
  with_check                                AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename ILIKE '%contact%' OR tablename ILIKE '%email%')
ORDER BY tablename, policyname;


-- -----------------------------------------------------------------------------
-- 11. TRIGGERS on any contact/email table
-- -----------------------------------------------------------------------------
SELECT
  c.relname                                 AS table_name,
  t.tgname                                  AS trigger_name,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
  CASE
    WHEN t.tgtype & 4  <> 0 THEN 'INSERT'
    WHEN t.tgtype & 8  <> 0 THEN 'DELETE'
    WHEN t.tgtype & 16 <> 0 THEN 'UPDATE'
    ELSE 'OTHER'
  END                                       AS event,
  p.proname                                 AS function_called,
  t.tgenabled                               AS enabled
FROM pg_trigger   t
JOIN pg_class     c ON c.oid  = t.tgrelid
JOIN pg_proc      p ON p.oid  = t.tgfoid
JOIN pg_namespace n ON n.oid  = c.relnamespace
WHERE n.nspname   = 'public'
  AND (c.relname ILIKE '%contact%' OR c.relname ILIKE '%email%')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- -----------------------------------------------------------------------------
-- 12. ROW COUNTS — registrations plus any contact/email table found
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec    RECORD;
  cnt    bigint;
  q      text;
BEGIN
  RAISE NOTICE 'table_name | row_count';
  RAISE NOTICE '-----------|----------';
  RAISE NOTICE 'registrations | %', (SELECT count(*) FROM registrations);

  FOR rec IN
    SELECT relname AS tname
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND relkind = 'r'
      AND (relname ILIKE '%contact%' OR relname ILIKE '%email%')
    ORDER BY relname
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', rec.tname) INTO cnt;
    RAISE NOTICE '% | %', rec.tname, cnt;
  END LOOP;
END;
$$;


-- =============================================================================
-- END OF INSPECTION
-- Copy all result grids (sections 1–11) and all NOTICE lines from section 12.
-- Paste the full output back before any migration is written.
-- =============================================================================
