-- =============================================================================
-- OKC (Nov 2026) and NYC (Mar 2027) Covo Immersions
-- =============================================================================
--
-- Inserts the two real, currently-open immersions surfaced on immersions.html.
-- Uses fixed UUIDs so the static apply buttons on the page can reference them
-- directly (the immersion-apply Edge Function validates immersion_id as a UUID,
-- confirms the record exists, and confirms status = 'open').
--
-- Safe to re-run: ON CONFLICT (slug) DO UPDATE keeps the row (and its id)
-- and refreshes the details.
--
-- Times are stored in UTC:
--   OKC — America/Chicago, CST (UTC-6) in mid-November:
--     Thu Nov 12, 2026  5:00 PM CST  -> 2026-11-12 23:00:00+00
--     Mon Nov 16, 2026 12:00 PM CST  -> 2026-11-16 18:00:00+00
--   NYC — America/New_York; DST begins Sun Mar 14, 2027:
--     Fri Mar 12, 2027  5:00 PM EST (UTC-5) -> 2027-03-12 22:00:00+00
--     Mon Mar 15, 2027 12:00 PM EDT (UTC-4) -> 2027-03-15 16:00:00+00
-- =============================================================================

insert into public.immersions
  (id, slug, title, city, location_summary, start_date, end_date, format, platform_focus, capacity, status)
values
  (
    'e1a7c0de-0c4f-4a11-9b00-000000000001',
    'okc-immersion-november-2026',
    'Covo Immersion — Oklahoma City',
    'Oklahoma City, OK',
    'Oklahoma City, OK | Host location TBD',
    '2026-11-12 23:00:00+00',
    '2026-11-16 18:00:00+00',
    'In-person immersion',
    'Workplaces',
    24,
    'open'
  ),
  (
    'e1a7c0de-0c4f-4a11-9b00-000000000002',
    'nyc-immersion-march-2027',
    'Covo Immersion — New York City',
    'New York City, NY',
    'New York City, NY | Host location TBD',
    '2027-03-12 22:00:00+00',
    '2027-03-15 16:00:00+00',
    'In-person immersion',
    'Urban / Workplaces',
    24,
    'open'
  )
on conflict (slug) do update set
  title            = excluded.title,
  city             = excluded.city,
  location_summary = excluded.location_summary,
  start_date       = excluded.start_date,
  end_date         = excluded.end_date,
  format           = excluded.format,
  platform_focus   = excluded.platform_focus,
  capacity         = excluded.capacity,
  status           = excluded.status;
