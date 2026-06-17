-- =============================================================================
-- Phase 1B: Unified contact identity
-- =============================================================================
--
-- Creates one contacts row per normalised email address, linking all funnel
-- sources (registrations, participants, subscribers, whatsapp_requests,
-- contact_messages, immersion_applications, lab_interest, email_contacts).
--
-- email_contacts is unchanged — it remains the email-subscription/consent
-- table.  contacts is the identity layer only.
--
-- Safe to re-run:
--   CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--   ON CONFLICT ... DO UPDATE (idempotent reconciling upsert)
--   DROP TRIGGER IF EXISTS before CREATE TRIGGER
--   DO $$ blocks guard FK constraints by name
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SECTION 1 — contacts table
-- ---------------------------------------------------------------------------

create table if not exists public.contacts (
  id               uuid        not null default gen_random_uuid() primary key,
  normalized_email text        not null,
  email            text        not null,
  full_name        text,
  first_name       text,
  last_name        text,
  -- first_seen_at / last_seen_at have no DEFAULT so every caller must supply
  -- the source row's own created_at — never silently using migration time.
  first_seen_at    timestamptz not null,
  last_seen_at     timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint contacts_normalized_email_key unique (normalized_email),

  -- Belt-and-suspenders: upsert_contact always normalises, but guard here
  -- so direct inserts cannot store a malformed key.
  constraint contacts_normalized_email_format check (
    normalized_email = lower(trim(normalized_email))
    and length(normalized_email) > 0
  )
);

create index if not exists contacts_last_seen_at_idx
  on public.contacts (last_seen_at);

-- RLS: no public policies — all access is via service-role Edge Functions
-- or SECURITY DEFINER trigger functions.
alter table public.contacts enable row level security;


-- ---------------------------------------------------------------------------
-- SECTION 2 — contact_id columns, named FKs, and indexes on source tables
--
-- Pattern for each table:
--   1. ADD COLUMN IF NOT EXISTS (idempotent DDL)
--   2. DO $$ block checks pg_constraint by name, adds FK if missing
--   3. CREATE INDEX IF NOT EXISTS (partial, WHERE contact_id IS NOT NULL)
-- ---------------------------------------------------------------------------

-- registrations
alter table public.registrations
  add column if not exists contact_id uuid;

do $fk_registrations$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'registrations_contact_id_fkey'
      and conrelid   = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_registrations$;

create index if not exists idx_registrations_contact_id
  on public.registrations (contact_id)
  where contact_id is not null;

-- participants
alter table public.participants
  add column if not exists contact_id uuid;

do $fk_participants$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'participants_contact_id_fkey'
      and conrelid   = 'public.participants'::regclass
  ) then
    alter table public.participants
      add constraint participants_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_participants$;

create index if not exists idx_participants_contact_id
  on public.participants (contact_id)
  where contact_id is not null;

-- subscribers
alter table public.subscribers
  add column if not exists contact_id uuid;

do $fk_subscribers$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'subscribers_contact_id_fkey'
      and conrelid   = 'public.subscribers'::regclass
  ) then
    alter table public.subscribers
      add constraint subscribers_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_subscribers$;

create index if not exists idx_subscribers_contact_id
  on public.subscribers (contact_id)
  where contact_id is not null;

-- whatsapp_requests
alter table public.whatsapp_requests
  add column if not exists contact_id uuid;

do $fk_whatsapp$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'whatsapp_requests_contact_id_fkey'
      and conrelid   = 'public.whatsapp_requests'::regclass
  ) then
    alter table public.whatsapp_requests
      add constraint whatsapp_requests_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_whatsapp$;

create index if not exists idx_whatsapp_requests_contact_id
  on public.whatsapp_requests (contact_id)
  where contact_id is not null;

-- contact_messages
alter table public.contact_messages
  add column if not exists contact_id uuid;

do $fk_contact_messages$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'contact_messages_contact_id_fkey'
      and conrelid   = 'public.contact_messages'::regclass
  ) then
    alter table public.contact_messages
      add constraint contact_messages_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_contact_messages$;

create index if not exists idx_contact_messages_contact_id
  on public.contact_messages (contact_id)
  where contact_id is not null;

-- immersion_applications
alter table public.immersion_applications
  add column if not exists contact_id uuid;

