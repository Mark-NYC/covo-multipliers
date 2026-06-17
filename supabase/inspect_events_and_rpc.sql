-- =============================================================================
-- Live schema inspection — events, registrations, register_for_event(), admin_audit_log
-- Read-only. Run in Supabase SQL Editor before implementing Phase 2 migrations.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. events table — full column spec
-- ---------------------------------------------------------------------------
select
  ordinal_position  as pos,
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by ordinal_position;


-- ---------------------------------------------------------------------------
-- 2. registrations table — full column spec
-- ---------------------------------------------------------------------------
select
  ordinal_position  as pos,
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'registrations'
order by ordinal_position;


-- ---------------------------------------------------------------------------
-- 3. admin_audit_log table — full column spec (especially target_id nullability)
-- ---------------------------------------------------------------------------
select
  ordinal_position  as pos,
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_audit_log'
order by ordinal_position;


-- ---------------------------------------------------------------------------
-- 4. Primary keys
-- ---------------------------------------------------------------------------
select
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as key_columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
     on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema    = tc.table_schema
where tc.constraint_type = 'PRIMARY KEY'
  and tc.table_schema    = 'public'
  and tc.table_name in ('events', 'registrations', 'admin_audit_log', 'lab_attendance')
group by tc.table_name, tc.constraint_name
order by tc.table_name;


-- ---------------------------------------------------------------------------
-- 5. Unique constraints (table-level, not expression indexes)
-- ---------------------------------------------------------------------------
select
  tc.table_name,
  tc.constraint_name,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as unique_columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
     on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema    = tc.table_schema
where tc.constraint_type = 'UNIQUE'
  and tc.table_schema    = 'public'
  and tc.table_name in ('events', 'registrations', 'admin_audit_log', 'lab_attendance')
group by tc.table_name, tc.constraint_name
order by tc.table_name, tc.constraint_name;


-- ---------------------------------------------------------------------------
-- 6. All indexes on key tables (incl. expression indexes like lower(email))
-- ---------------------------------------------------------------------------
select
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('events', 'registrations', 'admin_audit_log', 'lab_attendance')
order by tablename, indexname;


-- ---------------------------------------------------------------------------
-- 7. Foreign key constraints on registrations and lab_attendance
-- ---------------------------------------------------------------------------
select
  conrelid::regclass                      as from_table,
  conname                                 as constraint_name,
  pg_get_constraintdef(pg_constraint.oid) as definition
from pg_constraint
where contype = 'f'
  and conrelid::regclass::text in ('registrations', 'lab_attendance')
order by from_table, conname;


-- ---------------------------------------------------------------------------
-- 8. CHECK constraints on registrations and lab_attendance
-- ---------------------------------------------------------------------------
select
  conrelid::regclass                      as table_name,
  conname                                 as constraint_name,
  pg_get_constraintdef(pg_constraint.oid) as definition
from pg_constraint
where contype = 'c'
  and conrelid::regclass::text in ('registrations', 'lab_attendance')
order by table_name, conname;


-- ---------------------------------------------------------------------------
-- 9. RLS status on key tables
-- ---------------------------------------------------------------------------
select
  relname        as table_name,
  relrowsecurity as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('events', 'registrations', 'admin_audit_log', 'lab_attendance')
order by relname;


-- ---------------------------------------------------------------------------
-- 10. RLS policies on key tables
-- ---------------------------------------------------------------------------
select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('events', 'registrations', 'admin_audit_log', 'lab_attendance')
order by tablename, policyname;


-- ---------------------------------------------------------------------------
-- 11. Triggers on registrations and events
-- ---------------------------------------------------------------------------
select
  event_object_table  as table_name,
  trigger_name,
  event_manipulation  as event,
  action_timing       as timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('registrations', 'events', 'lab_attendance')
order by event_object_table, trigger_name, event;


-- ---------------------------------------------------------------------------
-- 12. Full body of register_for_event() and any related event functions
-- ---------------------------------------------------------------------------
select
  p.proname                  as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid)  as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'register_for_event',
    'cancel_registration',
    'update_attendance',
    'record_attendance'
  )
order by p.proname;


-- ---------------------------------------------------------------------------
-- 13. All SECURITY DEFINER functions in public schema
--     (confirms which functions already exist and use SECURITY DEFINER)
-- ---------------------------------------------------------------------------
select
  proname                                  as function_name,
  pg_get_function_arguments(pg_proc.oid)   as arguments,
  prosecdef                                as security_definer,
  proconfig                                as config  -- shows search_path if set
from pg_proc
where pronamespace = 'public'::regnamespace
  and prosecdef = true
order by proname;


-- ---------------------------------------------------------------------------
-- 14. Views in public schema (event-availability views, etc.)
-- ---------------------------------------------------------------------------
select
  table_name   as view_name,
  view_definition
from information_schema.views
where table_schema = 'public'
order by table_name;


-- ---------------------------------------------------------------------------
-- 15. Current row counts — all relevant tables
-- ---------------------------------------------------------------------------
select
  relname     as table_name,
  n_live_tup  as estimated_rows
from pg_stat_user_tables
where schemaname = 'public'
  and relname in (
    'events',
    'registrations',
    'participants',
    'contacts',
    'lab_attendance',
    'admin_audit_log',
    'subscribers',
    'email_contacts',
    'whatsapp_requests',
    'contact_messages',
    'immersion_applications',
    'lab_interest'
  )
order by relname;
