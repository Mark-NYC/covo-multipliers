-- =============================================================================
-- Lost to Leader Lab — Reminder Tracking Columns
-- =============================================================================
--
-- Adds 24-hour and 1-hour reminder tracking columns to the registrations table.
-- These are owned exclusively by the send-lost-to-leader-reminder Edge Function.
--
-- reminder_24h_sent_at — set after the 24-hour-out reminder is successfully sent.
-- reminder_1h_sent_at  — set after the 1-hour-out reminder is successfully sent.
--
-- Using ADD COLUMN IF NOT EXISTS so this migration is safe to run more than once.
-- =============================================================================

alter table registrations
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at  timestamptz;

-- Partial indexes so the reminder function can find un-sent rows without a full scan.
create index if not exists idx_registrations_reminder_24h
  on registrations (reminder_24h_sent_at)
  where reminder_24h_sent_at is null;

create index if not exists idx_registrations_reminder_1h
  on registrations (reminder_1h_sent_at)
  where reminder_1h_sent_at is null;

comment on column registrations.reminder_24h_sent_at is 'Set by the send-lost-to-leader-reminder Edge Function after the 24-hour reminder email is sent. Never set by any other function.';
comment on column registrations.reminder_1h_sent_at  is 'Set by the send-lost-to-leader-reminder Edge Function after the 1-hour reminder email is sent. Never set by any other function.';
