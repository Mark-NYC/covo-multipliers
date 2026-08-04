-- Migration: enable Row-Level Security on the Disciple Maker tables
--
-- The Supabase security advisor flagged two CRITICAL issues on this project:
--   • rls_disabled_in_public    — a public table had RLS turned off, so anyone
--                                 with the project URL could read/edit/delete it
--                                 through the auto-generated REST API.
--   • sensitive_columns_exposed — that table holds personal identifiers (email,
--                                 first_name) and token hashes, all reachable
--                                 without any access restriction.
--
-- Both point at the Disciple Maker assessment tables, which were created in
-- 20260626000000_disciple_maker_assessment.sql without `enable row level
-- security`. Every other public table in this project already enables RLS.
--
-- All access to these tables goes through edge functions
-- (disciple-maker-start / -save / -submit / -resume / -results / -cfc-*),
-- which use the SUPABASE_SERVICE_ROLE_KEY. The service role bypasses RLS, so
-- enabling it here locks out anon/public API access with no code changes and
-- no impact on the assessment flow.
--
-- Following the convention used elsewhere in this schema (see
-- contact_messages, lab_attendance, etc.): enable RLS and add no public
-- policies — every legitimate reader/writer is the service role.

alter table if exists public.disciple_maker_sessions  enable row level security;
alter table if exists public.disciple_maker_responses enable row level security;

-- No public policies — all access goes through the service-role key in the
-- edge functions. Absent a permissive policy, RLS denies anon/authenticated
-- API access by default.
