-- Lab interest capture: notify visitors when next batch of labs is posted.

create table if not exists lab_interest (
  id               uuid        primary key default gen_random_uuid(),
  email            text        not null unique,
  created_at       timestamptz default now(),
  last_notified_at timestamptz
);

alter table lab_interest enable row level security;

-- Public can submit an email address
create policy "anon_insert"
  on lab_interest
  for insert
  to anon
  with check (true);

-- No select policy for anon — public cannot read the table.
-- Service role bypasses RLS and can read/update freely.
