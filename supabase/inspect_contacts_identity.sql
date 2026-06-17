-- =============================================================================
-- Contact identity verification — read-only
-- Run in Supabase SQL Editor after applying 20260617000001_contacts_identity.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Total contacts vs distinct normalised emails across all sources
-- ---------------------------------------------------------------------------
select
  'contacts_rows'           as label,
  count(*)                  as n
from public.contacts

union all

select
  'distinct_normalised_emails_across_all_sources',
  count(distinct ne) as n
from (
  select lower(trim(email)) as ne from public.registrations         where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.participants          where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.subscribers           where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.whatsapp_requests     where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.contact_messages      where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.immersion_applications where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.lab_interest           where email is not null and trim(email) <> ''
  union all
  select lower(trim(email))        from public.email_contacts         where email is not null and trim(email) <> ''
) src
order by label;


-- ---------------------------------------------------------------------------
-- 2. Duplicate normalised_email rows in contacts (should return 0 rows)
-- ---------------------------------------------------------------------------
select
  normalized_email,
  count(*) as occurrences
from public.contacts
group by normalized_email
having count(*) > 1
order by occurrences desc;


-- ---------------------------------------------------------------------------
-- 3. Unmatched source rows by table (contact_id IS NULL after backfill)
-- ---------------------------------------------------------------------------
select
  'registrations'           as source_table,
  count(*)                  as unlinked_rows
from public.registrations
where contact_id is null

union all

select 'participants',         count(*) from public.participants         where contact_id is null
union all
select 'subscribers',          count(*) from public.subscribers          where contact_id is null
union all
select 'whatsapp_with_email',  count(*) from public.whatsapp_requests    where email is not null and contact_id is null
union all
select 'contact_messages',     count(*) from public.contact_messages     where contact_id is null
union all
select 'immersion_applications', count(*) from public.immersion_applications where contact_id is null
union all
select 'lab_interest',         count(*) from public.lab_interest         where contact_id is null
union all
select 'email_contacts',       count(*) from public.email_contacts       where contact_id is null

order by source_table;


-- ---------------------------------------------------------------------------
-- 4. Source rows whose contact_id points to the wrong normalised email
--    (should return 0 rows per table)
-- ---------------------------------------------------------------------------
select 'registrations' as source_table, r.id as source_id, r.email, c.normalized_email
from public.registrations r
join public.contacts c on c.id = r.contact_id
where lower(trim(r.email)) <> c.normalized_email

union all

select 'participants', p.id, p.email, c.normalized_email
from public.participants p
join public.contacts c on c.id = p.contact_id
where lower(trim(p.email)) <> c.normalized_email

union all

select 'subscribers', s.id, s.email, c.normalized_email
from public.subscribers s
join public.contacts c on c.id = s.contact_id
where lower(trim(s.email)) <> c.normalized_email

union all

select 'whatsapp_requests', w.id, w.email, c.normalized_email
from public.whatsapp_requests w
join public.contacts c on c.id = w.contact_id
where w.email is not null and lower(trim(w.email)) <> c.normalized_email

union all

select 'contact_messages', m.id, m.email, c.normalized_email
from public.contact_messages m
join public.contacts c on c.id = m.contact_id
where lower(trim(m.email)) <> c.normalized_email

union all

select 'immersion_applications', a.id, a.email, c.normalized_email
from public.immersion_applications a
join public.contacts c on c.id = a.contact_id
where lower(trim(a.email)) <> c.normalized_email

union all

select 'lab_interest', li.id, li.email, c.normalized_email
from public.lab_interest li
join public.contacts c on c.id = li.contact_id
where lower(trim(li.email)) <> c.normalized_email

union all

select 'email_contacts', ec.id, ec.email, c.normalized_email
from public.email_contacts ec
join public.contacts c on c.id = ec.contact_id
where lower(trim(ec.email)) <> c.normalized_email

order by source_table;


-- ---------------------------------------------------------------------------
-- 5. Contacts where first_seen_at > last_seen_at (should return 0 rows)
-- ---------------------------------------------------------------------------
select id, normalized_email, first_seen_at, last_seen_at
from public.contacts
where first_seen_at > last_seen_at
order by normalized_email;


-- ---------------------------------------------------------------------------
-- 6. Blank or malformed normalised emails (should return 0 rows)
--    The CHECK constraint prevents these, but verify explicitly.
-- ---------------------------------------------------------------------------
select id, normalized_email, email
from public.contacts
where
  normalized_email is null
  or length(normalized_email) = 0
  or normalized_email <> lower(trim(normalized_email))
order by normalized_email;


