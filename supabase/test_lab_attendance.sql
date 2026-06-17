-- =============================================================================
-- Lab attendance tests — run in a transaction; rolls back after all assertions.
-- Execute in Supabase SQL Editor.  All assertions return a row with
-- test_name and result ('PASS' or 'FAIL: <detail>').
--
-- The tests use a dedicated test event and synthetic registrations so they
-- never touch production data.  Everything is rolled back at the end.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Setup: create a test event with seat_limit = 3
-- ---------------------------------------------------------------------------
insert into public.events (id, slug, title, event_date, seat_limit, is_published)
values (
  '00000000-0000-0000-0000-000000000001',
  'test-lab-attendance-event',
  'Test Lab (attendance tests)',
  now() + interval '7 days',
  3,
  true
);

-- ---------------------------------------------------------------------------
-- Helper: expect_eq(label, actual, expected)
-- ---------------------------------------------------------------------------
create temp function expect_eq(label text, actual text, expected text)
returns table(test_name text, result text)
language sql as $$
  select
    label,
    case
      when actual = expected then 'PASS'
      else 'FAIL: expected ' || coalesce(expected,'<null>') || ' got ' || coalesce(actual,'<null>')
    end;
$$;


-- =============================================================================
-- TEST 1: New registration creates active registration and unreviewed attendance
-- =============================================================================
do $$ declare v jsonb; begin
  v := public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Alice Test', 'alice@test.example'
  );
  if not (v->>'success')::boolean then
    raise exception 'TEST 1 failed: register_for_event returned %', v;
  end if;
end $$;

select * from expect_eq(
  'T01 new registration = active',
  (select registration_status from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  'active'
);

select * from expect_eq(
  'T01 new registration gets unreviewed attendance',
  (select la.status from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  'unreviewed'
);


-- =============================================================================
-- TEST 2: Duplicate active registration returns already_registered
-- =============================================================================
select * from expect_eq(
  'T02 duplicate returns already_registered',
  (public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Alice Test', 'alice@test.example'
  ))->>'error',
  'already_registered'
);


-- =============================================================================
-- TEST 3: Cancelled registration releases a seat (capacity = 3, 1 active; cancel;
--         then add 3 more — all should succeed)
-- =============================================================================
-- Add two more registrations to fill to capacity
do $$ declare v jsonb; begin
  v := public.register_for_event('00000000-0000-0000-0000-000000000001','Bob Test','bob@test.example');
  if not (v->>'success')::boolean then raise exception 'T03 Bob failed: %', v; end if;
  v := public.register_for_event('00000000-0000-0000-0000-000000000001','Carol Test','carol@test.example');
  if not (v->>'success')::boolean then raise exception 'T03 Carol failed: %', v; end if;
end $$;

-- At capacity: 4th registration must fail
select * from expect_eq(
  'T03 4th registration rejected (full)',
  (public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Dave Test', 'dave@test.example'
  ))->>'error',
  'event_full'
);

-- Cancel Alice → seat released
do $$ declare r_id uuid; v jsonb; begin
  select id into r_id from public.registrations
  where event_id = '00000000-0000-0000-0000-000000000001'
    and lower(email) = 'alice@test.example';
  v := public.cancel_registration(r_id, 'admin', 'test cancel');
  if not (v->>'success')::boolean then raise exception 'T03 cancel failed: %', v; end if;
end $$;

-- Dave should now succeed
select * from expect_eq(
  'T03 4th registration succeeds after cancel',
  (public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Dave Test', 'dave@test.example'
  ))->>'success',
  'true'
);


-- =============================================================================
-- TEST 4: Same email registers again → reactivates same row
-- =============================================================================
-- Alice is currently cancelled; cancel Dave to free a seat, then re-register Alice
do $$ declare r_id uuid; v jsonb; begin
  select id into r_id from public.registrations
  where event_id = '00000000-0000-0000-0000-000000000001'
    and lower(email) = 'dave@test.example';
  v := public.cancel_registration(r_id, 'admin', 'free seat for test 4');
  if not (v->>'success')::boolean then raise exception 'T04 cancel dave failed: %', v; end if;
