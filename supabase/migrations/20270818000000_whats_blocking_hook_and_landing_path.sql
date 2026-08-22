-- =============================================================================
-- Backfill hook + landing_path for the November 2026 lab
-- (What's Holding Back Your Disciple-Making?)
-- =============================================================================
--
-- The hook/landing_path columns were added by 20270704000000_labs_public_feed.sql,
-- which also backfilled every lab that existed at the time. This lab's own
-- insert (20261118000000_whats_blocking_disciple_making_event.sql) runs BEFORE
-- those columns exist, so it could not set them, and it was created after the
-- 20270704 backfill listed its labs — so it slipped through with both fields
-- NULL.
--
-- With landing_path NULL, the public-labs feed falls back to the
-- /#upcoming-labs anchor, so this lab's card on the homepage and its "Page"
-- link on the /labs planner both point at the anchor instead of the lab's own
-- page. With hook NULL, consumers fall back to the full description, so the
-- homepage card shows the entire paragraph as the subtitle instead of a short
-- one-liner.
--
-- Setting both here fixes both: the card/planner links resolve to the lab page,
-- and the hook becomes the short subtitle while the description moves to the
-- card's description line. Safe to re-run.
-- =============================================================================

update public.events set
  hook = 'Pinpoint what''s holding back your disciple-making and choose one step to take this week.',
  landing_path = '/whats-blocking-your-disciple-making.html'
where slug = 'whats-blocking-your-disciple-making-november-2026';