-- ---------------------------------------------------------------------------
-- 7. Name quality distribution across contacts
-- ---------------------------------------------------------------------------
select
  case
    when first_name is not null and last_name is not null then '1 first+last'
    when full_name  is not null and full_name like '% %'  then '2 multi-word full_name'
    when first_name is not null                           then '3 first only'
    when full_name  is not null                           then '4 single-word full_name'
    else                                                       '5 no name'
  end as name_quality,
  count(*) as contacts
from public.contacts
group by 1
order by 1;


-- ---------------------------------------------------------------------------
-- 8. Contacts grouped by number of connected source tables (funnel breadth)
-- ---------------------------------------------------------------------------
with source_counts as (
  select
    c.id,
    c.normalized_email,
    (case when r.contact_id  is not null then 1 else 0 end
   + case when p.contact_id  is not null then 1 else 0 end
   + case when s.contact_id  is not null then 1 else 0 end
   + case when w.contact_id  is not null then 1 else 0 end
   + case when m.contact_id  is not null then 1 else 0 end
   + case when a.contact_id  is not null then 1 else 0 end
   + case when li.contact_id is not null then 1 else 0 end
   + case when ec.contact_id is not null then 1 else 0 end
    ) as source_table_count
  from public.contacts c
  left join (select distinct contact_id from public.registrations         where contact_id is not null) r  on r.contact_id  = c.id
  left join (select distinct contact_id from public.participants          where contact_id is not null) p  on p.contact_id  = c.id
  left join (select distinct contact_id from public.subscribers           where contact_id is not null) s  on s.contact_id  = c.id
  left join (select distinct contact_id from public.whatsapp_requests     where contact_id is not null) w  on w.contact_id  = c.id
  left join (select distinct contact_id from public.contact_messages      where contact_id is not null) m  on m.contact_id  = c.id
  left join (select distinct contact_id from public.immersion_applications where contact_id is not null) a on a.contact_id  = c.id
  left join (select distinct contact_id from public.lab_interest          where contact_id is not null) li on li.contact_id = c.id
  left join (select distinct contact_id from public.email_contacts        where contact_id is not null) ec on ec.contact_id = c.id
)
select
  source_table_count  as appears_in_n_tables,
  count(*)            as contacts
from source_counts
group by source_table_count
order by source_table_count desc;


-- ---------------------------------------------------------------------------
-- 9. Example contacts appearing in 3 or more source tables
-- ---------------------------------------------------------------------------
with source_flags as (
  select
    c.id,
    c.normalized_email,
    c.full_name,
    c.first_seen_at,
    c.last_seen_at,
    (select count(*) > 0 from public.registrations          where contact_id = c.id)::int as in_registrations,
    (select count(*) > 0 from public.participants           where contact_id = c.id)::int as in_participants,
    (select count(*) > 0 from public.subscribers            where contact_id = c.id)::int as in_subscribers,
    (select count(*) > 0 from public.whatsapp_requests      where contact_id = c.id)::int as in_whatsapp,
    (select count(*) > 0 from public.contact_messages       where contact_id = c.id)::int as in_contact_messages,
    (select count(*) > 0 from public.immersion_applications where contact_id = c.id)::int as in_immersions,
    (select count(*) > 0 from public.lab_interest           where contact_id = c.id)::int as in_lab_interest,
    (select count(*) > 0 from public.email_contacts         where contact_id = c.id)::int as in_email_contacts
  from public.contacts c
)
select
  normalized_email,
  full_name,
  first_seen_at,
  last_seen_at,
  in_registrations,
  in_participants,
  in_subscribers,
  in_whatsapp,
  in_contact_messages,
  in_immersions,
  in_lab_interest,
  in_email_contacts,
  ( in_registrations + in_participants + in_subscribers + in_whatsapp
  + in_contact_messages + in_immersions + in_lab_interest + in_email_contacts
  ) as total_sources
from source_flags
where
  ( in_registrations + in_participants + in_subscribers + in_whatsapp
  + in_contact_messages + in_immersions + in_lab_interest + in_email_contacts
  ) >= 3
order by total_sources desc, first_seen_at asc
limit 20;


-- ---------------------------------------------------------------------------
-- 10. Trigger inventory — confirm all contact sync triggers are installed
-- ---------------------------------------------------------------------------
select
  event_object_table  as table_name,
  trigger_name,
  event_manipulation  as event,
  action_timing       as timing
from information_schema.triggers
where trigger_name like 'sync_contact_%'
   or trigger_name = 'contacts_set_updated_at'
order by event_object_table, trigger_name;
