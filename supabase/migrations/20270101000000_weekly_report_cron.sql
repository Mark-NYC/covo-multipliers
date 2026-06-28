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
-- Store your REMINDER_ADMIN_SECRET in Supabase Vault so the cron job can read
-- it without it being committed to source control. Run this once in the
-- Supabase SQL editor (replace the value with your actual secret):
--
--   SELECT vault.create_secret('your-secret-here', 'reminder_admin_secret');
--
-- After running that, apply this migration normally.
-- =============================================================================


-- Unschedule any previous version of this job before (re)creating it so this
-- migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-lab-report') THEN
    PERFORM cron.unschedule('weekly-lab-report');
  END IF;
END;
$$;

SELECT cron.schedule(
  'weekly-lab-report',
  '0 12 * * 1',   -- Monday 12:00 UTC = 7 am EST (8 am EDT in summer)
  $$
  SELECT net.http_post(
    url     := 'https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-admin-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'reminder_admin_secret'
        LIMIT 1
      )
    ),
    body    := '{}'::jsonb
  );
  $$
);
