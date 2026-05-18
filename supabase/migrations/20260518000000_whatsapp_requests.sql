-- Migration: whatsapp_requests
-- Stores WhatsApp group join requests submitted via the landing page.

create table if not exists whatsapp_requests (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  first_name   text        not null,
  last_name    text,
  phone        text        not null,
  email        text,
  city         text,
  church_org   text,
  lab_attended text,
  consent      boolean     not null    default true,
  ip_address   text,
  user_agent   text
);

-- Only the service role (edge function) may read or write this table.
alter table whatsapp_requests enable row level security;
