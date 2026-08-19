-- =============================================================================
-- 2027 Spring/Summer Lab Series (repeat of the 2026 May–August labs)
-- =============================================================================
--
-- Re-runs the four 2026 May–August labs in 2027 on the third Wednesday of the
-- same months. Each is a NEW, independent event row with its own slug so it
-- gets its own registrations, seat counting, reminders, and availability —
-- the 2026 rows are left untouched. Page copy is reused verbatim on new
-- landing pages (…-2027.html); only the instance-specific data changes here.
--
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- Dates (third Wednesday, all during US daylight saving time / EDT = UTC-4,
--        so 3:00 PM ET = 19:00 UTC):
--   * From Lost to Leader ............ Wed 2027-05-19 15:00 EDT = 19:00 UTC
--   * Rhythms of a Covo Multiplier ... Wed 2027-06-16 15:00 EDT = 19:00 UTC
--   * Aquila and Priscilla Pattern ... Wed 2027-07-21 15:00 EDT = 19:00 UTC
--   * The 4 Questions (4-1-1) ........ Wed 2027-08-18 15:00 EDT = 19:00 UTC
--
-- TODO before go-live:
--   * zoom_link: paste each real Zoom join link (left NULL here; the calendar /
--     confirmation email fall back to "Zoom link will be sent before the lab").
--   * seat_limit: confirm the real seat limit (25 = table default).
-- =============================================================================

INSERT INTO public.events (
  id,
  slug,
  title,
  description,
  hook,
  landing_path,
  event_date,
  zoom_link,
  seat_limit,
  is_published,
  created_at,
  updated_at
)
VALUES
  (
    gen_random_uuid(),
    'from-lost-to-leader-may-2027',
    'From Lost to Leader',
    'You want your life to matter for the Kingdom, not just your church attendance. In this live 45-minute lab, get practical help for building a life that makes disciples where you live, work, and play.',
    'A simple path to help someone follow Jesus this week.',
    '/from-lost-to-leader-2027.html',
    '2027-05-19 19:00:00+00',
    NULL,
    25,
    true,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'rhythms-of-a-covo-multiplier-jun-2027',
    'Rhythms of a Covo Multiplier',
    'In 45 minutes, you''ll be introduced to the 5 rhythms of the 4 Fields pathway that become a framework for where to go, how to start spiritual conversations, how to share the gospel, how to disciple, how to gather believers, and how to guide emerging leaders.',
    'Build a weekly rhythm that keeps mission from becoming random.',
    '/rhythms-of-a-covo-multiplier-2027.html',
    '2027-06-16 19:00:00+00',
    NULL,
    25,
    true,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'aquila-and-priscilla-pattern-jul-2027',
    'The Aquila and Priscilla Pattern',
    'Learn how ordinary work, hospitality, and relationships became a church-planting platform. See a biblical pattern for multiplying disciples without separating ministry from normal life.',
    'Learn how ordinary work, hospitality, and relationships became a church-planting platform.',
    '/aquila-and-priscilla-pattern-2027.html',
    '2027-07-21 19:00:00+00',
    NULL,
    25,
    true,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '4-questions-to-get-started-august-2027',
    '4 Questions to Get Started Making Disciples',
    'Know who to reach, what to say, and how to help someone take the next step. Walk away with four simple questions you can use to start making disciples where you already live, work, and relate.',
    'Know who to reach, what to say, and how to help someone take the next step.',
    '/4-questions-2027.html',
    '2027-08-18 19:00:00+00',
    NULL,
    25,
    true,
    now(),
    now()
  )
ON CONFLICT (slug) DO UPDATE SET
  title        = EXCLUDED.title,
  description  = EXCLUDED.description,
  hook         = EXCLUDED.hook,
  landing_path = EXCLUDED.landing_path,
  event_date   = EXCLUDED.event_date,
  zoom_link    = EXCLUDED.zoom_link,
  seat_limit   = EXCLUDED.seat_limit,
  is_published = EXCLUDED.is_published,
  updated_at   = now();
