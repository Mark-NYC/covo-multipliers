-- =============================================================================
-- Reconcile email_contacts and registration consent columns
-- =============================================================================
--
-- These objects exist in the live database but were never added to the
-- repository migration history.  This migration documents them so that
-- any new environment (staging, local dev) can reproduce the live schema.
--
-- Safe to apply against the live database:
--   • CREATE TABLE IF NOT EXISTS   — no-op if table already exists
--   • CREATE INDEX IF NOT EXISTS   — no-op if index already exists
--   • ADD COLUMN IF NOT EXISTS     — no-op if column already exists
--   • CREATE OR REPLACE FUNCTION   — replaces in-place, no data loss
--   • DROP TRIGGER IF EXISTS       — only used immediately before
--                                    CREATE TRIGGER to ensure definition
--                                    matches exactly
--
-- Live data preserved:
--   • 73 existing email_contacts rows
--   • 80 existing registrations rows
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1.  email_contacts table
--
--     Purpose: email subscription and consent management.
--     One row per normalised email address.
--     Not a general contacts/identity table — that is a future phase.
--
--     status values:
--       pending      — person is known but has not given explicit consent
--       subscribed   — explicit opt-in recorded; consent_at is set
--       unsubscribed — previously subscribed, now opted out
--       bounced      — hard bounce from email provider; do not email
--       complained   — spam complaint; do not email
-- ---------------------------------------------------------------------------
create table if not exists public.email_contacts (
  id                  uuid        primary key default gen_random_uuid(),
  email               text        not null,
  full_name           text,
  first_name          text,
  status              text        not null default 'pending',
  origin_source       text        not null default 'manual',
  consent_source      text,
  consent_at          timestamptz,
  consent_copy        text,
  unsubscribed_at     timestamptz,
  last_registration_at timestamptz,
  resend_contact_id   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unique email (normalised lower-case enforced by trigger function)
create unique index if not exists email_contacts_email_unique
  on public.email_contacts (email);

-- Unique resend_contact_id, but only when it is not null
create unique index if not exists email_contacts_resend_contact_id_unique
  on public.email_contacts (resend_contact_id)
  where resend_contact_id is not null;

-- Status lookup index used by admin queries and sync function
create index if not exists email_contacts_status_idx
  on public.email_contacts (status);

-- RLS: enabled, no browser-facing policies.
-- All reads and writes go through service-role Edge Functions.
alter table public.email_contacts enable row level security;


-- ---------------------------------------------------------------------------
-- 2.  updated_at trigger function for email_contacts
-- ---------------------------------------------------------------------------
create or replace function public.update_email_contacts_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop then recreate so the definition is always in sync with this file.
drop trigger if exists email_contacts_set_updated_at on public.email_contacts;

create trigger email_contacts_set_updated_at
  before update on public.email_contacts
  for each row
  execute function public.update_email_contacts_updated_at();


-- ---------------------------------------------------------------------------
-- 3.  Marketing consent columns on registrations
--
--     These three columns exist on the live registrations table but were
--     never committed to the migration history.
--
--     marketing_opt_in        — true only when the person explicitly checked
--                               the opt-in box; never inferred from submission
--     marketing_consent_at    — server-set timestamp; never client-supplied
--     marketing_consent_copy  — the exact consent statement shown to the user
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column if not exists marketing_opt_in       boolean     not null default false,
  add column if not exists marketing_consent_at   timestamptz,
  add column if not exists marketing_consent_copy text;


-- ---------------------------------------------------------------------------
-- 4.  Sync trigger function: registrations → email_contacts
--
--     Fires AFTER INSERT OR UPDATE on registrations.
--
--     On every fire it upserts email_contacts so the record exists.
--     On UPDATE it advances status to 'subscribed' only when:
--       • NEW.marketing_opt_in is true, AND
--       • the current status is not 'bounced' or 'complained'
--     It never downgrades a subscribed contact to pending.
--     It never clears consent_at or consent_copy once set.
--     It re-subscribes an 'unsubscribed' contact only with explicit consent.
--
--     SECURITY DEFINER + explicit search_path prevents search-path hijacking.
-- ---------------------------------------------------------------------------
create or replace function public.sync_registration_to_email_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalised_email text;
begin
  -- Normalise to lowercase + trimmed whitespace, matching register_for_event().
  v_normalised_email := lower(trim(new.email));

  -- -------------------------------------------------------------------------
  -- Base upsert — ensures a row exists and keeps last_registration_at current.
  -- Does NOT change status, consent_at, or consent_copy on conflict by default.
  -- -------------------------------------------------------------------------
  insert into public.email_contacts (
    email,
    full_name,
    status,
    origin_source,
    last_registration_at,
    created_at,
    updated_at
  )
  values (
    v_normalised_email,
    new.name,
    'pending',
    'lab_registration',
    now(),
    now(),
    now()
  )
  on conflict (email) do update
    set
      -- Update full_name only when the existing record has none.
      full_name            = coalesce(email_contacts.full_name, excluded.full_name),
      last_registration_at = excluded.last_registration_at,
      updated_at           = excluded.updated_at;

  -- -------------------------------------------------------------------------
  -- Consent promotion — only when marketing_opt_in is explicitly true.
  -- Protected statuses (bounced, complained) are never changed.
  -- -------------------------------------------------------------------------
  if new.marketing_opt_in = true then
    update public.email_contacts
    set
      status         = 'subscribed',
      consent_source = 'lab_registration_form',
      consent_at     = coalesce(email_contacts.consent_at, new.marketing_consent_at),
      consent_copy   = coalesce(email_contacts.consent_copy, new.marketing_consent_copy),
      updated_at     = now()
    where email   = v_normalised_email
      and status not in ('bounced', 'complained');
  end if;

  return new;
end;
$$;

-- Drop then recreate so timing, events, and function are always in sync.
drop trigger if exists registrations_sync_email_contact on public.registrations;

create trigger registrations_sync_email_contact
  after insert or update on public.registrations
  for each row
  execute function public.sync_registration_to_email_contact();
