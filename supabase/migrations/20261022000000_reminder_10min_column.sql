-- =============================================================================
-- Migration 20261022000000: 10-minute reminder column
-- =============================================================================
--
-- Adds the reminder_10min_sent_at tracking column used by the new
-- "We start in 10 minutes" reminder in send-lab-reminders.
--
-- Ownership: this column is owned exclusively by the reminder system and is
-- set only after Resend returns a message ID. It is never touched by the
-- registration confirmation flow.
--
-- Mirrors the existing reminder columns (reminder_week_sent_at,
-- reminder_24h_sent_at, reminder_1h_sent_at). Safe to re-run.
-- =============================================================================

alter table public.registrations
  add column if not exists reminder_10min_sent_at timestamptz;

-- Partial index so the reminder system can efficiently find active
-- registrations that still need the 10-minute reminder. Matches the
-- active-status-guarded pattern used for the other reminder indexes.
drop index if exists public.idx_registrations_reminder_10min;
create index if not exists idx_registrations_reminder_10min
  on public.registrations (event_id, reminder_10min_sent_at)
  where reminder_10min_sent_at is null
    and registration_status = 'active';

comment on column public.registrations.reminder_10min_sent_at is
  'Set by the reminder system after the 10-minute-before reminder email is sent. Never set by the register function.';
