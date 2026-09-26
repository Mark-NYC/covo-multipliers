-- =============================================================================
-- Online Four Fields Intensive — December 4–6, 2026
-- =============================================================================
--
-- First multi-session event on the lab infrastructure. Three parts:
--
-- 1. events.event_type ('lab' | 'intensive'), exposed through
--    events_with_availability. The homepage/labs feed (public-labs) and the
--    WordPress next-lab widget show only event_type = 'lab', so the intensive
--    never shows up as a "45 min · Free" monthly lab card.
--
-- 2. registration_session_reminders: one row per (registration, session)
--    "starting in 1 hour" email sent for sessions AFTER the first. The first
--    session is covered by the existing reminder_*_sent_at columns because
--    events.event_date = start of session 1. The session schedule itself lives
--    in supabase/functions/_shared/eventSessions.ts.
--
-- 3. The event row.
--      Day 1  Fri Dec 4   6:30–9:30 PM ET   (23:30–02:30 UTC)
--      Day 2  Sat Dec 5   9:00 AM–4:00 PM ET (14:00–21:00 UTC)
--      Day 3  Sun Dec 6   1:00–4:00 PM ET   (18:00–21:00 UTC)
--    December is EST (UTC-5). event_date = Day 1 start = 2026-12-04 23:30 UTC.
--
-- TODO before go-live:
--   * zoom_link: paste the real Zoom link (one link for all three sessions).
--   * seat_limit: confirm the real cap (25 = table default placeholder).
--
-- Safe to re-run.
-- =============================================================================

-- 1. event_type ---------------------------------------------------------------
alter table public.events
  add column if not exists event_type text not null default 'lab';

comment on column public.events.event_type is
  'lab = monthly 45-minute lab (shown in the public labs feed); intensive = multi-session training with its own landing page (excluded from the labs feed).';

-- Same view as 20270705000000_events_slides_url.sql plus event_type.
-- DROP + CREATE for the same column-order reason documented there.
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
  e.event_type,
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

grant select on public.events_with_availability to anon, authenticated, service_role;

-- 2. per-session reminder tracking -------------------------------------------
create table if not exists public.registration_session_reminders (
  registration_id uuid        not null references public.registrations(id) on delete cascade,
  session_index   integer     not null,
  sent_at         timestamptz not null default now(),
  primary key (registration_id, session_index)
);

comment on table public.registration_session_reminders is
  'One row per multi-session reminder sent (send-lab-reminders). session_index is 0-based into the schedule in _shared/eventSessions.ts; index 0 is never written (session 1 uses the reminder_*_sent_at columns).';

-- Service role only (Edge Functions). No policies = no anon/authenticated access.
alter table public.registration_session_reminders enable row level security;

-- 3. the event ----------------------------------------------------------------
insert into public.events (
  id,
  slug,
  title,
  description,
  hook,
  landing_path,
  event_type,
  event_date,
  zoom_link,
  seat_limit,
  is_published,
  created_at,
  updated_at
)
values (
  gen_random_uuid(),
  'four-fields-intensive-december-2026',
  'Online Four Fields Intensive',
  'A weekend rediscovering the biblical principles and patterns behind how Jesus made disciples, developed leaders, and multiplied His Kingdom — and what they mean for making disciples and multiplying churches today. Not just more tools. A different way of seeing the work.',
  'Rediscover the pattern behind how Jesus made disciples and multiplied His Kingdom.',
  '/four-fields-intensive.html',
  'intensive',
  '2026-12-04 23:30:00+00',
  null,
  25,
  true,
  now(),
  now()
)
on conflict (slug) do update set
  title        = excluded.title,
  description  = excluded.description,
  hook         = excluded.hook,
  landing_path = excluded.landing_path,
  event_type   = excluded.event_type,
  event_date   = excluded.event_date,
  is_published = excluded.is_published,
  updated_at   = now();
  -- zoom_link and seat_limit intentionally NOT overwritten on re-run, so
  -- values set in production are never clobbered.
