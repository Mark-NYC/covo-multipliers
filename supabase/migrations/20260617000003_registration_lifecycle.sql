-- =============================================================================
-- Migration 20260617000003: Registration lifecycle
-- =============================================================================
--
-- Adds cancellation / reactivation lifecycle to the registrations table,
-- updates register_for_event() to count only active registrations and support
-- reactivation, replaces events_with_availability to count active only, and
-- adds cancel_registration() and a stub reactivate_registration() that are
-- replaced by their final attendance-aware versions in migration 00004.
--
-- NOTE: register_for_event() is replaced AGAIN in migration 00004 to also
-- reset the lab_attendance row atomically on reactivation. The version here
-- only handles the registrations row because lab_attendance does not yet exist.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Lifecycle columns on registrations
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column if not exists registration_status            text        not null default 'active',
  add column if not exists cancelled_at                   timestamptz,
  add column if not exists cancellation_source            text,
  add column if not exists cancellation_notes             text,
  add column if not exists reactivated_at                 timestamptz,
  add column if not exists registration_status_changed_at timestamptz not null default now(),
  add column if not exists updated_at                     timestamptz not null default now();

-- Constraints (idempotent via DO blocks)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.registrations'::regclass
      and conname = 'registrations_status_values'
  ) then
    alter table public.registrations
      add constraint registrations_status_values
        check (registration_status in ('active', 'cancelled'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.registrations'::regclass
      and conname = 'registrations_cancelled_requires_at'
  ) then
    alter table public.registrations
      add constraint registrations_cancelled_requires_at
        check (
          registration_status <> 'cancelled'
          or cancelled_at is not null
        );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.registrations'::regclass
      and conname = 'registrations_cancellation_source_values'
  ) then
    alter table public.registrations
      add constraint registrations_cancellation_source_values
        check (
          cancellation_source is null
          or cancellation_source in ('admin', 'registrant', 'system')
        );
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Backfill existing rows as active
-- ---------------------------------------------------------------------------
update public.registrations
set
  registration_status            = 'active',
  registration_status_changed_at = coalesce(created_at, now()),
  updated_at                     = coalesce(created_at, now())
where registration_status = 'active'  -- only rows not yet touched (all of them on first run)
  and cancelled_at is null;            -- safety guard for idempotency


-- ---------------------------------------------------------------------------
-- 3. Indexes for lifecycle-aware queries
-- ---------------------------------------------------------------------------
create index if not exists idx_registrations_event_status
  on public.registrations (event_id, registration_status);

create index if not exists idx_registrations_contact_status
  on public.registrations (contact_id, registration_status)
  where contact_id is not null;

-- Update reminder partial indexes to exclude cancelled registrations.
-- The original partial indexes (from earlier migrations) only filter on the
-- sent_at column being null, which would let cancelled registrations through.
-- We drop and recreate them with an additional active-status guard.

drop index if exists public.idx_registrations_reminder_week;
create index if not exists idx_registrations_reminder_week
  on public.registrations (event_id, reminder_week_sent_at)
  where reminder_week_sent_at is null
    and registration_status = 'active';

drop index if exists public.idx_registrations_reminder_day;
create index if not exists idx_registrations_reminder_day
  on public.registrations (event_id, reminder_day_sent_at)
  where reminder_day_sent_at is null
    and registration_status = 'active';

drop index if exists public.idx_registrations_reminder_24h;
create index if not exists idx_registrations_reminder_24h
  on public.registrations (event_id, reminder_24h_sent_at)
  where reminder_24h_sent_at is null
    and registration_status = 'active';

drop index if exists public.idx_registrations_reminder_1h;
create index if not exists idx_registrations_reminder_1h
  on public.registrations (event_id, reminder_1h_sent_at)
  where reminder_1h_sent_at is null
    and registration_status = 'active';


-- ---------------------------------------------------------------------------
-- 4. registrations updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.registrations_set_updated_at()
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

revoke all on function public.registrations_set_updated_at() from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'registrations'
      and trigger_name = 'registrations_set_updated_at'
  ) then
    execute $t$
      create trigger registrations_set_updated_at
        before update on public.registrations
        for each row
        when (old.* is distinct from new.*)
        execute function public.registrations_set_updated_at()
    $t$;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 5. replace events_with_availability — count active registrations only
--    Live column contract: id, slug, title, description, event_date, seat_limit,
--    seats_remaining, has_availability — must match the production view exactly.
-- ---------------------------------------------------------------------------
create or replace view public.events_with_availability as
select
  e.id,
  e.slug,
  e.title,
  e.description,
  e.event_date,
  e.seat_limit,
  greatest(e.seat_limit - coalesce(r.active_count, 0), 0)        as seats_remaining,
  greatest(e.seat_limit - coalesce(r.active_count, 0), 0) > 0    as has_availability
