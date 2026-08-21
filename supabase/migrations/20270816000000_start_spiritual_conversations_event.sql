-- =============================================================================
-- December 2026 Lab: Start Spiritual Conversations Naturally
-- =============================================================================
--
-- Inserts the December 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- NOTE ON FILE TIMESTAMP: this event is in December 2026, but the migration is
-- ordered after 20270704000000_labs_public_feed.sql because it writes the
-- `hook` and `landing_path` columns that migration adds. Migrations apply in
-- filename order, not event-date order, so it must sort after those columns
-- exist (the repo already carries other forward-dated migrations).
--
-- Event date: Wednesday, December 16, 2026 at 3:00 PM EST.
--             US daylight saving time ends November 1, 2026, so this date is
--             standard time (EST, UTC-5): 3:00 PM EST = 20:00 UTC.
--
-- TODO before go-live:
--   * zoom_link: paste the real Zoom join link (left NULL here; the calendar /
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
VALUES (
  gen_random_uuid(),
  'start-spiritual-conversations-december-2026',
  'Start Spiritual Conversations Naturally',
  'Learn how to start natural conversations with the people around you and let them grow into real gospel conversations that lead to open Bible discovery. Walk away with the Conversation Box tool and practical soft-skill conversation starters you can keep in your tool belt.',
  'Turn everyday conversations into natural gospel conversations that open the Bible.',
  '/start-spiritual-conversations-naturally.html',
  '2026-12-16 20:00:00+00',
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
