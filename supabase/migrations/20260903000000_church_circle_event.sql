-- =============================================================================
-- September 2026 Lab: The Church Circle
-- =============================================================================
--
-- Inserts the September 2026 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- Event date: Wednesday, September 3, 2026 at 3:00 PM EDT (UTC-4 in summer)
--             3pm EDT = 19:00 UTC
--
-- NOTE: September 3, 2026 is a Thursday, not the third Wednesday of the month
-- (which would be September 16). The date was specified by the event owner.
-- Confirm with event owner before publishing if the Wednesday pattern is
-- expected to apply here. To change the date to the third Wednesday, update
-- event_date to '2026-09-16 19:00:00+00'.
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
  '2026-09-03 19:00:00+00',
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
