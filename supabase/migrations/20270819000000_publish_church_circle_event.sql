-- =============================================================================
-- Fix: ensure the September 2026 "The Church Circle" lab is published
-- =============================================================================
--
-- Symptom: /church-circle-lab.html shows "Event not found." The page loads the
-- event by slug from the events_with_availability view, which only exposes rows
-- WHERE is_published = true (see 20260618000000_fix_availability_view_rls.sql).
-- The page requests the correct slug ('church-circle-september-2026') — the same
-- slug seeded in 20260903000000_church_circle_event.sql and referenced by
-- 20270704000000_labs_public_feed.sql — so the lookup itself is correct. The
-- row is simply missing from the published view, i.e. its is_published flag is
-- not true in the live database.
--
-- Fix: publish the row. This UPSERT is intentionally narrow and safe to re-run:
--   * ON CONFLICT (slug) it updates ONLY is_published + updated_at, so any
--     production values already set on the row (zoom_link, seat_limit,
--     event_date, title, description) are preserved and never clobbered.
--   * If the row somehow does not exist, it is inserted with the same values as
--     the original seed migration. The unique slug + ON CONFLICT guarantees no
--     duplicate event is ever created.
--   * It sets no seat count and fabricates no availability — seats_remaining is
--     still computed live by the view from real registrations.
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
  is_published = true,
  updated_at   = now();