do $fk_immersion_applications$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'immersion_applications_contact_id_fkey'
      and conrelid   = 'public.immersion_applications'::regclass
  ) then
    alter table public.immersion_applications
      add constraint immersion_applications_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_immersion_applications$;

create index if not exists idx_immersion_applications_contact_id
  on public.immersion_applications (contact_id)
  where contact_id is not null;

-- lab_interest
alter table public.lab_interest
  add column if not exists contact_id uuid;

do $fk_lab_interest$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'lab_interest_contact_id_fkey'
      and conrelid   = 'public.lab_interest'::regclass
  ) then
    alter table public.lab_interest
      add constraint lab_interest_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_lab_interest$;

create index if not exists idx_lab_interest_contact_id
  on public.lab_interest (contact_id)
  where contact_id is not null;

-- email_contacts
alter table public.email_contacts
  add column if not exists contact_id uuid;

do $fk_email_contacts$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname    = 'email_contacts_contact_id_fkey'
      and conrelid   = 'public.email_contacts'::regclass
  ) then
    alter table public.email_contacts
      add constraint email_contacts_contact_id_fkey
        foreign key (contact_id)
        references public.contacts(id)
        on delete set null;
  end if;
end;
$fk_email_contacts$;

create index if not exists idx_email_contacts_contact_id
  on public.email_contacts (contact_id)
  where contact_id is not null;


-- ---------------------------------------------------------------------------
-- SECTION 3 — contact_name_score() helper
--
-- Pure deterministic ranking of name quality.  Called from upsert_contact
-- and from the backfill ON CONFLICT DO UPDATE expression.
--
-- Ranking (lower = better):
--   1 — explicit first_name AND last_name
--   2 — multi-word full_name (contains a space)
--   3 — first_name only
--   4 — single-word full_name
--   5 — nothing usable
-- ---------------------------------------------------------------------------

create or replace function public.contact_name_score(
  p_full_name  text,
  p_first_name text,
  p_last_name  text
) returns int
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when nullif(trim(p_first_name), '') is not null
     and nullif(trim(p_last_name),  '') is not null then 1
    when nullif(trim(p_full_name),  '') is not null
     and trim(p_full_name) like '% %'               then 2
    when nullif(trim(p_first_name), '') is not null  then 3
    when nullif(trim(p_full_name),  '') is not null  then 4
    else 5
  end;
$$;

revoke all on function public.contact_name_score(text, text, text) from public;
revoke all on function public.contact_name_score(text, text, text) from anon;
revoke all on function public.contact_name_score(text, text, text) from authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 4 — upsert_contact()
--
-- The single authoritative writer for the contacts table.
-- Called only from SECURITY DEFINER trigger functions — never exposed as RPC.
--
-- Behaviour:
--   • Normalises email; returns NULL and raises EXCEPTION if email is blank.
--   • Derives full_name from split fields when p_full_name is NULL and at
--     least one split field is present.
--   • On conflict: advances last_seen_at, retreats first_seen_at, replaces
--     the complete name set (all three fields together) only when the
--     incoming name score is strictly better than the existing one.
--   • p_seen_at is required — no default — callers must pass the source
--     row's own created_at, never now().
-- ---------------------------------------------------------------------------

