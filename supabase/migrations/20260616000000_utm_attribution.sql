-- =============================================================================
-- UTM Attribution Columns
-- =============================================================================
--
-- Adds first-touch and latest-touch attribution fields to all lead-capture
-- tables.  All columns are nullable so existing rows are unaffected.
-- Uses ADD COLUMN IF NOT EXISTS throughout so this migration is safe to
-- replay against a database that was partially updated.
--
-- Tables modified:
--   registrations          — event registrations
--   immersion_applications — immersion program applications
--   contact_messages       — contact form submissions
--   whatsapp_requests      — WhatsApp join requests
--   participants           — assessment participants (first-touch only;
--                            protected from overwrite in upsert logic)
--   assessment_sessions    — assessment sessions (latest-touch at start)
--
-- A new subscribers table is also created for the subscribe-updates
-- Edge Function (updates.html + index.html lab-interest form), which
-- previously wrote to the in-production function but had no local schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: attribution column block (used across tables)
-- Latest-touch: utm_source … latest_touch_at
-- First-touch:  first_utm_source … first_touch_at
-- ---------------------------------------------------------------------------

-- registrations
alter table registrations
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists landing_page   text,
  add column if not exists referrer       text,
  add column if not exists latest_touch_at timestamptz,
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;

-- immersion_applications
alter table immersion_applications
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists landing_page   text,
  add column if not exists referrer       text,
  add column if not exists latest_touch_at timestamptz,
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;

-- contact_messages
alter table contact_messages
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists landing_page   text,
  add column if not exists referrer       text,
  add column if not exists latest_touch_at timestamptz,
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;

-- whatsapp_requests
alter table whatsapp_requests
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists landing_page   text,
  add column if not exists referrer       text,
  add column if not exists latest_touch_at timestamptz,
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;

-- participants — first-touch only.
-- The upsert in assessment-start uses onConflict: "email" and only sets
-- these columns when they are currently NULL (coalesce pattern in the
-- Edge Function), so first-touch is never overwritten.
alter table participants
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;

-- assessment_sessions — latest-touch at the moment the session is created.
alter table assessment_sessions
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists landing_page   text,
  add column if not exists referrer       text,
  add column if not exists latest_touch_at timestamptz;

-- ---------------------------------------------------------------------------
-- subscribers — new table for subscribe-updates Edge Function
-- Replaces the write-only lab_interest table for the subscribe forms on
-- index.html and updates.html.  The Edge Function upserts on email, so
-- re-subscribing updates the name and latest-touch but does NOT overwrite
-- first_touch_at if it is already set (COALESCE guard in the function).
-- ---------------------------------------------------------------------------
create table if not exists subscribers (
  id           uuid        primary key default gen_random_uuid(),
  email        text        not null unique,
  full_name    text,
  subscribed   boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- latest-touch
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  landing_page text,
  referrer     text,
  latest_touch_at timestamptz,
  -- first-touch (never overwritten after first subscription)
  first_utm_source   text,
  first_utm_medium   text,
  first_utm_campaign text,
  first_utm_content  text,
  first_utm_term     text,
  first_landing_page text,
  first_referrer     text,
  first_touch_at     timestamptz
);

create index if not exists idx_subscribers_email
  on subscribers (email);

alter table subscribers enable row level security;

-- No anon select.  All writes go through the Edge Function (service role).
-- Service role bypasses RLS entirely.
