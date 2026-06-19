-- =============================================================================
-- Migration 20260619000000: whatsapp_link_clicks
-- =============================================================================
--
-- Tracks every visit to /join-whatsapp so we can measure which UTM sources
-- drive WhatsApp community joins.
--
-- Written by the join-whatsapp Edge Function (service role).
-- No anon/authenticated read policy — only service role sees these rows.
-- =============================================================================

create table if not exists public.whatsapp_link_clicks (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null    default now(),
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  referrer     text,
  user_agent   text,
  ip_address   text
);

-- Only the service role (Edge Function) may read or write this table.
alter table public.whatsapp_link_clicks enable row level security;

-- Index for dashboard queries grouping by campaign
create index if not exists idx_whatsapp_link_clicks_utm_campaign
  on public.whatsapp_link_clicks (utm_campaign);

create index if not exists idx_whatsapp_link_clicks_created_at
  on public.whatsapp_link_clicks (created_at);