create or replace function public.upsert_contact(
  p_email      text,
  p_full_name  text,
  p_first_name text,
  p_last_name  text,
  p_seen_at    timestamptz
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_norm           text;
  v_full_name      text;
  v_first_name     text;
  v_last_name      text;
  v_incoming_score int;
  v_existing_score int;
  v_contact_id     uuid;
  v_ex_full        text;
  v_ex_first       text;
  v_ex_last        text;
begin
  -- Guard: null or blank email
  if p_email is null or nullif(trim(p_email), '') is null then
    raise exception '[upsert_contact] email must not be null or blank';
  end if;

  -- Guard: seen_at must be supplied
  if p_seen_at is null then
    raise exception '[upsert_contact] p_seen_at must not be null for email=%', p_email;
  end if;

  v_norm := lower(trim(p_email));

  -- Normalise name fields
  v_full_name  := nullif(trim(p_full_name),  '');
  v_first_name := nullif(trim(p_first_name), '');
  v_last_name  := nullif(trim(p_last_name),  '');

  -- For split-name sources (participants, whatsapp_requests): derive full_name
  -- when the caller passes p_full_name = NULL but has first or last name.
  if v_full_name is null and (v_first_name is not null or v_last_name is not null) then
    v_full_name := nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '');
  end if;

  v_incoming_score := public.contact_name_score(v_full_name, v_first_name, v_last_name);

  -- Step 1: upsert — always reconcile time bounds.
  -- Name fields are NOT set here on conflict; they are handled in step 2
  -- after fetching the existing scores, keeping all three fields coherent.
  insert into public.contacts (
    normalized_email, email, full_name, first_name, last_name,
    first_seen_at, last_seen_at
  ) values (
    v_norm, trim(p_email), v_full_name, v_first_name, v_last_name,
    p_seen_at, p_seen_at
  )
  on conflict (normalized_email) do update set
    first_seen_at = least(public.contacts.first_seen_at, excluded.first_seen_at),
    last_seen_at  = greatest(public.contacts.last_seen_at, excluded.last_seen_at)
  returning id into v_contact_id;

  -- Step 2: conditionally improve the name set.
  -- Fetch existing name fields to compute the existing score.
  select full_name, first_name, last_name
  into   v_ex_full, v_ex_first, v_ex_last
  from   public.contacts
  where  id = v_contact_id;

  v_existing_score := public.contact_name_score(v_ex_full, v_ex_first, v_ex_last);

  -- Replace all three name fields together, only when strictly better.
  -- Never mix fields from different source rows.
  if v_incoming_score < v_existing_score then
    update public.contacts
    set
      full_name  = v_full_name,
      first_name = v_first_name,
      last_name  = v_last_name
    where id = v_contact_id;
  end if;

  return v_contact_id;
end;
$$;

revoke all on function public.upsert_contact(text, text, text, text, timestamptz) from public;
revoke all on function public.upsert_contact(text, text, text, text, timestamptz) from anon;
revoke all on function public.upsert_contact(text, text, text, text, timestamptz) from authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 5 — update_contacts_updated_at()
--
-- Only fires when a meaningful field actually changes.  Routine upserts that
-- produce identical time bounds and do not improve the name will not advance
-- updated_at.
-- ---------------------------------------------------------------------------

create or replace function public.update_contacts_updated_at()
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

revoke all on function public.update_contacts_updated_at() from public;
revoke all on function public.update_contacts_updated_at() from anon;
revoke all on function public.update_contacts_updated_at() from authenticated;

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row
  when (
    old.normalized_email is distinct from new.normalized_email
    or old.email         is distinct from new.email
    or old.full_name     is distinct from new.full_name
    or old.first_name    is distinct from new.first_name
    or old.last_name     is distinct from new.last_name
    or old.first_seen_at is distinct from new.first_seen_at
    or old.last_seen_at  is distinct from new.last_seen_at
  )
  execute function public.update_contacts_updated_at();


-- ---------------------------------------------------------------------------
-- SECTION 6 — Historical backfill: INSERT INTO contacts
--
-- Union of all eight source tables.  Each row contributes one candidate with:
--   • normalized_email
--   • trimmed display email
--   • name fields (derived where split)
--   • name_score
--   • seen_at (source row's own created_at — never now())
--
-- Aggregation per normalized_email:
--   • first_seen_at = MIN(seen_at)
--   • last_seen_at  = MAX(seen_at)
--   • display email = from the earliest-seen row
--   • name set      = from the best-scored row (ties: earliest seen_at)
--
-- ON CONFLICT DO UPDATE makes reruns safely reconciling rather than no-ops:
--   • time bounds expand if new rows were added between runs
--   • name upgrades if a better source is now present
--   • existing good name is never overwritten by equal or worse incoming
-- ---------------------------------------------------------------------------

with
sources as (

  -- registrations: single name field, multiple rows per email
  select
    lower(trim(email))                              as normalized_email,
    trim(email)                                     as email,
    nullif(trim(name), '')                          as full_name,
    null::text                                      as first_name,
    null::text                                      as last_name,
    created_at                                      as seen_at
  from public.registrations
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- participants: split first_name / last_name, UNIQUE email
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(concat_ws(' ',
      nullif(trim(first_name), ''),
      nullif(trim(last_name),  '')
    )), ''),
    nullif(trim(first_name), ''),
    nullif(trim(last_name),  ''),
    created_at
  from public.participants
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- subscribers: full_name only, UNIQUE email
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(full_name), ''),
    null,
    null,
    created_at
  from public.subscribers
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- whatsapp_requests: split first_name / last_name, email nullable
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(concat_ws(' ',
      nullif(trim(first_name), ''),
      nullif(trim(last_name),  '')
    )), ''),
    nullif(trim(first_name), ''),
    nullif(trim(last_name),  ''),
    created_at
  from public.whatsapp_requests
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- contact_messages: single name field, multiple rows per email
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(name), ''),
    null,
    null,
    created_at
  from public.contact_messages
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- immersion_applications: single name field, multiple rows per email
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(name), ''),
    null,
    null,
    created_at
  from public.immersion_applications
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- lab_interest: no name columns; created_at is nullable (no NOT NULL)
  select
    lower(trim(email)),
    trim(email),
    null::text,
    null::text,
    null::text,
    coalesce(created_at, now())
  from public.lab_interest
  where email is not null and nullif(trim(email), '') is not null

  union all

  -- email_contacts: full_name + first_name (no last_name column)
  select
    lower(trim(email)),
    trim(email),
    nullif(trim(full_name), ''),
    nullif(trim(first_name), ''),
    null::text,
    created_at
  from public.email_contacts
  where email is not null and nullif(trim(email), '') is not null
),

