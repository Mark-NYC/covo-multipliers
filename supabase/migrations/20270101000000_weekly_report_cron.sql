-- =============================================================================
-- Migration 20270101000000: Weekly lab report cron job
-- =============================================================================
--
-- Schedules the weekly-report edge function to fire every Monday at 12:00 UTC
-- (7 am EST / 8 am EDT — note it shifts 1 hr in summer with daylight saving).
--
-- pg_cron and pg_net are enabled by default on Supabase hosted projects.
--
-- ONE-TIME SETUP REQUIRED before running this migration:
-- Store your REMINDER_ADMIN_SECRET in the database so the cron job can read it
-- without it being committed to source control. Run this once in the Supabase
-- SQL editor (replace the value with your actual secret):
--
--   ALTER DATABASE postgres SET app.reminder_admin_secret = 'your-secret-here';
--
-- After running that, apply this migration normally.
-- =============================================================================


-- Unschedule any previous version of this job before (re)creating it so this
-- migration is idempotent.
SELECT cron.unschedule('weekly-lab-report')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-lab-report'
);

SELECT cron.schedule(
  'weekly-lab-report',
  '0 12 * * 1',   -- Monday 12:00 UTC = 7 am EST (8 am EDT in summer)
  $$
  SELECT net.http_post(
    url     := 'https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-admin-secret', current_setting('app.reminder_admin_secret', true)
    ),
    body    := '{}'::jsonb
  );
  $$
);
