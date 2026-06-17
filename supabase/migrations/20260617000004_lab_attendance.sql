-- =============================================================================
-- Migration 20260617000004: Lab attendance
-- =============================================================================
--
-- Creates the lab_attendance table, backfills historical registrations,
-- installs an AFTER INSERT trigger so every new registration receives one
-- attendance row automatically, and replaces register_for_event() with its
-- final version that atomically resets the attendance row on reactivation.
--
-- Mutation functions (mark_attendance, bulk_mark_attendance) and the
-- reactivate_registration admin RPC are also created here because they all
-- reference lab_attendance.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. lab_attendance table
-- ---------------------------------------------------------------------------
create table if not exists public.lab_attendance (
  id                uuid        primary key default gen_random_uuid(),
  registration_id   uuid        not null unique
                                  references public.registrations(id)
                                  on delete restrict,
  status            text        not null default 'unreviewed',
  attendance_source text        not null default 'system',
  attended_at       timestamptz,
  attended_minutes  integer,
  zoom_display_name text,
  notes             text,
  status_changed_at timestamptz not null default now(),
  marked_by         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint lab_attendance_status_values
    check (status in ('unreviewed', 'attended', 'partial', 'no_show')),

  constraint lab_attendance_source_values
    check (attendance_source in ('system', 'manual', 'zoom_import', 'self_report')),

  constraint lab_attendance_minutes_non_negative
    check (attended_minutes is null or attended_minutes >= 0)
);

-- RLS: only service_role (via Edge Functions) may read or write attendance
alter table public.lab_attendance enable row level security;

-- No anon or authenticated policies — all access goes through SECURITY DEFINER
-- functions or the service-role Edge Function client

create index if not exists idx_lab_attendance_registration
  on public.lab_attendance (registration_id);

-- Efficient per-event attendance queries (derive event_id through registration)
create index if not exists idx_lab_attendance_status
  on public.lab_attendance (status);

-- updated_at trigger
create or replace function public.lab_attendance_set_updated_at()
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

revoke all on function public.lab_attendance_set_updated_at() from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'lab_attendance'
      and trigger_name = 'lab_attendance_set_updated_at'
  ) then
    execute $t$
      create trigger lab_attendance_set_updated_at
        before update on public.lab_attendance
        for each row
        when (old.* is distinct from new.*)
        execute function public.lab_attendance_set_updated_at()
    $t$;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. Backfill: all existing registrations get one unreviewed attendance row
--
-- created_at is always now() — we never backdate attendance.
-- ---------------------------------------------------------------------------
insert into public.lab_attendance (registration_id, status, attendance_source, marked_by)
select
  id,
  'unreviewed',
  'system',
  'system'
from public.registrations
where not exists (
  select 1 from public.lab_attendance la
  where la.registration_id = registrations.id
);


-- ---------------------------------------------------------------------------
-- 3. AFTER INSERT trigger on registrations
--    Every new registration automatically gets one unreviewed attendance row.
--    Trigger failure rolls back the registration insert.
-- ---------------------------------------------------------------------------
create or replace function public.registrations_create_attendance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.lab_attendance (
    registration_id,
    status,
    attendance_source,
    marked_by
  ) values (
    new.id,
    'unreviewed',
    'system',
    'system'
  );
  return null;  -- AFTER trigger; return value ignored
end;
$$;

revoke all on function public.registrations_create_attendance() from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'registrations'
      and trigger_name = 'registrations_create_attendance'
  ) then
    execute $t$
      create trigger registrations_create_attendance
        after insert on public.registrations
        for each row
        execute function public.registrations_create_attendance()
    $t$;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 4. register_for_event() — FINAL version
