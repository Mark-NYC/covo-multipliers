-- =============================================================================
-- October 2026 Lab: From Intention to Disciple-Making Traction
-- =============================================================================
--
-- Inserts the October 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- Event date: Wednesday, October 21, 2026 at 3:00 PM EDT (UTC-4 during DST;
--             daylight saving time ends November 1, 2026)
--             3:00 PM EDT = 19:00 UTC
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
  'disciple-making-rhythm-october-2026',
  'From Intention to Disciple-Making Traction',
  'Move from good intentions to real traction in making disciples where you live, work, and play. Build a simple, repeatable rhythm using CFC — commitment, focus, and consistency — count the cost to actually start, and leave with a 3-2-1 weekly cadence and people moving with you, not just more information.',
  '2026-10-21 19:00:00+00',
  'https://us06web.zoom.us/j/85262471071?pwd=AGPwhhZmGWZfD6lLqnVOKwwOHZTh2p.1',
  25,
  true,
  now(),
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  event_date = EXCLUDED.event_date,
  zoom_link = EXCLUDED.zoom_link,
  seat_limit = EXCLUDED.seat_limit,
  is_published = EXCLUDED.is_published,
  updated_at = now();
