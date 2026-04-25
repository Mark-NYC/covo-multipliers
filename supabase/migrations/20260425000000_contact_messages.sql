-- Migration: contact_messages
-- Stores every legitimate contact form submission before/after email dispatch.

create table if not exists contact_messages (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null    default now(),
  name               text        not null,
  email              text        not null,
  topic              text        not null,
  message            text        not null,
  user_agent         text,
  ip_address         text,
  resend_message_id  text,
  send_status        text        not null    default 'pending',
  error_message      text
);

-- Only the service role (edge function) may read or write this table.
alter table contact_messages enable row level security;

-- No public policies — all access goes through the service-role key in the edge function.
