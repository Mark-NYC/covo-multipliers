-- =============================================================================
-- Lab attendance verification — read-only
-- Run in Supabase SQL Editor after applying migrations 00002–00004.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Every active registration has exactly one attendance row
-- ---------------------------------------------------------------------------
select
  'active_registrations_missing_attendance' as check_name,
  count(*) as violation_count
from public.registrations r
where r.registration_status = 'active'
  and not exists (
    select 1 from public.lab_attendance la
    where la.registration_id = r.id
  )

union all

-- ---------------------------------------------------------------------------
-- 2. Every cancelled registration has exactly one attendance row
-- ---------------------------------------------------------------------------
select
  'cancelled_registrations_missing_attendance',
  count(*)
from public.registrations r
where r.registration_status = 'cancelled'
  and not exists (
    select 1 from public.lab_attendance la
    where la.registration_id = r.id
  )

union all

-- ---------------------------------------------------------------------------
-- 3. No registration has multiple attendance rows (UNIQUE constraint enforces
--    this, but verifying explicitly)
-- ---------------------------------------------------------------------------
select
  'registrations_with_multiple_attendance_rows',
  count(*)
from (
  select registration_id
  from public.lab_attendance
  group by registration_id
  having count(*) > 1
) dups

union all

-- ---------------------------------------------------------------------------
-- 4. No orphan attendance rows (registration_id points to missing registration)
-- ---------------------------------------------------------------------------
select
  'orphan_attendance_rows',
  count(*)
from public.lab_attendance la
where not exists (
  select 1 from public.registrations r
  where r.id = la.registration_id
)

union all

-- ---------------------------------------------------------------------------
-- 5. Invalid attendance statuses (should be 0)
-- ---------------------------------------------------------------------------
select
  'invalid_attendance_statuses',
  count(*)
from public.lab_attendance
where status not in ('unreviewed', 'attended', 'partial', 'no_show')

union all

-- ---------------------------------------------------------------------------
-- 6. Invalid attendance sources (should be 0)
-- ---------------------------------------------------------------------------
select
  'invalid_attendance_sources',
  count(*)
from public.lab_attendance
where attendance_source not in ('system', 'manual', 'zoom_import', 'self_report')

union all

-- ---------------------------------------------------------------------------
-- 7. Invalid registration statuses (should be 0)
-- ---------------------------------------------------------------------------
select
  'invalid_registration_statuses',
  count(*)
from public.registrations
where registration_status not in ('active', 'cancelled')

union all

-- ---------------------------------------------------------------------------
-- 8. Cancelled registrations with no cancelled_at (constraint violation — 0)
-- ---------------------------------------------------------------------------
select
  'cancelled_without_cancelled_at',
  count(*)
from public.registrations
where registration_status = 'cancelled'
  and cancelled_at is null

union all

-- ---------------------------------------------------------------------------
-- 9. first_seen_at > last_seen_at on contacts (should be 0)
-- ---------------------------------------------------------------------------
select
  'contacts_first_seen_after_last_seen',
  count(*)
from public.contacts
where first_seen_at > last_seen_at

order by check_name;


-- ---------------------------------------------------------------------------
-- 10. events_with_availability matches manual active count per event
-- ---------------------------------------------------------------------------
select
  e.id,
  e.slug,
  v.registered_count       as view_count,
  count(r.id) filter (
    where r.registration_status = 'active'
  )                        as manual_active_count,
  v.registered_count = count(r.id) filter (
    where r.registration_status = 'active'
  )                        as counts_match
from public.events e
join public.events_with_availability v on v.id = e.id
left join public.registrations r on r.event_id = e.id
group by e.id, e.slug, v.registered_count
order by e.event_date desc;


-- ---------------------------------------------------------------------------
-- 11. Active vs cancelled vs unreviewed counts per event
-- ---------------------------------------------------------------------------
select
  e.title,
  e.event_date::date                                                      as date,
  count(r.id) filter (where r.registration_status = 'active')            as active,
  count(r.id) filter (where r.registration_status = 'cancelled')         as cancelled,
  count(la.id) filter (
    where r.registration_status = 'active' and la.status = 'unreviewed'
  )                                                                       as unreviewed,
  count(la.id) filter (
    where r.registration_status = 'active' and la.status = 'attended'
  )                                                                       as attended,
  count(la.id) filter (
    where r.registration_status = 'active' and la.status = 'partial'
  )                                                                       as partial,
  count(la.id) filter (
    where r.registration_status = 'active' and la.status = 'no_show'
  )                                                                       as no_show
