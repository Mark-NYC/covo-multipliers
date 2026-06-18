-- =============================================================================
-- Migration 20260618000000: Fix events_with_availability RLS gap
-- =============================================================================
--
-- Problem: events_with_availability JOINs to public.registrations to count
-- active registrations. The registrations table has RLS enabled with no anon
-- read policy, so the anon key (used by all lab pages) gets a count of 0 for
-- every event. This makes seats_remaining = seat_limit = 25 for all events,
-- regardless of how many people have registered.
--
-- Fix: add a SECURITY DEFINER helper function that counts active registrations
-- for a given event. Because it runs as the function owner (postgres/service
-- role) it bypasses RLS and returns the real count. We then rebuild the view
-- to call this function instead of doing a direct JOIN, so anon gets correct
-- counts without gaining SELECT access to the registrations table.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER count helper
-- ---------------------------------------------------------------------------
create or replace function public.active_registration_count(p_event_id uuid)
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)
  from public.registrations
  where event_id = p_event_id
    and registration_status = 'active'
$$;

-- Grant anon/authenticated execute so the view column calculation works when
-- queried via the REST API under either role.
grant execute on function public.active_registration_count(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Rebuild events_with_availability using the SECURITY DEFINER helper
-- ---------------------------------------------------------------------------
create or replace view public.events_with_availability as
select
  e.id,
  e.slug,
  e.title,
  e.description,
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

-- The view is readable by anon via the existing events_published_read RLS
-- policy on public.events. No additional grant is needed.
