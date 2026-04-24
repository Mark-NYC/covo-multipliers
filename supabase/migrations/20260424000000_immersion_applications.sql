-- =============================================================================
-- Immersion Applications Migration
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists immersions (
  id                uuid        primary key default gen_random_uuid(),
  slug              text        unique not null,
  title             text        not null,
  city              text,
  location_summary  text,
  start_date        timestamptz,
  end_date          timestamptz,
  format            text,
  platform_focus    text,
  capacity          integer     not null,
  status            text        not null default 'open',
  created_at        timestamptz not null default now()
);

create table if not exists immersion_applications (
  id                    uuid        primary key default gen_random_uuid(),
  immersion_id          uuid        not null references immersions(id) on delete restrict,
  name                  text        not null,
  email                 text        not null,
  phone                 text,
  city_state            text,
  church_org            text,
  team_status           text,
  team_size             integer,
  why_coming            text,
  hoping_to_learn       text,
  prior_training        text,
  lodging_acknowledged  boolean     not null default false,
  -- status values: submitted | approved | declined | waitlisted | cancelled
  status                text        not null default 'submitted',
  created_at            timestamptz not null default now(),
  confirmation_sent_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

create index if not exists idx_immersions_slug
  on immersions (slug);

create index if not exists idx_immersions_status
  on immersions (status);

create index if not exists idx_immersion_applications_immersion_id
  on immersion_applications (immersion_id);

create index if not exists idx_immersion_applications_status
  on immersion_applications (status);

create index if not exists idx_immersion_applications_email
  on immersion_applications (email);

create index if not exists idx_immersion_applications_immersion_status
  on immersion_applications (immersion_id, status);

-- ---------------------------------------------------------------------------
-- 3. View: immersions_with_availability
-- ---------------------------------------------------------------------------
-- seats_remaining = capacity minus ALL applications regardless of status.
-- Deleting a declined/cancelled row in Supabase restores the seat.

create or replace view immersions_with_availability as
select
  i.*,
  coalesce(stats.application_count, 0)                    as application_count,
  i.capacity - coalesce(stats.application_count, 0)       as seats_remaining,
  (i.capacity - coalesce(stats.application_count, 0)) > 0 as has_availability
from immersions i
left join (
  select
    immersion_id,
    count(*) as application_count
  from immersion_applications
  group by immersion_id
) stats on stats.immersion_id = i.id;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

alter table immersions enable row level security;
alter table immersion_applications enable row level security;

-- immersions: public read-only
create policy "public_read_immersions"
  on immersions for select
  to anon, authenticated
  using (true);

-- immersion_applications: no public access at all
-- Inserts happen only via Edge Function using the service role key,
-- which bypasses RLS. No anon/authenticated policies are needed here.

-- Authenticated users (admins) can read all applications.
-- Scope this further with a role/claim check once you add admin auth.
create policy "authenticated_read_applications"
  on immersion_applications for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5. Sample data (3 immersions — edit dates, cities, and details as needed)
-- ---------------------------------------------------------------------------

insert into immersions
  (slug, title, city, location_summary, start_date, end_date, format, platform_focus, capacity, status)
values
  (
    'chicago-businesses-2026',
    'Covo Immersion — Chicago (Businesses)',
    'Chicago',
    'Downtown Chicago | Host location TBD',
    '2026-09-18 08:00:00+00',
    '2026-09-20 17:00:00+00',
    'In-person, 3-day intensive',
    'Businesses',
    24,
    'open'
  ),
  (
    'dallas-workplaces-2026',
    'Covo Immersion — Dallas (Workplaces)',
    'Dallas',
    'Dallas-Fort Worth area | Host location TBD',
    '2026-10-09 08:00:00+00',
    '2026-10-11 17:00:00+00',
    'In-person, 3-day intensive',
    'Workplaces',
    24,
    'open'
  ),
  (
    'los-angeles-nonprofits-2026',
    'Covo Immersion — Los Angeles (Nonprofit / Community Centers)',
    'Los Angeles',
    'Los Angeles area | Host location TBD',
    '2026-11-06 08:00:00+00',
    '2026-11-08 17:00:00+00',
    'In-person, 3-day intensive',
    'Nonprofit / Community Centers',
    24,
    'open'
  )
on conflict (slug) do nothing;