-- Add name score to every candidate row
scored as (
  select
    normalized_email,
    email,
    full_name,
    first_name,
    last_name,
    seen_at,
    public.contact_name_score(full_name, first_name, last_name) as name_score
  from sources
),

-- Best-scoring name set per email (tiebreak: earliest seen_at)
best_names as (
  select distinct on (normalized_email)
    normalized_email,
    full_name,
    first_name,
    last_name
  from scored
  where name_score < 5
  order by normalized_email, name_score asc, seen_at asc
),

-- Display email from earliest-seen row per email
earliest_email as (
  select distinct on (normalized_email)
    normalized_email,
    email
  from scored
  order by normalized_email, seen_at asc
),

-- Aggregate time bounds
time_bounds as (
  select
    normalized_email,
    min(seen_at) as first_seen_at,
    max(seen_at) as last_seen_at
  from scored
  group by normalized_email
)

insert into public.contacts (
  normalized_email, email,
  full_name, first_name, last_name,
  first_seen_at, last_seen_at
)
select
  tb.normalized_email,
  ee.email,
  bn.full_name,
  bn.first_name,
  bn.last_name,
  tb.first_seen_at,
  tb.last_seen_at
from time_bounds    tb
join earliest_email ee on ee.normalized_email = tb.normalized_email
left join best_names bn on bn.normalized_email = tb.normalized_email
on conflict (normalized_email) do update set
  -- Time bounds: always take the wider range
  first_seen_at = least(contacts.first_seen_at, excluded.first_seen_at),
  last_seen_at  = greatest(contacts.last_seen_at, excluded.last_seen_at),
  -- Name: replace all three fields together only when incoming is strictly better
  full_name  = case
    when public.contact_name_score(
           excluded.full_name, excluded.first_name, excluded.last_name)
       < public.contact_name_score(
           contacts.full_name, contacts.first_name, contacts.last_name)
    then excluded.full_name
    else contacts.full_name
  end,
  first_name = case
    when public.contact_name_score(
           excluded.full_name, excluded.first_name, excluded.last_name)
       < public.contact_name_score(
           contacts.full_name, contacts.first_name, contacts.last_name)
    then excluded.first_name
    else contacts.first_name
  end,
  last_name  = case
    when public.contact_name_score(
           excluded.full_name, excluded.first_name, excluded.last_name)
       < public.contact_name_score(
           contacts.full_name, contacts.first_name, contacts.last_name)
    then excluded.last_name
    else contacts.last_name
  end;


-- ---------------------------------------------------------------------------
-- SECTION 7 — Backfill contact_id on source tables
--
-- WHERE contact_id IS NULL makes these UPDATE statements idempotent.
-- Only unlinked rows are touched.  Already-linked rows are not re-evaluated.
--
-- Triggers are not yet installed, so these UPDATEs do not fire the
-- sync_contact trigger functions.
-- ---------------------------------------------------------------------------

update public.registrations r
set    contact_id = c.id
from   public.contacts c
where  lower(trim(r.email)) = c.normalized_email
  and  r.contact_id is null;

