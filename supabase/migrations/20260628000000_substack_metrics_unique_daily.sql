-- Add a DATE column for daily deduplication of metrics snapshots.
-- The existing metric_date is a timestamptz which can't serve as a unique day key.
ALTER TABLE substack_metrics ADD COLUMN IF NOT EXISTS metric_day DATE;

-- Backfill from existing rows
UPDATE substack_metrics SET metric_day = metric_date::DATE WHERE metric_day IS NULL;

-- Add unique constraint so upsert works
ALTER TABLE substack_metrics
  ADD CONSTRAINT substack_metrics_post_day_unique UNIQUE (post_id, metric_day);