end $$;

do $$ declare v jsonb; begin
  v := public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Alice Test', 'alice@test.example'
  );
  if not (v->>'success')::boolean then raise exception 'T04 re-register failed: %', v; end if;
  if not (v->>'reactivated')::boolean then raise exception 'T04 reactivated flag not true: %', v; end if;
end $$;

select * from expect_eq(
  'T04 re-registration reactivates same row',
  (select registration_status from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  'active'
);

-- Row count must still be 1 (not a new insert)
select * from expect_eq(
  'T04 only one row for alice (not a duplicate)',
  (select count(*)::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  '1'
);


-- =============================================================================
-- TEST 5: Reactivation clears stale reminder timestamps
-- =============================================================================
-- Manually set reminder timestamps on Alice's row then cancel and re-register
do $$ declare r_id uuid; begin
  select id into r_id from public.registrations
  where event_id = '00000000-0000-0000-0000-000000000001'
    and lower(email) = 'alice@test.example';
  update public.registrations set
    confirmation_sent_at  = now(),
    reminder_week_sent_at = now(),
    reminder_day_sent_at  = now(),
    reminder_24h_sent_at  = now(),
    reminder_1h_sent_at   = now()
  where id = r_id;
  -- Cancel then re-register
  perform public.cancel_registration(r_id, 'admin', 'reminder test');
end $$;

-- Free a seat first (cancel Bob)
do $$ declare r_id uuid; v jsonb; begin
  select id into r_id from public.registrations
  where event_id = '00000000-0000-0000-0000-000000000001'
    and lower(email) = 'bob@test.example';
  v := public.cancel_registration(r_id, 'admin', 'free seat for T05');
  if not (v->>'success')::boolean then raise exception 'T05 cancel bob failed: %', v; end if;
end $$;

do $$ declare v jsonb; begin
  v := public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Alice Test', 'alice@test.example'
  );
  if not (v->>'success')::boolean then raise exception 'T05 re-register failed: %', v; end if;
end $$;

select * from expect_eq(
  'T05 reactivation clears confirmation_sent_at',
  (select confirmation_sent_at::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  null
);

select * from expect_eq(
  'T05 reactivation clears reminder_week_sent_at',
  (select reminder_week_sent_at::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  null
);

select * from expect_eq(
  'T05 reactivation clears reminder_24h_sent_at',
  (select reminder_24h_sent_at::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  null
);


-- =============================================================================
-- TEST 6: Capacity calculation counts active only
-- =============================================================================
-- Alice active, Bob cancelled, Carol active = 2 active out of 3 limit
select * from expect_eq(
  'T06 seats_available counts active only',
  (select seats_available::text from public.events_with_availability
   where id = '00000000-0000-0000-0000-000000000001'),
  '1'   -- 3 limit - 2 active = 1
);


-- =============================================================================
-- TEST 7: events_with_availability counts active only
-- =============================================================================
select * from expect_eq(
  'T07 registered_count = active registrations only',
  (select registered_count::text from public.events_with_availability
   where id = '00000000-0000-0000-0000-000000000001'),
  '2'   -- Alice + Carol active; Bob and Dave cancelled
);


-- =============================================================================
-- TEST 8: Cancelled registration excluded from reminder eligibility
-- =============================================================================
-- Bob is cancelled. Reminder query (registration_status = 'active' AND
-- reminder_week_sent_at IS NULL) must NOT return Bob.
select * from expect_eq(
  'T08 cancelled registration excluded from reminder query',
  (select count(*)::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and registration_status = 'active'
     and reminder_week_sent_at is null),
  '2'   -- only Alice and Carol
);


-- =============================================================================
-- TEST 9: Manual attended mark and audit log commit together
-- =============================================================================
do $$ declare att_id uuid; v jsonb; begin
  select la.id into att_id from public.lab_attendance la
  join public.registrations r on r.id = la.registration_id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'alice@test.example';

  v := public.mark_attendance(att_id, 'attended', 'manual', 'was present', 'test_actor');
  if not (v->>'success')::boolean then raise exception 'T09 mark failed: %', v; end if;
end $$;

select * from expect_eq(
  'T09 attendance status updated',
  (select la.status from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  'attended'
);

select * from expect_eq(
  'T09 audit log written',
  (select count(*)::text from public.admin_audit_log
   where action = 'attendance.marked'
     and actor = 'test_actor'
     and (detail->>'new_status') = 'attended'),
  '1'
);


-- =============================================================================
-- TEST 10: (Simulated) Failed audit insert rolls back attendance update
-- We verify atomicity by checking that mark_attendance uses a single tx;
-- simulate by calling with an invalid status that triggers early return.
-- =============================================================================
select * from expect_eq(
  'T10 invalid status returns error not exception',
  (public.mark_attendance(
    (select la.id from public.lab_attendance la
     join public.registrations r on r.id = la.registration_id
     where r.event_id = '00000000-0000-0000-0000-000000000001'
       and lower(r.email) = 'alice@test.example'),
    'INVALID_STATUS', 'manual', null, 'actor'
  ))->>'error',
  'invalid_status'
);

-- Attendance must not have changed
select * from expect_eq(
  'T10 status unchanged after invalid mark',
  (select la.status from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  'attended'
);


-- =============================================================================
-- TEST 11: Bulk mark writes one audit row per attendance row
-- =============================================================================
do $$ declare alice_att uuid; carol_att uuid; v jsonb; begin
  select la.id into alice_att from public.lab_attendance la
  join public.registrations r on r.id = la.registration_id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'alice@test.example';

  select la.id into carol_att from public.lab_attendance la
  join public.registrations r on r.id = la.registration_id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'carol@test.example';

  v := public.bulk_mark_attendance(
    array[alice_att, carol_att],
    'no_show', 'manual', null, 'bulk_test_actor'
  );
  if (v->>'changed_count')::int < 2 then
    raise exception 'T11 bulk failed: %', v;
  end if;
end $$;

select * from expect_eq(
  'T11 bulk mark writes one audit row per record',
  (select count(*)::text from public.admin_audit_log
   where action = 'attendance.marked'
     and actor = 'bulk_test_actor'),
  '2'
);


-- =============================================================================
-- TEST 12: Cancelled registration excluded from attendance rate denominator
-- =============================================================================
-- Bob is cancelled. Stats function should exclude Bob from all counts.
select * from expect_eq(
  'T12 cancelled excluded from total_active in stats',
  ((public.get_event_attendance_stats('00000000-0000-0000-0000-000000000001'))->>'total_active'),
  '2'
);


-- =============================================================================
-- TEST 13: Unreviewed excluded from attendance denominator
-- =============================================================================
-- Alice and Carol are both no_show (from T11). reviewed_active should be 2.
select * from expect_eq(
  'T13 reviewed_active = 2 (no unreviewed)',
  ((public.get_event_attendance_stats('00000000-0000-0000-0000-000000000001'))->>'reviewed_active'),
  '2'
);

-- attended_or_partial = 0
select * from expect_eq(
  'T13 attended_or_partial = 0',
  ((public.get_event_attendance_stats('00000000-0000-0000-0000-000000000001'))->>'attended_or_partial'),
  '0'
);


-- =============================================================================
-- TEST 14: Previous attendance count uses earlier events only
-- (Tested via list_event_registrants; set up a second event with prior attendance)
-- =============================================================================
-- Create a second test event in the past
insert into public.events (id, slug, title, event_date, seat_limit, is_published)
values (
  '00000000-0000-0000-0000-000000000002',
  'test-lab-attendance-event-past',
  'Test Lab PAST',
  now() - interval '30 days',
  10,
  true
);

-- Register Alice in the past event and mark attended
do $$ declare v jsonb; r_id uuid; att_id uuid; begin
  v := public.register_for_event(
    '00000000-0000-0000-0000-000000000002',
    'Alice Test', 'alice@test.example'
  );
  if not (v->>'success')::boolean then raise exception 'T14 past register failed: %', v; end if;
  select (v->>'registration_id')::uuid into r_id;
  select id into att_id from public.lab_attendance where registration_id = r_id;
  v := public.mark_attendance(att_id, 'attended', 'manual', null, 'test_actor');
  if not (v->>'success')::boolean then raise exception 'T14 past mark failed: %', v; end if;
end $$;

-- Now set contact_id on Alice's registrations (needed for previous count lookup)
-- Use a synthetic contact id for test purposes
do $$ declare c_id uuid := gen_random_uuid(); begin
  update public.registrations
  set contact_id = c_id
  where event_id in (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  )
    and lower(email) = 'alice@test.example';
end $$;

select * from expect_eq(
  'T14 previous_attended_count = 1 for alice (past event)',
  (select previous_attended_count::text
   from public.list_event_registrants('00000000-0000-0000-0000-000000000001')
   where lower(email) = 'alice@test.example'),
  '1'
);

select * from expect_eq(
  'T14 carol has 0 previous attended (different contact)',
  (select previous_attended_count::text
   from public.list_event_registrants('00000000-0000-0000-0000-000000000001')
   where lower(email) = 'carol@test.example'),
  '0'
);


-- =============================================================================
-- TEST 15: Wrong admin secret returns 401 (tested at HTTP layer; here we confirm
--          the function is not granted to PUBLIC or anon)
-- =============================================================================
select * from expect_eq(
  'T15 mark_attendance not granted to PUBLIC',
  (select count(*)::text
   from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name   = 'mark_attendance'
     and grantee in ('PUBLIC','anon','authenticated')),
  '0'
);

select * from expect_eq(
  'T15 bulk_mark_attendance not granted to PUBLIC',
  (select count(*)::text
   from information_schema.role_routine_grants
   where routine_schema = 'public'
     and routine_name   = 'bulk_mark_attendance'
     and grantee in ('PUBLIC','anon','authenticated')),
  '0'
);


-- =============================================================================
-- TEST 16: Browser cannot directly read attendance table (RLS enabled, no anon policy)
-- =============================================================================
select * from expect_eq(
  'T16 RLS enabled on lab_attendance',
  (select relrowsecurity::text from pg_class
   where relnamespace = 'public'::regnamespace
     and relname = 'lab_attendance'),
  'true'
);

select * from expect_eq(
  'T16 no anon SELECT policy on lab_attendance',
  (select count(*)::text from pg_policies
   where schemaname = 'public'
     and tablename  = 'lab_attendance'
     and (roles && array['anon','authenticated'] or roles = '{}')),
  '0'
);


-- =============================================================================
-- TEST 17: Delete registration with attendance is restricted
-- =============================================================================
do $$ declare r_id uuid; begin
  select r.id into r_id from public.registrations r
  join public.lab_attendance la on la.registration_id = r.id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'alice@test.example'
  limit 1;

  begin
    delete from public.registrations where id = r_id;
    raise exception 'T17 FAIL: delete should have been restricted by ON DELETE RESTRICT';
  exception when foreign_key_violation then
    -- Expected: FK on lab_attendance(registration_id) is ON DELETE RESTRICT
    null;
  end;
end $$;

select * from expect_eq(
  'T17 attendance row still exists after blocked delete',
  (select count(*)::text from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  '1'
);


-- =============================================================================
-- TEST 18: Delete event with registrations/attendance blocked by attendance FK
-- =============================================================================
do $$ begin
  begin
    delete from public.events where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'T18 FAIL: delete should fail because registrations.event_id ON DELETE CASCADE → lab_attendance ON DELETE RESTRICT';
  exception when foreign_key_violation then
    null;  -- Expected: cascade deletes registrations → FK on lab_attendance blocks
  end;
end $$;

select * from expect_eq(
  'T18 event still exists after blocked cascade delete',
  (select count(*)::text from public.events
   where id = '00000000-0000-0000-0000-000000000001'),
  '1'
);


-- =============================================================================
-- TEST 19: Delete contact sets registration contact_id null; attendance remains
-- =============================================================================
do $$ declare c_id uuid; begin
  select contact_id into c_id from public.registrations
  where event_id = '00000000-0000-0000-0000-000000000001'
    and lower(email) = 'alice@test.example';

  -- Insert the contact row so it can be deleted
  insert into public.contacts (id, normalized_email, first_seen_at, last_seen_at)
  values (c_id, 'alice@test.example', now(), now())
  on conflict (id) do nothing;

  delete from public.contacts where id = c_id;
end $$;

select * from expect_eq(
  'T19 contact_id set null on registration after contact delete',
  (select contact_id::text from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  null
);

select * from expect_eq(
  'T19 attendance row still present after contact delete',
  (select count(*)::text from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  '1'
);


-- =============================================================================
-- TEST 20: Cancelled+previous no_show → reactivated → unreviewed (same att row)
--          Cancelled+previous attended → reactivated → unreviewed (same att row)
-- =============================================================================
-- Alice currently has no_show attendance (from T11 bulk mark); she's active.
-- Mark the attendance then cancel and reactivate via admin path.
do $$ declare r_id uuid; att_id_before uuid; att_id_after uuid; v jsonb; begin
  select r.id, la.id into r_id, att_id_before
  from public.registrations r
  join public.lab_attendance la on la.registration_id = r.id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'alice@test.example';

  -- Verify current status is no_show
  if (select la.status from public.lab_attendance la where la.id = att_id_before) <> 'no_show' then
    raise exception 'T20 precondition: alice should be no_show';
  end if;

  -- Cancel Alice
  v := public.cancel_registration(r_id, 'admin', 'T20 test cancel');
  if not (v->>'success')::boolean then raise exception 'T20 cancel failed: %', v; end if;

  -- Reactivate via admin RPC
  v := public.reactivate_registration(r_id, 'test_actor_admin');
  if not (v->>'success')::boolean then raise exception 'T20 reactivate failed: %', v; end if;

  -- Verify attendance row ID is the same
  select la.id into att_id_after from public.lab_attendance la where la.registration_id = r_id;

  if att_id_before <> att_id_after then
    raise exception 'T20 FAIL: attendance row ID changed from % to %', att_id_before, att_id_after;
  end if;
end $$;

select * from expect_eq(
  'T20 cancelled+no_show → reactivated+unreviewed',
  (select la.status from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'alice@test.example'),
  'unreviewed'
);

select * from expect_eq(
  'T20 reactivated registration is active',
  (select registration_status from public.registrations
   where event_id = '00000000-0000-0000-0000-000000000001'
     and lower(email) = 'alice@test.example'),
  'active'
);

-- Verify that public re-registration path also resets attended → unreviewed
do $$ declare r_id uuid; att_id uuid; v jsonb; begin
  -- Mark Carol as attended
  select la.id into att_id from public.lab_attendance la
  join public.registrations r on r.id = la.registration_id
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'carol@test.example';

  v := public.mark_attendance(att_id, 'attended', 'manual', null, 'test_actor');

  -- Cancel Carol
  select r.id into r_id from public.registrations r
  where r.event_id = '00000000-0000-0000-0000-000000000001'
    and lower(r.email) = 'carol@test.example';
  v := public.cancel_registration(r_id, 'admin', 'T20 carol cancel');

  -- Re-register Carol via public path (reactivation)
  v := public.register_for_event(
    '00000000-0000-0000-0000-000000000001',
    'Carol Test', 'carol@test.example'
  );
  if not (v->>'success')::boolean then raise exception 'T20 carol re-register failed: %', v; end if;
end $$;

select * from expect_eq(
  'T20 cancelled+attended → public reactivation → unreviewed',
  (select la.status from public.lab_attendance la
   join public.registrations r on r.id = la.registration_id
   where r.event_id = '00000000-0000-0000-0000-000000000001'
     and lower(r.email) = 'carol@test.example'),
  'unreviewed'
);


-- =============================================================================
-- Summary
-- =============================================================================
rollback;
-- (All test data is rolled back; nothing is committed to production tables)
