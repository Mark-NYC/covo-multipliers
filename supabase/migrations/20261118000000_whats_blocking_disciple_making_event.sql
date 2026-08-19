-- =============================================================================
-- November 2026 Lab: What's Holding Back Your Disciple-Making?
-- (Muddy Boots Church Planter Assessment)
-- =============================================================================
--
-- Inserts the November 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- Event date: Wednesday, November 18, 2026 at 3:00 PM EST.
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
  event_date,
  zoom_link,
  seat_limit,
  is_published,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  'whats-blocking-your-disciple-making-november-2026',
  'What''s Holding Back Your Disciple-Making?',
  'You can care deeply about making disciples, know the right tools, and still feel unsure why your work is not moving forward. In this live lab, you''ll assess four parts of a muddy boots church planter: Head, Heart, Hands, and Harvester. You''ll identify the area that most needs attention and leave with a practical next step you can take within seven days.',
  '2026-11-18 20:00:00+00',
  NULL,
  25,
  true,
  now(),
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title        = EXCLUDED.title,
  description  = EXCLUDED.description,
  event_date   = EXCLUDED.event_date,
  zoom_link    = EXCLUDED.zoom_link,
  seat_limit   = EXCLUDED.seat_limit,
  is_published = EXCLUDED.is_published,
  updated_at   = now();
