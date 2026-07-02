-- =============================================================================
-- Migration 20270701000000: Daily Substack metrics sync cron job
-- =============================================================================
--
-- Schedules the substack-sync edge function to fire once a day at 13:00 UTC
-- (9 am EST / 8 am EDT), writing one substack_metrics snapshot row per post
-- per day so the admin dashboard can build a real engagement trend over time.
--
-- pg_cron and pg_net are enabled by default on Supabase hosted projects.
--
-- ONE-TIME SETUP REQUIRED before running this migration:
-- Store the ADMIN_ANALYTICS_SECRET value (same secret already used by the
-- ga4-admin / analytics-admin / substack-sync edge functions) in Supabase
-- Vault so the cron job can read it without committing it to source control.
-- Run this once in the Supabase SQL editor (replace the value with the
-- actual ADMIN_ANALYTICS_SECRET):
--
--   SELECT vault.create_secret('your-secret-here', 'admin_analytics_secret');
--
-- After running that, apply this migration normally.
-- =============================================================================

-- Unschedule any previous version of this job before (re)creating it so this
-- migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-substack-sync') THEN
    PERFORM cron.unschedule('daily-substack-sync');
  END IF;
END;
$$;

SELECT cron.schedule(
  'daily-substack-sync',
  '0 13 * * *',   -- Daily 13:00 UTC = 9 am EST (8 am EDT in summer)
  $$
  SELECT net.http_post(
    url     := 'https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/substack-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-admin-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'admin_analytics_secret'
        LIMIT 1
      )
    ),
    body    := jsonb_build_object(
      'action', 'sync_posts',
      'publication_id', 'multiplyingdisciples'
    )
  );
  $$
);
