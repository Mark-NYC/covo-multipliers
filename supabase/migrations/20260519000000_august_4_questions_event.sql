-- =============================================================================
-- August 2026 Lab: 4 Questions to Get Started Making Disciples
-- =============================================================================
--
-- Inserts the August 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO NOTHING so the migration is safe to run again.
--
-- Event date: Wednesday, August 19, 2026 at 3:00 PM EDT (UTC-4 in summer)
--             3pm EDT = 19:00 UTC
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
  '4-questions-to-get-started-august-2026',
  '4 Questions to Get Started Making Disciples',
  'Why. Who. How. When. A simple lab to help ordinary disciples move from good intentions to real obedience.',
  '2026-08-19 19:00:00+00',
  NULL,
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