update public.participants p
set    contact_id = c.id
from   public.contacts c
where  lower(trim(p.email)) = c.normalized_email
  and  p.contact_id is null;

update public.subscribers s
set    contact_id = c.id
from   public.contacts c
where  lower(trim(s.email)) = c.normalized_email
  and  s.contact_id is null;

update public.whatsapp_requests w
set    contact_id = c.id
from   public.contacts c
where  w.email is not null
  and  lower(trim(w.email)) = c.normalized_email
  and  w.contact_id is null;

update public.contact_messages m
set    contact_id = c.id
from   public.contacts c
where  lower(trim(m.email)) = c.normalized_email
  and  m.contact_id is null;

update public.immersion_applications a
set    contact_id = c.id
from   public.contacts c
where  lower(trim(a.email)) = c.normalized_email
  and  a.contact_id is null;

update public.lab_interest li
set    contact_id = c.id
from   public.contacts c
where  lower(trim(li.email)) = c.normalized_email
  and  li.contact_id is null;

update public.email_contacts ec
set    contact_id = c.id
from   public.contacts c
where  lower(trim(ec.email)) = c.normalized_email
  and  ec.contact_id is null;


-- ---------------------------------------------------------------------------
-- SECTION 8 — Trigger functions
--
-- One function per source table.  Both the INSERT and UPDATE trigger for
-- that table call the same function.
--
-- Security:
--   • SECURITY DEFINER — runs as function owner (postgres), not session role
--   • SET search_path = pg_catalog, public — prevents search-path injection
--   • REVOKE from PUBLIC, anon, authenticated — not callable as RPC
--   • Trigger invocation bypasses EXECUTE grants entirely (engine calls the
--     function as the function owner via trigger binding)
--
-- Failure mode:
--   • upsert_contact raises EXCEPTION on bad input (blank email, null seen_at)
--   • Any exception propagates and rolls back the parent transaction
--   • No silent failures; no orphaned source rows with null contact_id
-- ---------------------------------------------------------------------------

-- registrations (name field)
create or replace function public.sync_contact_on_registrations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    new.name,   -- full_name source for this table
    null,
    null,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_registrations() from public;
revoke all on function public.sync_contact_on_registrations() from anon;
revoke all on function public.sync_contact_on_registrations() from authenticated;

-- participants (split first_name / last_name; upsert_contact derives full_name)
create or replace function public.sync_contact_on_participants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    null,
    new.first_name,
    new.last_name,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_participants() from public;
revoke all on function public.sync_contact_on_participants() from anon;
revoke all on function public.sync_contact_on_participants() from authenticated;

-- subscribers (full_name field)
create or replace function public.sync_contact_on_subscribers()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    new.full_name,
    null,
    null,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_subscribers() from public;
revoke all on function public.sync_contact_on_subscribers() from anon;
revoke all on function public.sync_contact_on_subscribers() from authenticated;

