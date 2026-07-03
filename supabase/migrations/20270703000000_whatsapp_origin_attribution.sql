-- =============================================================================
-- Migration 20270703000000: whatsapp_link_clicks origin attribution
-- =============================================================================
--
-- whatsapp_link_clicks already stores utm_source/utm_medium/utm_campaign/etc,
-- but those describe WHERE ON THE SITE the "Join WhatsApp" button lived
-- (footer, lab_page, registration_confirmation, ...), not the visitor's
-- original acquisition channel (Substack, YouTube, podcast, ...).
--
-- This adds a second, separate set of UTM columns — origin_utm_* — that carry
-- the visitor's first-touch attribution (from utm-tracking.js's
-- window.CovoAttribution.get() first-touch fields, or from the corresponding
-- DB record's first_utm_* columns for server-generated email links). The
-- existing utm_* placement columns are untouched.
--
-- Also adds first-touch attribution columns to disciple_maker_sessions, which
-- (unlike registrations/participants/immersion_applications) had none — it
-- needs them so disciple-maker-submit's WhatsApp CTA can carry origin_utm_*
-- through to its results email.
-- =============================================================================

alter table public.whatsapp_link_clicks
  add column if not exists origin_utm_source   text,
  add column if not exists origin_utm_medium   text,
  add column if not exists origin_utm_campaign text;

create index if not exists idx_whatsapp_link_clicks_origin_utm_source
  on public.whatsapp_link_clicks (origin_utm_source);

-- disciple_maker_sessions — first-touch only, captured once at session start
-- (disciple-maker-start) and never overwritten, mirroring the participants
-- table convention used by the Fivefold assessment.
alter table disciple_maker_sessions
  add column if not exists first_utm_source   text,
  add column if not exists first_utm_medium   text,
  add column if not exists first_utm_campaign text,
  add column if not exists first_utm_content  text,
  add column if not exists first_utm_term     text,
  add column if not exists first_landing_page text,
  add column if not exists first_referrer     text,
  add column if not exists first_touch_at     timestamptz;
