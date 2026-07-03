-- Rework substack_metrics / substack_posts to only store data Substack's
-- public API actually exposes.
--
-- views / clicks / subscriber_count were always written as 0/NULL — Substack
-- does not expose page views, clicks, or subscriber counts through its
-- public /api/v1/posts endpoint (those live behind an authenticated owner
-- dashboard). Web pageviews for Substack posts are tracked separately via
-- the GA4 panel instead. Dropping the dead columns and adding restacks
-- (a real public field) plus post categorization metadata.

ALTER TABLE substack_metrics DROP COLUMN IF EXISTS views;
ALTER TABLE substack_metrics DROP COLUMN IF EXISTS clicks;
ALTER TABLE substack_metrics DROP COLUMN IF EXISTS subscriber_count;
ALTER TABLE substack_metrics ADD COLUMN IF NOT EXISTS restacks INTEGER DEFAULT 0;

ALTER TABLE substack_posts ADD COLUMN IF NOT EXISTS post_type TEXT;
ALTER TABLE substack_posts ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE substack_posts ADD COLUMN IF NOT EXISTS tags TEXT[];
