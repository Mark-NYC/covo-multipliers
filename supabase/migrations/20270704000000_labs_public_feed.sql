-- =============================================================================
-- Public labs feed: hook + landing_path columns
-- =============================================================================
--
-- Covo Multipliers is meant to be the single source of truth for lab data.
-- Today that data is duplicated by hand in several places with slightly
-- different slugs and copy: index.html's hardcoded LABS array + card
-- markup, embeds/next-lab-widget.html's LAB_CONTENT map (title/hook/URL),
-- and (on the Multiplying Disciples site) a hand-maintained slug -> URL
-- map. Every new lab requires remembering to update all of them.
--
-- This adds the two fields those hand-maintained copies exist only to
-- provide — a short outcome-based hook line, and the lab's own landing
-- page path — directly onto public.events, and exposes them through
-- events_with_availability so the new public-labs Edge Function (see
-- supabase/functions/public-labs) can serve one real source of truth to
-- Covo's own homepage and to any external site.
-- =============================================================================

alter table public.events
  add column if not exists hook text,
  add column if not exists landing_path text;

comment on column public.events.hook is
  'Short, outcome-based one-liner shown under the lab title on cards (e.g. "Learn how ordinary work... became a church-planting platform."). Consumers should fall back to description when this is null.';
comment on column public.events.landing_path is
  'Path, relative to https://www.covomultipliers.com, to this lab''s own page (e.g. "/aquila-and-priscilla-pattern.html"). Consumers should fall back to the /#upcoming-labs anchor when this is null.';

-- Backfill the current lab lineup from the copy already hardcoded in
-- index.html / embeds/next-lab-widget.html, so the new feed has real data
-- from day one instead of nulls. Safe to re-run.
update public.events set
  hook = 'A simple path to help someone follow Jesus this week.',
  landing_path = '/from-lost-to-leader.html'
where slug = 'from-lost-to-leader-may-2026';

update public.events set
  hook = 'Build a weekly rhythm that keeps mission from becoming random.',
  landing_path = '/rhythms-of-a-covo-multiplier.html'
where slug = 'rhythms-of-a-covo-multiplier-jun-2026';

update public.events set
  hook = 'Learn how ordinary work, hospitality, and relationships became a church-planting platform.',
  landing_path = '/aquila-and-priscilla-pattern.html'
where slug = 'aquila-and-priscilla-pattern-jul-2026';

update public.events set
  hook = 'Know who to reach, what to say, and how to help someone take the next step.',
  landing_path = '/4-questions.html'
where slug = '4-questions-to-get-started-august-2026';

update public.events set
  hook = 'A simple biblical map for practicing and multiplying church from Acts 2.',
  landing_path = '/church-circle-lab.html'
where slug = 'church-circle-september-2026';

update public.events set
  hook = 'Stuck at "I really should"? Build a disciple-making rhythm you can actually keep — even with a full life.',
  landing_path = '/disciple-making-rhythm.html'
where slug = 'disciple-making-rhythm-october-2026';

-- Rebuild the view (same active_registration_count-based availability
-- calculation from 20260618000000_fix_availability_view_rls.sql) to also
-- expose the two new columns.
create or replace view public.events_with_availability as
select
  e.id,
  e.slug,
  e.title,
  e.description,
  e.hook,
  e.landing_path,
  e.event_date,
  e.seat_limit,
  greatest(
    e.seat_limit - public.active_registration_count(e.id),
    0
  )        as seats_remaining,
  greatest(
    e.seat_limit - public.active_registration_count(e.id),
    0
  ) > 0   as has_availability
from public.events e
where e.is_published = true;
