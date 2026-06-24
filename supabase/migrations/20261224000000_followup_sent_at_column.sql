-- =============================================================================
-- Migration 20261224000000: Post-lab follow-up email column
-- =============================================================================
--
-- Adds the followup_sent_at tracking column used by the new post-lab
-- follow-up email sent ~1 hour after each lab ends.
--
-- Ownership: this column is owned exclusively by the reminder system and is
-- set only after Resend returns a message ID. It is never touched by the
-- registration confirmation flow.
--
-- Mirrors the existing reminder columns (reminder_week_sent_at,
-- reminder_24h_sent_at, reminder_1h_sent_at, reminder_10min_sent_at).
-- Safe to re-run.
-- =============================================================================

alter table public.registrations
  add column if not exists followup_sent_at timestamptz;

-- Partial index so the reminder system can efficiently find active
-- registrations that still need the post-lab follow-up email.
-- Matches the active-status-guarded pattern used for other reminder indexes.
drop index if exists public.idx_registrations_followup;
create index if not exists idx_registrations_followup
  on public.registrations (event_id, followup_sent_at)
  where followup_sent_at is null
    and registration_status = 'active';

comment on column public.registrations.followup_sent_at is
  'Set by the reminder system after the post-lab follow-up email is sent. Never set by the register function.';
