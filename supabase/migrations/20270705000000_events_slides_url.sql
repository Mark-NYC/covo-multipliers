-- =============================================================================
-- Public labs feed: slides_url column
-- =============================================================================
--
-- The /labs listing page (labs.html) shows every lab — upcoming and past —
-- and is designed to surface a link to each lab's slide deck once one exists.
-- This adds that field directly onto public.events (keeping events the single
-- source of truth) and exposes it through events_with_availability so the
-- public-labs Edge Function can serve it alongside hook + landing_path.
--
-- slides_url is optional: consumers simply omit the slides link when it is
-- null, so labs without a published deck render exactly as before.
-- =============================================================================

alter table public.events
  add column if not exists slides_url text;

comment on column public.events.slides_url is
  'Optional absolute URL to this lab''s slide deck (e.g. a Google Slides / PDF link) shown on the /labs listing page. Consumers omit the slides link when this is null.';

-- Rebuild the view (same active_registration_count-based availability
-- calculation from 20260618000000_fix_availability_view_rls.sql, same
-- hook/landing_path exposure from 20270704000000_labs_public_feed.sql) to
-- also expose the new slides_url column.
--
-- We DROP + CREATE rather than CREATE OR REPLACE: Postgres only lets
-- CREATE OR REPLACE VIEW append new columns at the end, and the live
-- view's column order differs from the list below, so a replace fails
-- with "cannot change name of view column ... 42P16". Dropping first
-- sidesteps the ordering constraint entirely. Nothing in the database
-- depends on this view (it's consumed only by app code / the REST API),
-- so a plain (non-CASCADE) drop is safe; the grants it drops are
-- restored explicitly below.
drop view if exists public.events_with_availability;

create view public.events_with_availability as
select
  e.id,
  e.slug,
  e.title,
  e.description,
  e.hook,
  e.landing_path,
  e.slides_url,
  e.event_date,
  e.seat_limit,
  greatest(
    e.seat_limit - public.active_registration_count(e.id),
    0
  )        as seats_remaining,
  greatest(
    e.seat_limit - public.active_registration_count(e.id),
    0
  ) > 0   as has_availability
from public.events e
where e.is_published = true;

-- Restore read access. anon/authenticated read the view over the REST API
-- (its WHERE is_published = true keeps it to public rows); service_role is
-- what the public-labs Edge Function uses.
grant select on public.events_with_availability to anon, authenticated, service_role;
