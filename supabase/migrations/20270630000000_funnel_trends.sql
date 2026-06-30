-- supabase/migrations/20270630000000_funnel_trends.sql
--
-- get_funnel_trends: weekly (or monthly) time-series data for the trends chart.
-- Returns one row per bucket covering: new contacts, new registrations,
-- attendance rate, and assessment starts — enough to draw all four trend lines.

CREATE OR REPLACE FUNCTION public.get_funnel_trends(
  p_start  timestamptz,
  p_end    timestamptz,
  p_bucket text DEFAULT 'week'   -- 'week' or 'month'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH
  buckets AS (
    SELECT date_trunc(p_bucket, gs)::date AS bucket_start
    FROM generate_series(
      date_trunc(p_bucket, p_start),
      date_trunc(p_bucket, p_end - interval '1 second'),
      ('1 ' || p_bucket)::interval
    ) gs
  ),

  contacts_by_bucket AS (
    SELECT
      date_trunc(p_bucket, c.first_seen_at)::date AS bucket_start,
      COUNT(*) AS new_contacts
    FROM contacts c
    WHERE c.first_seen_at >= p_start AND c.first_seen_at < p_end
    GROUP BY 1
  ),

  regs_by_bucket AS (
    SELECT
      date_trunc(p_bucket, r.created_at)::date AS bucket_start,
      COUNT(*) FILTER (WHERE r.registration_status = 'active') AS active_regs
    FROM registrations r
    WHERE r.created_at >= p_start AND r.created_at < p_end
    GROUP BY 1
  ),

  attendance_by_bucket AS (
    SELECT
      date_trunc(p_bucket, e.event_date)::date AS bucket_start,
      COUNT(*) FILTER (WHERE la.status IN ('attended','partial'))                   AS attended,
      COUNT(*) FILTER (WHERE la.status = 'no_show')                                AS no_show
    FROM events e
    JOIN registrations r  ON r.event_id = e.id AND r.registration_status = 'active'
    JOIN lab_attendance la ON la.registration_id = r.id
    WHERE e.event_date >= p_start AND e.event_date < p_end
      AND la.status IN ('attended','partial','no_show')
    GROUP BY 1
  ),

  assessments_by_bucket AS (
    SELECT
      date_trunc(p_bucket, s.started_at)::date AS bucket_start,
      COUNT(*) AS started
    FROM assessment_sessions s
    WHERE s.started_at >= p_start AND s.started_at < p_end
    GROUP BY 1
  )

SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'bucket',               b.bucket_start,
    'new_contacts',         COALESCE(co.new_contacts, 0),
    'active_regs',          COALESCE(rb.active_regs, 0),
    'attended',             COALESCE(ab.attended, 0),
    'no_show',              COALESCE(ab.no_show, 0),
    'attendance_rate',      CASE
                              WHEN COALESCE(ab.attended, 0) + COALESCE(ab.no_show, 0) = 0 THEN NULL
                              ELSE ROUND(
                                COALESCE(ab.attended, 0)::numeric /
                                (COALESCE(ab.attended, 0) + COALESCE(ab.no_show, 0))::numeric * 100, 1)
                            END,
    'assessments_started',  COALESCE(ases.started, 0)
  )
  ORDER BY b.bucket_start
), '[]'::jsonb)
FROM buckets b
LEFT JOIN contacts_by_bucket    co   ON co.bucket_start   = b.bucket_start
LEFT JOIN regs_by_bucket        rb   ON rb.bucket_start   = b.bucket_start
LEFT JOIN attendance_by_bucket  ab   ON ab.bucket_start   = b.bucket_start
LEFT JOIN assessments_by_bucket ases ON ases.bucket_start = b.bucket_start;
$$;

REVOKE ALL ON FUNCTION public.get_funnel_trends(timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_trends(timestamptz, timestamptz, text) TO service_role;