from public.events e
left join (
  select event_id, count(*) as active_count
  from public.registrations
  where registration_status = 'active'
  group by event_id
) r on r.event_id = e.id
where e.is_published = true;


-- ---------------------------------------------------------------------------
-- 6. register_for_event() — lifecycle-aware (registrations layer only)
--
-- NOTE: This version handles reactivation of the registrations row.
-- Migration 00004 replaces it again to also reset the lab_attendance row
-- and write an audit record atomically. Do not call reactivation paths
-- between running 00003 and 00004.
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
  v_event          public.events%rowtype;
  v_existing       public.registrations%rowtype;
  v_active_count   integer;
  v_reg_id         uuid;
  v_seats_left     integer;
  v_email          text;
  v_reactivated    boolean := false;
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

  -- Find any existing registration for this email (active or cancelled)
  select * into v_existing
  from public.registrations
  where event_id = p_event_id
    and lower(trim(email)) = v_email
  for update;

  if found then
    if v_existing.registration_status = 'active' then
      return jsonb_build_object('success', false, 'error', 'already_registered');
    end if;

    -- Cancelled registration: check active capacity before reactivating
    select count(*) into v_active_count
    from public.registrations
    where event_id = p_event_id
      and registration_status = 'active';

    if v_active_count >= v_event.seat_limit then
      return jsonb_build_object('success', false, 'error', 'event_full');
    end if;

    -- Reactivate the existing row; clear all stale lifecycle and reminder state
    update public.registrations set
      registration_status            = 'active',
      name                           = trim(p_name),
      email                          = v_email,
      cancelled_at                   = null,
      cancellation_source            = null,
      cancellation_notes             = null,
      reactivated_at                 = now(),
      registration_status_changed_at = now(),
      -- Clear confirmation and all reminder timestamps so the person receives
      -- the current confirmation email and future reminders as if newly registered
      confirmation_sent_at           = null,
      reminder_week_sent_at          = null,
      reminder_day_sent_at           = null,
      reminder_24h_sent_at           = null,
      reminder_1h_sent_at            = null
    where id = v_existing.id;

    v_reg_id      := v_existing.id;
    v_reactivated := true;

  else
    -- No existing registration: check active capacity
    select count(*) into v_active_count
    from public.registrations
    where event_id = p_event_id
      and registration_status = 'active';

    if v_active_count >= v_event.seat_limit then
      return jsonb_build_object('success', false, 'error', 'event_full');
    end if;

    -- Insert a new active registration
    insert into public.registrations (event_id, name, email, registration_status)
    values (p_event_id, trim(p_name), v_email, 'active')
    returning id into v_reg_id;

    v_reactivated := false;
  end if;

  -- seats_remaining = limit - (active count before this operation) - 1 new active row
  v_seats_left := v_event.seat_limit - v_active_count - 1;

  return jsonb_build_object(
    'success',          true,
    'registration_id',  v_reg_id,
    'reactivated',      v_reactivated,
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
-- 7. cancel_registration() RPC
--
-- Cancels a single active registration.  Writes an admin_audit_log row
-- in the same transaction.  Never deletes the registration row.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_registration(
  p_registration_id    uuid,
  p_cancellation_source text,
  p_cancellation_notes  text    default null,
  p_actor               text    default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reg  public.registrations%rowtype;
begin
  if p_cancellation_source not in ('admin', 'registrant', 'system') then
    return jsonb_build_object(
      'success', false,
      'error',   'invalid_cancellation_source'
    );
  end if;

  select * into v_reg
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if v_reg.registration_status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'already_cancelled');
  end if;

  update public.registrations set
    registration_status            = 'cancelled',
    cancelled_at                   = now(),
    cancellation_source            = p_cancellation_source,
    cancellation_notes             = p_cancellation_notes,
    registration_status_changed_at = now()
  where id = p_registration_id;

  insert into public.admin_audit_log (actor, action, target_type, target_id, detail)
  values (
    p_actor,
    'registration.cancelled',
    'registrations',
    p_registration_id,
    jsonb_build_object(
      'event_id',            v_reg.event_id,
      'email',               v_reg.email,
      'cancellation_source', p_cancellation_source,
      'cancellation_notes',  p_cancellation_notes
    )
  );

  return jsonb_build_object(
    'success',             true,
    'registration_id',     p_registration_id,
    'registration_status', 'cancelled',
    'cancelled_at',        now()
  );
end;
$$;

revoke all on function public.cancel_registration(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_registration(uuid, text, text, text) to service_role;
