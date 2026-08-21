-- =============================================================================
-- January 2027 Lab: Find Your Field
-- =============================================================================
--
-- Inserts the January 2027 lab event into the events table.
-- Uses ON CONFLICT (slug) DO UPDATE so the migration is safe to re-run.
--
-- NOTE ON FILE TIMESTAMP: ordered after 20270704000000_labs_public_feed.sql
-- because it writes the `hook` and `landing_path` columns that migration adds.
-- Migrations apply in filename order, not event-date order.
--
-- NOTE: the registration landing page is find-your-field-lab.html. The existing
-- find-your-field.html is the interactive Lab tool (Covo Field Plan) and is
-- unrelated to this event row.
--
-- Event date: Wednesday, January 20, 2027 at 3:00 PM EST.
--             January is standard time (EST, UTC-5): 3:00 PM EST = 20:00 UTC.
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
  'find-your-field-january-2027',
  'Find Your Field',
  'Discover where God has already placed you to make disciples. Learn to see the harvest fields already built into your life — through your passions, people, places, and profession — then choose one field, clarify who is there, and leave with a concrete next step to enter it.',
  'Discover where God has already placed you to make disciples.',
  '/find-your-field-lab.html',
  '2027-01-20 20:00:00+00',
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
