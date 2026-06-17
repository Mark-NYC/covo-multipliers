-- =============================================================================
-- Migration 20260617000002: Document events schema + secure register_for_event()
-- =============================================================================
--
-- This migration does three things:
--
--   1. Documents the events table in the repository migrations so the repo
--      schema matches the live database (the table already exists in production).
--
--   2. Recreates register_for_event() with the required SET search_path security
--      setting. The function logic is identical to the live version — only the
--      security configuration changes.
--
--   3. Documents / recreates the events_with_availability view that counts
--      all registrations. Migration 20260617000003 replaces it to count only
--      active registrations once the registration_status column exists.
--
-- All CREATE TABLE / CREATE INDEX statements use IF NOT EXISTS so the migration
-- is safe to run against the live database where these objects already exist.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Events table (already exists in production — documented here for the repo)
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null unique,
  title        text        not null,
  description  text,
  event_date   timestamptz not null,
  zoom_link    text,
  seat_limit   integer     not null default 25,
  is_published boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS: service role (Edge Functions) bypasses RLS; anon may read published events
alter table public.events enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'events'
      and policyname = 'events_published_read'
  ) then
    execute $p$
      create policy events_published_read on public.events
        for select to anon
        using (is_published = true)
    $p$;
  end if;
end $$;

-- events updated_at trigger
create or replace function public.events_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.events_set_updated_at() from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'events'
      and trigger_name = 'events_set_updated_at'
  ) then
    execute $t$
      create trigger events_set_updated_at
        before update on public.events
        for each row execute function public.events_set_updated_at()
    $t$;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. register_for_event() — same logic as live, corrected search_path
--
-- The live function had no explicit search_path, which is a security risk.
-- This version adds SET search_path = pg_catalog, public and revokes public
-- access. The function signature and return shape are unchanged so the
-- existing register Edge Function continues to work without modification.
-- ---------------------------------------------------------------------------

create or replace function public.register_for_event(
  p_event_id uuid,
  p_name     text,
  p_email    text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event         public.events%rowtype;
  v_existing_id   uuid;
  v_active_count  integer;
  v_reg_id        uuid;
  v_seats_left    integer;
  v_email         text;
begin
  v_email := lower(trim(p_email));

  -- Lock the event row to prevent concurrent over-booking
  select * into v_event
  from public.events
  where id = p_event_id and is_published = true
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'event_not_found');
  end if;

  -- Check for an existing registration with the same normalized email
  select id into v_existing_id
  from public.registrations
  where event_id = p_event_id
    and lower(trim(email)) = v_email
  for update;

  if found then
    return jsonb_build_object('success', false, 'error', 'already_registered');
  end if;

  -- Count all current registrations toward capacity
  select count(*) into v_active_count
  from public.registrations
  where event_id = p_event_id;

  if v_active_count >= v_event.seat_limit then
    return jsonb_build_object('success', false, 'error', 'event_full');
  end if;

  -- Insert the new registration
  insert into public.registrations (event_id, name, email)
  values (p_event_id, trim(p_name), v_email)
  returning id into v_reg_id;

  v_seats_left := v_event.seat_limit - v_active_count - 1;

  return jsonb_build_object(
    'success',          true,
    'registration_id',  v_reg_id,
    'event_title',      v_event.title,
    'event_date',       v_event.event_date,
    'zoom_link',        v_event.zoom_link,
    'seats_remaining',  greatest(v_seats_left, 0)
  );
end;
$$;

revoke all on function public.register_for_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 3. events_with_availability view — documented here, counts all registrations.
--    Migration 00003 replaces this view to count only active registrations.
-- ---------------------------------------------------------------------------
create or replace view public.events_with_availability as
select
  e.id,
  e.slug,
  e.title,
  e.description,
  e.event_date,
  e.zoom_link,
  e.seat_limit,
  e.is_published,
  e.created_at,
  e.updated_at,
  coalesce(r.reg_count, 0)                     as registered_count,
  greatest(e.seat_limit - coalesce(r.reg_count, 0), 0) as seats_available
from public.events e
left join (
  select event_id, count(*) as reg_count
  from public.registrations
  group by event_id
) r on r.event_id = e.id;

-- The view is readable by authenticated/anon via their existing event read policy;
-- service_role always bypasses RLS.
