# Substack setup

The integration reads publication posts and stores daily public engagement
snapshots. It does not collect Notes or private owner analytics. The public
Substack endpoint is undocumented and may refuse requests or change shape.
Failures are reported; they are never saved as successful empty collections.

1. In the Covo Supabase SQL Editor, run
   `supabase/migrations/20270703000000_substack_setup_repair.sql`.
   This creates missing tables and columns and preserves existing data. If
   duplicate daily rows exist, it rolls back and asks for reconciliation.
2. Deploy the updated `substack-sync` function. The repository's existing
   GitHub deployment workflow deploys functions on main. Check its result.
3. In Edge Functions > substack-sync > Test, set the `x-admin-secret` header
   to the current ADMIN_ANALYTICS_SECRET value. Do not share the header.
   POST `{"action":"health"}`. Expected: `schema_ready: true`.
4. POST `{"action":"sync_posts","publication_id":"multiplyingdisciples"}`.
   Expected: HTTP 200, `synced` greater than zero, and today's UTC `metric_day`.
   HTTP 403 from Substack or unexpected fields require a different authorized
   source. Do not treat them as successful collection.
5. POST `{"action":"get_metrics","publication_id":"multiplyingdisciples"}`.
   Expected: nonempty `data` containing real post titles and dated snapshots.
6. In Supabase Vault, create or update the secret named
   `admin_analytics_secret` with the same value as ADMIN_ANALYTICS_SECRET.
   Edge Function Secrets and Vault are separate stores. Update both whenever
   rotating the shared key. Do not put the secret in GitHub.
7. Enable Cron and pg_net in Supabase if needed, then run the existing
   `supabase/migrations/20270701000000_substack_sync_cron.sql` to install or
   replace `daily-substack-sync`. It runs daily at 13:00 UTC, which is 9 AM
   during New York daylight saving time and 8 AM during standard time.
8. In Scout, click Sync sources and confirm Substack snapshots is verified.
   Check the actual metric date. A verified read alone does not prove tomorrow's
   scheduled collection will run. Check the next day's function invocation.

Validation: `node --test supabase/functions/substack-sync/core.test.mjs`.

## Google Analytics for publication web traffic

Substack supports GA4 tracking for page views, signups and paid subscriptions.
In Substack Settings > Analytics, save the GA4 web stream Measurement ID
(`G-...`). This is different from a numeric GA4 Property ID.

The existing `ga4-admin` service account is reused. If the publication has a
separate property, grant that service account Viewer access to that property
and set `SUBSTACK_GA4_PROPERTY_ID` in Supabase Edge Function Secrets. If the
publication shares the CoVo property, no additional property secret is needed.

Test `ga4-admin` using the current `x-admin-secret` header and body:
`{"action":"substack_traffic","startDate":"2026-10-01","endDate":"2026-10-01"}`.
Use `substack_events` to inspect the actual event names being recorded.
The reports always filter `multiplyingdisciples.substack.com`, so CoVo
pageviews cannot be mistaken for publication traffic. Tracking can take
24 hours to appear and does not backfill dates before installation.
These are web analytics, not Notes, email opens or Spotify analytics.

These report actions are available on the server. Scout v9 does not yet have
a GA4 report panel or a daily GA4 collector. Connect and verify the property
before adding that dashboard view.

Source: https://support.substack.com/hc/en-us/articles/15955098199444

The repair has no outreach, publishing, email delivery or FirstFix actions.
