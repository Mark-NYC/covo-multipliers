-- =============================================================================
-- Migration 20260721000000: Registration security / spam-audit events
-- =============================================================================
--
-- Creates a lightweight audit table that serves two purposes for the lab
-- registration endpoint (supabase/functions/register):
--
--   1. Spam-audit trail — one row per rejected (or accepted) submission with a
--      structured `outcome` category, so rejections can be diagnosed without
--      storing sensitive data.
--
--   2. Durable, layered rate limiting — the register function counts recent
--      rows for a given ip_hash / email_hash / event within rolling windows.
--      This replaces the per-isolate in-memory maps used elsewhere, which reset
--      on every cold start and do not protect across warm instances.
--
-- Privacy:
--   * Raw IP addresses are NEVER stored. Only a salted SHA-256 hash (ip_hash).
--   * Raw email is NEVER stored here. Only a salted SHA-256 hash (email_hash)
--     used purely to correlate repeated attempts for the same address.
--   * No Turnstile secrets or tokens are ever stored.
--
-- The table is written only by the service role (Edge Functions). RLS is
-- enabled with no anon/authenticated policies, so it is not readable or
-- writable by public clients.
--
-- All statements are idempotent so the migration is safe to re-run.
-- =============================================================================

create table if not exists public.registration_security_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),

  -- Salted SHA-256 hashes — never raw values. Nullable because a request may
  -- arrive without a resolvable IP, or be rejected before an email is parsed.
  ip_hash     text,
  email_hash  text,

  -- The lab the submission targeted, when known. No FK constraint on purpose:
  -- a spammer can send an arbitrary/invalid event_id and we still want to log
  -- the attempt without the insert failing.
  event_id    uuid,

  -- Outcome category. 'accepted' for a real registration that passed all
  -- checks; otherwise one of the rejection categories below.
  --   turnstile_failed | honeypot_filled | invalid_name | invalid_email
  --   rate_limited     | invalid_origin
  outcome     text not null,

  -- Short, non-sensitive detail string (e.g. which rate-limit layer tripped).
  -- Must never contain secrets, full tokens, raw IPs, or full email addresses.
  detail      text
);

comment on table public.registration_security_events is
  'Spam-audit + rate-limit source for the register Edge Function. Stores only salted hashes; never raw IPs, emails, or Turnstile secrets/tokens.';

-- Indexes tuned for the rate-limit lookups (recent rows for a key), which all
-- filter by a hash + created_at window.
create index if not exists registration_security_events_ip_hash_created_idx
  on public.registration_security_events (ip_hash, created_at desc);

create index if not exists registration_security_events_email_hash_created_idx
  on public.registration_security_events (email_hash, created_at desc);

create index if not exists registration_security_events_event_created_idx
  on public.registration_security_events (event_id, created_at desc);

create index if not exists registration_security_events_created_idx
  on public.registration_security_events (created_at desc);

-- Lock the table down: service role bypasses RLS; nobody else may touch it.
alter table public.registration_security_events enable row level security;
revoke all on public.registration_security_events from anon, authenticated;
