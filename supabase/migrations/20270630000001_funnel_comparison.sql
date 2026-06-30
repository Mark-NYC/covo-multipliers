-- supabase/migrations/20270630000001_funnel_comparison.sql
--
-- get_funnel_comparison: returns key metrics for the current period and the
-- immediately-preceding period of equal length, so the frontend can render
-- "vs prior period" delta badges.

CREATE OR REPLACE FUNCTION public.get_funnel_comparison(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH
  prior_start AS (SELECT p_start - (p_end - p_start) AS v),

  -- ── Current period ─────────────────────────────────────────────────────────
  cur_contacts AS (
    SELECT COUNT(*)::int AS n FROM contacts
    WHERE first_seen_at >= p_start AND first_seen_at < p_end
  ),
  cur_regs AS (
    SELECT COUNT(*)::int AS n FROM registrations
    WHERE created_at >= p_start AND created_at < p_end
      AND registration_status = 'active'
  ),
  cur_att AS (
    SELECT
      COUNT(*) FILTER (WHERE la.status IN ('attended','partial')) AS attended,
      COUNT(*) FILTER (WHERE la.status = 'no_show')              AS no_show
    FROM events e
    JOIN registrations r  ON r.event_id = e.id AND r.registration_status = 'active'
    JOIN lab_attendance la ON la.registration_id = r.id
    WHERE e.event_date >= p_start AND e.event_date < p_end
      AND la.status IN ('attended','partial','no_show')
  ),
  cur_assess AS (
    SELECT COUNT(*)::int AS n FROM assessment_sessions
    WHERE status IN ('submitted','scored')
      AND submitted_at >= p_start AND submitted_at < p_end
  ),

  -- ── Prior period ────────────────────────────────────────────────────────────
  pri_contacts AS (
    SELECT COUNT(*)::int AS n FROM contacts
    WHERE first_seen_at >= (SELECT v FROM prior_start) AND first_seen_at < p_start
  ),
  pri_regs AS (
    SELECT COUNT(*)::int AS n FROM registrations
    WHERE created_at >= (SELECT v FROM prior_start) AND created_at < p_start
      AND registration_status = 'active'
  ),
  pri_att AS (
    SELECT
      COUNT(*) FILTER (WHERE la.status IN ('attended','partial')) AS attended,
      COUNT(*) FILTER (WHERE la.status = 'no_show')              AS no_show
    FROM events e
    JOIN registrations r  ON r.event_id = e.id AND r.registration_status = 'active'
    JOIN lab_attendance la ON la.registration_id = r.id
    WHERE e.event_date >= (SELECT v FROM prior_start) AND e.event_date < p_start
      AND la.status IN ('attended','partial','no_show')
  ),
  pri_assess AS (
    SELECT COUNT(*)::int AS n FROM assessment_sessions
    WHERE status IN ('submitted','scored')
      AND submitted_at >= (SELECT v FROM prior_start) AND submitted_at < p_start
  )

SELECT jsonb_build_object(
  'current', jsonb_build_object(
    'new_contacts',           (SELECT n FROM cur_contacts),
    'active_regs',            (SELECT n FROM cur_regs),
    'attendance_rate',        CASE
      WHEN (SELECT attended + no_show FROM cur_att) = 0 THEN NULL
      ELSE ROUND((SELECT attended FROM cur_att)::numeric /
                 (SELECT attended + no_show FROM cur_att)::numeric * 100, 1) END,
    'assessment_completions', (SELECT n FROM cur_assess)
  ),
  'prior', jsonb_build_object(
    'new_contacts',           (SELECT n FROM pri_contacts),
    'active_regs',            (SELECT n FROM pri_regs),
    'attendance_rate',        CASE
      WHEN (SELECT attended + no_show FROM pri_att) = 0 THEN NULL
      ELSE ROUND((SELECT attended FROM pri_att)::numeric /
                 (SELECT attended + no_show FROM pri_att)::numeric * 100, 1) END,
    'assessment_completions', (SELECT n FROM pri_assess)
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_funnel_comparison(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_comparison(timestamptz, timestamptz) TO service_role;
