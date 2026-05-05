-- =============================================================================
-- Lab Reminder Columns
-- =============================================================================
--
-- Adds reminder tracking columns to the registrations table.
-- These columns are owned exclusively by the reminder system and must
-- never be set by the registration confirmation flow.
--
-- confirmation_sent_at  — set once, immediately after the signup confirmation
--                         email is successfully delivered by the register function.
--                         Never touched by reminders.
--
-- reminder_week_sent_at — set by the reminder system after the 1-week-out
--                         reminder email is sent. Never touched by registration.
--
-- reminder_day_sent_at  — set by the reminder system after the 1-day-out
--                         reminder email is sent. Never touched by registration.
--
-- Using ADD COLUMN IF NOT EXISTS so this migration is safe to run even if
-- the columns were already added directly in the Supabase dashboard.
-- =============================================================================

alter table registrations
  add column if not exists reminder_week_sent_at timestamptz,
  add column if not exists reminder_day_sent_at  timestamptz;

-- Index so the reminder system can efficiently query for rows that still
-- need a reminder without scanning the whole table.
create index if not exists idx_registrations_reminder_week
  on registrations (reminder_week_sent_at)
  where reminder_week_sent_at is null;

create index if not exists idx_registrations_reminder_day
  on registrations (reminder_day_sent_at)
  where reminder_day_sent_at is null;

-- Diagnostic: confirm column ownership is clear.
comment on column registrations.confirmation_sent_at  is 'Set once by the register Edge Function after the signup confirmation email is sent. Never modified by the reminder system.';
comment on column registrations.reminder_week_sent_at is 'Set by the reminder system after the 1-week-out reminder email is sent. Never set by the register function.';
comment on column registrations.reminder_day_sent_at  is 'Set by the reminder system after the 1-day-out reminder email is sent. Never set by the register function.';