--
-- Replaces the version from migration 00003. This version atomically:
--   - reactivates the registrations row
--   - resets the lab_attendance row to unreviewed
--   - writes an audit record
-- all in a single transaction.
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

    -- Reset the attendance row atomically so no stale attended/partial/no_show
    -- status remains attached to a reactivated registration
    update public.lab_attendance set
      status            = 'unreviewed',
      attendance_source = 'system',
      attended_at       = null,
      attended_minutes  = null,
      zoom_display_name = null,
      notes             = null,
      marked_by         = 'system',
      status_changed_at = now()
    where registration_id = v_existing.id;

    -- Audit the reactivation (actor = 'system' for public re-registration)
    insert into public.admin_audit_log (actor, action, target_type, target_id, detail)
    values (
      'system',
      'registration.reactivated',
      'registrations',
      v_existing.id,
      jsonb_build_object(
        'event_id',         p_event_id,
        'email',            v_email,
        'trigger',          'public_re_registration',
        'attendance_reset', true
      )
    );

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

    -- Insert a new active registration.
    -- The AFTER INSERT trigger creates the unreviewed attendance row.
    insert into public.registrations (event_id, name, email, registration_status)
    values (p_event_id, trim(p_name), v_email, 'active')
    returning id into v_reg_id;

    v_reactivated := false;
  end if;

  -- seats_remaining after this operation
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
-- 5. reactivate_registration() — admin RPC
--
-- Admin-initiated reactivation by registration_id. Accepts the server-owned
-- actor string (never derived from browser input — the Edge Function reads
-- ADMIN_ATTENDANCE_ACTOR from the environment and passes it here).
-- Atomically: reactivates registration + resets attendance + writes audit log.
-- ---------------------------------------------------------------------------
create or replace function public.reactivate_registration(
  p_registration_id uuid,
  p_actor           text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reg        public.registrations%rowtype;
  v_event      public.events%rowtype;
  v_active_count integer;
begin
  select * into v_reg
  from public.registrations
  where id = p_registration_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if v_reg.registration_status = 'active' then
    return jsonb_build_object('success', false, 'error', 'already_active');
  end if;

  -- Check capacity on the target event
  select * into v_event
  from public.events
  where id = v_reg.event_id
  for update;

  select count(*) into v_active_count
  from public.registrations
  where event_id = v_reg.event_id
    and registration_status = 'active';

  if v_active_count >= v_event.seat_limit then
    return jsonb_build_object('success', false, 'error', 'event_full');
  end if;

  -- Reactivate registration row; clear stale lifecycle and reminder state
  update public.registrations set
    registration_status            = 'active',
    cancelled_at                   = null,
    cancellation_source            = null,
    cancellation_notes             = null,
    reactivated_at                 = now(),
    registration_status_changed_at = now(),
    confirmation_sent_at           = null,
    reminder_week_sent_at          = null,
    reminder_day_sent_at           = null,
    reminder_24h_sent_at           = null,
    reminder_1h_sent_at            = null
  where id = p_registration_id;

  -- Reset attendance row atomically
  update public.lab_attendance set
    status            = 'unreviewed',
    attendance_source = 'system',
    attended_at       = null,
    attended_minutes  = null,
    zoom_display_name = null,
    notes             = null,
    marked_by         = p_actor,
    status_changed_at = now()
  where registration_id = p_registration_id;

  -- Audit the admin reactivation
  insert into public.admin_audit_log (actor, action, target_type, target_id, detail)
  values (
    p_actor,
    'registration.reactivated',
    'registrations',
    p_registration_id,
    jsonb_build_object(
      'event_id',         v_reg.event_id,
      'email',            v_reg.email,
      'trigger',          'admin_reactivation',
      'attendance_reset', true
    )
  );

  return jsonb_build_object(
    'success',             true,
    'registration_id',     p_registration_id,
    'registration_status', 'active',
    'reactivated_at',      now(),
    'seats_remaining',     greatest(v_event.seat_limit - v_active_count - 1, 0)
  );
end;
$$;

revoke all on function public.reactivate_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.reactivate_registration(uuid, text) to service_role;


-- ---------------------------------------------------------------------------
-- 6. mark_attendance() — single-row mutation with audit log
-- ---------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_attendance_id   uuid,
  p_status          text,
  p_source          text,
  p_notes           text    default null,
  p_actor           text    default 'attendance_admin'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_att       public.lab_attendance%rowtype;
  v_old_status text;
  v_event_id  uuid;
  v_contact_id uuid;
begin
  if p_status not in ('unreviewed', 'attended', 'partial', 'no_show') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  if p_source not in ('system', 'manual', 'zoom_import', 'self_report') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  select * into v_att
  from public.lab_attendance
  where id = p_attendance_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  v_old_status := v_att.status;

  -- Derive event_id and contact_id through the registration
  select r.event_id, r.contact_id
  into v_event_id, v_contact_id
  from public.registrations r
  where r.id = v_att.registration_id;

  update public.lab_attendance set
    status            = p_status,
    attendance_source = p_source,
    notes             = coalesce(p_notes, notes),
    status_changed_at = now(),
    marked_by         = p_actor
  where id = p_attendance_id;

  insert into public.admin_audit_log (actor, action, target_type, target_id, detail)
  values (
    p_actor,
    'attendance.marked',
    'lab_attendance',
    p_attendance_id,
    jsonb_build_object(
      'event_id',        v_event_id,
      'registration_id', v_att.registration_id,
      'contact_id',      v_contact_id,
      'old_status',      v_old_status,
      'new_status',      p_status,
      'source',          p_source,
      'notes',           p_notes
    )
  );

  return jsonb_build_object(
    'success',    true,
    'id',         p_attendance_id,
    'old_status', v_old_status,
    'new_status', p_status
  );
end;
$$;

revoke all on function public.mark_attendance(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_attendance(uuid, text, text, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 7. bulk_mark_attendance() — multi-row mutation; one audit row per record
-- ---------------------------------------------------------------------------
create or replace function public.bulk_mark_attendance(
  p_attendance_ids uuid[],
  p_status         text,
  p_source         text,
  p_notes          text    default null,
  p_actor          text    default 'attendance_admin'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_att        public.lab_attendance%rowtype;
  v_old_status text;
  v_event_id   uuid;
  v_contact_id uuid;
  v_changed    integer := 0;
  v_errors     jsonb   := '[]'::jsonb;
  v_att_id     uuid;
begin
  if p_status not in ('unreviewed', 'attended', 'partial', 'no_show') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  if p_source not in ('system', 'manual', 'zoom_import', 'self_report') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  foreach v_att_id in array p_attendance_ids loop
    begin
      select * into v_att
      from public.lab_attendance
      where id = v_att_id
      for update;

      if not found then
        v_errors := v_errors || jsonb_build_object('id', v_att_id, 'error', 'not_found');
        continue;
      end if;

      v_old_status := v_att.status;

      select r.event_id, r.contact_id
      into v_event_id, v_contact_id
      from public.registrations r
      where r.id = v_att.registration_id;

      update public.lab_attendance set
        status            = p_status,
        attendance_source = p_source,
        notes             = coalesce(p_notes, notes),
        status_changed_at = now(),
        marked_by         = p_actor
      where id = v_att_id;

      insert into public.admin_audit_log (actor, action, target_type, target_id, detail)
      values (
        p_actor,
        'attendance.marked',
        'lab_attendance',
        v_att_id,
        jsonb_build_object(
          'event_id',        v_event_id,
          'registration_id', v_att.registration_id,
          'contact_id',      v_contact_id,
          'old_status',      v_old_status,
          'new_status',      p_status,
          'source',          p_source,
          'notes',           p_notes,
          'bulk',            true
        )
      );

      v_changed := v_changed + 1;

    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'id',    v_att_id,
        'error', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object(
    'success',       v_changed > 0 or jsonb_array_length(v_errors) = 0,
    'changed_count', v_changed,
    'error_count',   jsonb_array_length(v_errors),
    'errors',        v_errors
  );
end;
$$;

revoke all on function public.bulk_mark_attendance(uuid[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.bulk_mark_attendance(uuid[], text, text, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 8. list_event_registrants() — read-only helper used by attendance-admin
--
-- Returns one row per registration for the given event with all fields
-- the admin UI needs, including previous attended-lab count derived through
-- contacts.id. SECURITY DEFINER so the Edge Function (service role) can
-- call it without needing direct table access grants.
-- ---------------------------------------------------------------------------
create or replace function public.list_event_registrants(
  p_event_id uuid
)
returns table (
  registration_id             uuid,
  attendance_id               uuid,
  name                        text,
  email                       text,
  registration_status         text,
  cancelled_at                timestamptz,
  cancellation_source         text,
  reactivated_at              timestamptz,
  registration_created_at     timestamptz,
  attendance_status           text,
  attendance_source           text,
  status_changed_at           timestamptz,
  marked_by                   text,
  notes                       text,
  utm_source                  text,
  utm_medium                  text,
  utm_campaign                text,
  utm_content                 text,
  first_utm_source            text,
  first_utm_medium            text,
  first_utm_campaign          text,
  contact_id                  uuid,
  previous_attended_count     bigint
)
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  select
    r.id                  as registration_id,
    la.id                 as attendance_id,
    r.name,
    r.email,
    r.registration_status,
    r.cancelled_at,
    r.cancellation_source,
    r.reactivated_at,
    r.created_at          as registration_created_at,
    la.status             as attendance_status,
    la.attendance_source,
    la.status_changed_at,
    la.marked_by,
    la.notes,
    r.utm_source,
    r.utm_medium,
    r.utm_campaign,
    r.utm_content,
    r.first_utm_source,
    r.first_utm_medium,
    r.first_utm_campaign,
    r.contact_id,
    -- Previous attended/partial count on EARLIER events via the same contact
    coalesce((
      select count(*)
      from public.registrations prev_r
      join public.lab_attendance prev_la on prev_la.registration_id = prev_r.id
      join public.events prev_e          on prev_e.id = prev_r.event_id
      where prev_r.contact_id          = r.contact_id
        and prev_r.contact_id          is not null
        and prev_r.registration_status = 'active'
        and prev_la.status             in ('attended', 'partial')
        and prev_e.event_date          < (select event_date from public.events where id = p_event_id)
        and prev_r.event_id            <> p_event_id
    ), 0)                 as previous_attended_count
  from public.registrations r
  left join public.lab_attendance la on la.registration_id = r.id
  where r.event_id = p_event_id
  order by r.created_at asc;
$$;

revoke all on function public.list_event_registrants(uuid) from public, anon, authenticated;
grant execute on function public.list_event_registrants(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 9. get_event_attendance_stats() — attendance rates per event
-- ---------------------------------------------------------------------------
create or replace function public.get_event_attendance_stats(
  p_event_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
stable
as $$
  with counts as (
    select
      count(*) filter (
        where r.registration_status = 'active'
      )                                                           as total_active,
      count(*) filter (
        where r.registration_status = 'cancelled'
      )                                                           as total_cancelled,
      count(*) filter (
        where r.registration_status = 'active'
          and la.status = 'unreviewed'
      )                                                           as unreviewed,
      count(*) filter (
        where r.registration_status = 'active'
          and la.status in ('attended', 'partial', 'no_show')
      )                                                           as reviewed_active,
      count(*) filter (
        where r.registration_status = 'active'
          and la.status in ('attended', 'partial')
      )                                                           as attended_or_partial
    from public.registrations r
    left join public.lab_attendance la on la.registration_id = r.id
    where r.event_id = p_event_id
  )
  select jsonb_build_object(
    'total_active',           total_active,
    'total_cancelled',        total_cancelled,
    'unreviewed',             unreviewed,
    'reviewed_active',        reviewed_active,
    'attended_or_partial',    attended_or_partial,
    -- attendance_rate = attended_or_partial / reviewed_active
    'attendance_rate',        case
                                when reviewed_active = 0 then null
                                else round(
                                  attended_or_partial::numeric / reviewed_active::numeric * 100,
                                  1
                                )
                              end,
    -- data_completion_rate = reviewed_active / total_active
    'data_completion_rate',   case
                                when total_active = 0 then null
                                else round(
                                  reviewed_active::numeric / total_active::numeric * 100,
                                  1
                                )
                              end
  )
  from counts;
$$;

revoke all on function public.get_event_attendance_stats(uuid) from public, anon, authenticated;
grant execute on function public.get_event_attendance_stats(uuid) to service_role;
