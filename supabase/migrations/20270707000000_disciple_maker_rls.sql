-- =============================================================================
-- Migration 20270707000000: Lock down disciple_maker_sessions / responses
-- =============================================================================
--
-- These tables store participant PII (name, email, organization) and
-- assessment scores but were created without Row-Level Security, unlike
-- every comparable table in this codebase (participants, assessment_sessions,
-- assessment_responses, assessment_results all have RLS enabled with no
-- public policies). Because the Supabase anon key is embedded in several
-- public admin pages, the tables were readable by anyone who copied that key
-- out of the page source and queried PostgREST directly.
--
-- This enables RLS with no policies, matching the participants/assessment_*
-- pattern: only the service role (used by the disciple-maker-* edge
-- functions and the new disciple-maker-admin function) can read or write.
-- Admin dashboards must go through disciple-maker-admin instead of querying
-- these tables directly with the anon key.
-- =============================================================================

ALTER TABLE disciple_maker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE disciple_maker_responses ENABLE ROW LEVEL SECURITY;
