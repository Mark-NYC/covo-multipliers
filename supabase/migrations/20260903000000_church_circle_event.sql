-- =============================================================================
-- September 2026 Lab: The Church Circle
-- =============================================================================
--
-- Inserts the September 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- Event date: Wednesday, September 16, 2026 at 3:00 PM EDT (UTC-4 in summer)
--             3pm EDT = 19:00 UTC
--
-- September 16, 2026 is the third Wednesday of September, consistent with
-- the existing lab schedule (third Wednesday each month).
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
  'church-circle-september-2026',
  'The Church Circle',
  'A simple biblical map for practicing and multiplying church from Acts 2:36–47, and a practical vision for gathering ordinary disciples into simple churches where they already live, work, and relate.',
  '2026-09-16 19:00:00+00',
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