from public.events e
left join public.registrations r on r.event_id = e.id
left join public.lab_attendance la on la.registration_id = r.id
group by e.id, e.title, e.event_date
order by e.event_date desc;


-- ---------------------------------------------------------------------------
-- 12. Attendance + completion rates per event (via the DB function)
-- ---------------------------------------------------------------------------
select
  e.title,
  e.event_date::date as date,
  public.get_event_attendance_stats(e.id) as stats
from public.events e
order by e.event_date desc;


-- ---------------------------------------------------------------------------
-- 13. Cancelled registrations excluded from active capacity count
--     (Verify that events_with_availability uses only active rows)
-- ---------------------------------------------------------------------------
select
  e.title,
  e.seat_limit,
  v.registered_count as view_active_count,
  v.seats_available,
  (select count(*) from public.registrations r
    where r.event_id = e.id and r.registration_status = 'cancelled') as cancelled_count
from public.events e
join public.events_with_availability v on v.id = e.id
order by e.event_date desc;


-- ---------------------------------------------------------------------------
-- 14. SECURITY DEFINER functions: verify search_path is set
-- ---------------------------------------------------------------------------
select
  proname         as function_name,
  prosecdef       as security_definer,
  proconfig       as config
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'register_for_event',
    'cancel_registration',
    'reactivate_registration',
    'mark_attendance',
    'bulk_mark_attendance',
    'list_event_registrants',
    'get_event_attendance_stats',
    'registrations_create_attendance',
    'registrations_set_updated_at',
    'lab_attendance_set_updated_at'
  )
order by proname;


-- ---------------------------------------------------------------------------
-- 15. Function grants: only service_role should have EXECUTE
-- ---------------------------------------------------------------------------
select
  r.routine_name,
  g.grantee,
  g.privilege_type
from information_schema.routines r
join information_schema.role_routine_grants g
     on g.routine_name = r.routine_name
     and g.routine_schema = r.routine_schema
where r.routine_schema = 'public'
  and r.routine_name in (
    'register_for_event',
    'cancel_registration',
    'reactivate_registration',
    'mark_attendance',
    'bulk_mark_attendance',
    'list_event_registrants',
    'get_event_attendance_stats'
  )
order by r.routine_name, g.grantee;


-- ---------------------------------------------------------------------------
-- 16. RLS enabled on lab_attendance
-- ---------------------------------------------------------------------------
select
  relname             as table_name,
  relrowsecurity      as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'lab_attendance';


-- ---------------------------------------------------------------------------
-- 17. Triggers installed on registrations
-- ---------------------------------------------------------------------------
select
  trigger_name,
  event_manipulation as event,
  action_timing      as timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'registrations'
order by trigger_name, event;


-- ---------------------------------------------------------------------------
-- 18. Triggers installed on lab_attendance
-- ---------------------------------------------------------------------------
select
  trigger_name,
  event_manipulation as event,
  action_timing      as timing
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'lab_attendance'
order by trigger_name;


-- ---------------------------------------------------------------------------
-- 19. Audit log entries for reactivation and attendance (recent 20)
-- ---------------------------------------------------------------------------
select
  actor,
  action,
  target_type,
  target_id,
  detail,
  created_at
from public.admin_audit_log
where action in (
  'registration.reactivated',
  'registration.cancelled',
  'attendance.marked'
)
order by created_at desc
limit 20;


-- ---------------------------------------------------------------------------
-- 20. Reminder columns: confirm no cancelled registrations will receive
--     reminders (all reminder-sent_at columns null means eligible;
--     show cancelled rows that still have a null reminder column —
--     these are harmless only because the Edge Function filters by
--     registration_status = 'active', which we confirmed in the code)
-- ---------------------------------------------------------------------------
select
  registration_status,
  count(*) filter (where reminder_week_sent_at is null) as week_reminder_null,
  count(*) filter (where reminder_day_sent_at  is null) as day_reminder_null,
  count(*) filter (where reminder_24h_sent_at  is null) as r24h_reminder_null,
  count(*) filter (where reminder_1h_sent_at   is null) as r1h_reminder_null,
  count(*)                                               as total
from public.registrations
group by registration_status
order by registration_status;