-- whatsapp_requests (split first_name / last_name, email nullable)
create or replace function public.sync_contact_on_whatsapp_requests()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- email is nullable; skip if absent
  if new.email is null or nullif(trim(new.email), '') is null then
    return new;
  end if;
  new.contact_id := public.upsert_contact(
    new.email,
    null,
    new.first_name,
    new.last_name,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_whatsapp_requests() from public;
revoke all on function public.sync_contact_on_whatsapp_requests() from anon;
revoke all on function public.sync_contact_on_whatsapp_requests() from authenticated;

-- contact_messages (name field)
create or replace function public.sync_contact_on_contact_messages()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    new.name,
    null,
    null,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_contact_messages() from public;
revoke all on function public.sync_contact_on_contact_messages() from anon;
revoke all on function public.sync_contact_on_contact_messages() from authenticated;

-- immersion_applications (name field)
create or replace function public.sync_contact_on_immersion_applications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    new.name,
    null,
    null,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_immersion_applications() from public;
revoke all on function public.sync_contact_on_immersion_applications() from anon;
revoke all on function public.sync_contact_on_immersion_applications() from authenticated;

-- lab_interest (no name columns; created_at is nullable)
create or replace function public.sync_contact_on_lab_interest()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    null,
    null,
    null,
    coalesce(new.created_at, now())
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_lab_interest() from public;
revoke all on function public.sync_contact_on_lab_interest() from anon;
revoke all on function public.sync_contact_on_lab_interest() from authenticated;

-- email_contacts (full_name + first_name; no last_name column)
create or replace function public.sync_contact_on_email_contacts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.contact_id := public.upsert_contact(
    new.email,
    new.full_name,
    new.first_name,
    null,
    new.created_at
  );
  return new;
end;
$$;
revoke all on function public.sync_contact_on_email_contacts() from public;
revoke all on function public.sync_contact_on_email_contacts() from anon;
revoke all on function public.sync_contact_on_email_contacts() from authenticated;


-- ---------------------------------------------------------------------------
-- SECTION 9 — Install triggers (after backfill)
--
-- Each source table gets two triggers sharing one function:
--   _insert : BEFORE INSERT — fires on every new row
--   _update : BEFORE UPDATE OF <identity-cols> FOR EACH ROW
--             WHEN (IS DISTINCT FROM comparison) — fires only when an
--             identity field genuinely changes value
--
-- This means:
--   • reminder timestamp updates do NOT fire
--   • status / consent / delivery field updates do NOT fire
--   • contact_id backfill UPDATEs do NOT fire (not in UPDATE OF list)
--   • only a real email or name change triggers a contact sync
--
-- Existing triggers on these tables are unaffected:
--   registrations_sync_email_contact (AFTER INSERT OR UPDATE) — still fires
--   email_contacts_set_updated_at    (BEFORE UPDATE)          — still fires
-- ---------------------------------------------------------------------------

-- registrations
drop trigger if exists sync_contact_on_registrations_insert on public.registrations;
create trigger sync_contact_on_registrations_insert
  before insert on public.registrations
  for each row
  execute function public.sync_contact_on_registrations();

drop trigger if exists sync_contact_on_registrations_update on public.registrations;
create trigger sync_contact_on_registrations_update
  before update of email, name on public.registrations
  for each row
  when (
    old.email is distinct from new.email
    or old.name is distinct from new.name
  )
  execute function public.sync_contact_on_registrations();

-- participants
drop trigger if exists sync_contact_on_participants_insert on public.participants;
create trigger sync_contact_on_participants_insert
  before insert on public.participants
  for each row
  execute function public.sync_contact_on_participants();

drop trigger if exists sync_contact_on_participants_update on public.participants;
create trigger sync_contact_on_participants_update
  before update of email, first_name, last_name on public.participants
  for each row
  when (
    old.email      is distinct from new.email
    or old.first_name is distinct from new.first_name
    or old.last_name  is distinct from new.last_name
  )
  execute function public.sync_contact_on_participants();

-- subscribers
drop trigger if exists sync_contact_on_subscribers_insert on public.subscribers;
create trigger sync_contact_on_subscribers_insert
  before insert on public.subscribers
  for each row
  execute function public.sync_contact_on_subscribers();

drop trigger if exists sync_contact_on_subscribers_update on public.subscribers;
create trigger sync_contact_on_subscribers_update
  before update of email, full_name on public.subscribers
  for each row
  when (
    old.email     is distinct from new.email
    or old.full_name is distinct from new.full_name
  )
  execute function public.sync_contact_on_subscribers();

-- whatsapp_requests
drop trigger if exists sync_contact_on_whatsapp_requests_insert on public.whatsapp_requests;
create trigger sync_contact_on_whatsapp_requests_insert
  before insert on public.whatsapp_requests
  for each row
  execute function public.sync_contact_on_whatsapp_requests();

drop trigger if exists sync_contact_on_whatsapp_requests_update on public.whatsapp_requests;
create trigger sync_contact_on_whatsapp_requests_update
  before update of email, first_name, last_name on public.whatsapp_requests
  for each row
  when (
    old.email      is distinct from new.email
    or old.first_name is distinct from new.first_name
    or old.last_name  is distinct from new.last_name
  )
  execute function public.sync_contact_on_whatsapp_requests();

-- contact_messages
drop trigger if exists sync_contact_on_contact_messages_insert on public.contact_messages;
create trigger sync_contact_on_contact_messages_insert
  before insert on public.contact_messages
  for each row
  execute function public.sync_contact_on_contact_messages();

drop trigger if exists sync_contact_on_contact_messages_update on public.contact_messages;
create trigger sync_contact_on_contact_messages_update
  before update of email, name on public.contact_messages
  for each row
  when (
    old.email is distinct from new.email
    or old.name is distinct from new.name
  )
  execute function public.sync_contact_on_contact_messages();

-- immersion_applications
drop trigger if exists sync_contact_on_immersion_applications_insert on public.immersion_applications;
create trigger sync_contact_on_immersion_applications_insert
  before insert on public.immersion_applications
  for each row
  execute function public.sync_contact_on_immersion_applications();

drop trigger if exists sync_contact_on_immersion_applications_update on public.immersion_applications;
create trigger sync_contact_on_immersion_applications_update
  before update of email, name on public.immersion_applications
  for each row
  when (
    old.email is distinct from new.email
    or old.name is distinct from new.name
  )
  execute function public.sync_contact_on_immersion_applications();

-- lab_interest
drop trigger if exists sync_contact_on_lab_interest_insert on public.lab_interest;
create trigger sync_contact_on_lab_interest_insert
  before insert on public.lab_interest
  for each row
  execute function public.sync_contact_on_lab_interest();

drop trigger if exists sync_contact_on_lab_interest_update on public.lab_interest;
create trigger sync_contact_on_lab_interest_update
  before update of email on public.lab_interest
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_contact_on_lab_interest();

-- email_contacts
-- Note: the AFTER trigger registrations_sync_email_contact (on registrations)
-- does ON CONFLICT DO UPDATE SET full_name = COALESCE(existing, new).
-- Our WHEN condition (OLD.full_name IS DISTINCT FROM NEW.full_name) ensures
-- the contact trigger fires only when full_name actually changes — not on
-- every registration sync that preserves the existing value.
drop trigger if exists sync_contact_on_email_contacts_insert on public.email_contacts;
create trigger sync_contact_on_email_contacts_insert
  before insert on public.email_contacts
  for each row
  execute function public.sync_contact_on_email_contacts();

drop trigger if exists sync_contact_on_email_contacts_update on public.email_contacts;
create trigger sync_contact_on_email_contacts_update
  before update of email, full_name, first_name on public.email_contacts
  for each row
  when (
    old.email      is distinct from new.email
    or old.full_name  is distinct from new.full_name
    or old.first_name is distinct from new.first_name
  )
  execute function public.sync_contact_on_email_contacts();


-- ---------------------------------------------------------------------------
-- SECTION 10 — Diagnostic verification
--
-- Returns counts per source table for quick post-migration sanity check.
-- All queries are read-only.
-- ---------------------------------------------------------------------------

select
  'contacts_total'           as metric,
  count(*)::text             as value
from public.contacts

union all

select 'registrations_linked',
  count(*)::text
from public.registrations
where contact_id is not null

union all

select 'registrations_unlinked',
  count(*)::text
from public.registrations
where contact_id is null

union all

select 'participants_linked',
  count(*)::text
from public.participants
where contact_id is not null

union all

select 'participants_unlinked',
  count(*)::text
from public.participants
where contact_id is null

union all

select 'subscribers_linked',
  count(*)::text
from public.subscribers
where contact_id is not null

union all

select 'subscribers_unlinked',
  count(*)::text
from public.subscribers
where contact_id is null

union all

select 'whatsapp_with_email_linked',
  count(*)::text
from public.whatsapp_requests
where email is not null and contact_id is not null

union all

select 'whatsapp_with_email_unlinked',
  count(*)::text
from public.whatsapp_requests
where email is not null and contact_id is null

union all

select 'contact_messages_linked',
  count(*)::text
from public.contact_messages
where contact_id is not null

union all

select 'contact_messages_unlinked',
  count(*)::text
from public.contact_messages
where contact_id is null

union all

select 'immersion_applications_linked',
  count(*)::text
from public.immersion_applications
where contact_id is not null

union all

select 'immersion_applications_unlinked',
  count(*)::text
from public.immersion_applications
where contact_id is null

union all

select 'lab_interest_linked',
  count(*)::text
from public.lab_interest
where contact_id is not null

union all

select 'lab_interest_unlinked',
  count(*)::text
from public.lab_interest
where contact_id is null

union all

select 'email_contacts_linked',
  count(*)::text
from public.email_contacts
where contact_id is not null

union all

select 'email_contacts_unlinked',
  count(*)::text
from public.email_contacts
where contact_id is null

order by metric;
