-- supabase/migrations/20260617000005_funnel_dashboard.sql
--
-- Phase 3A: Funnel Dashboard Analytics Functions
--
-- 9 SECURITY DEFINER SQL functions for the funnel analytics dashboard.
-- All date filters use half-open intervals: >= p_start AND < p_end
-- Assessment completion = status IN ('submitted','scored') only
--
-- Permissions: service_role only; anon and authenticated are revoked.

-- =============================================================================
-- FUNCTION 1: get_funnel_overview
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_funnel_overview(
  p_start             timestamptz,
  p_end               timestamptz,
  p_utm_source        text    DEFAULT NULL,
  p_utm_medium        text    DEFAULT NULL,
  p_utm_campaign      text    DEFAULT NULL,
  p_attribution_mode  text    DEFAULT 'first_touch',
  p_event_id          uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH
  -- UTM column selection based on attribution mode
  utm_regs AS (
    SELECT
      r.id,
      r.contact_id,
      r.event_id,
      r.registration_status,
      r.created_at,
      CASE WHEN p_attribution_mode = 'latest_touch'
        THEN r.utm_source        ELSE r.first_utm_source   END AS eff_source,
      CASE WHEN p_attribution_mode = 'latest_touch'
        THEN r.utm_medium        ELSE r.first_utm_medium   END AS eff_medium,
      CASE WHEN p_attribution_mode = 'latest_touch'
        THEN r.utm_campaign      ELSE r.first_utm_campaign END AS eff_campaign
    FROM registrations r
    WHERE r.created_at >= p_start AND r.created_at < p_end
      AND (p_utm_source   IS NULL OR
           CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_source        ELSE r.first_utm_source   END = p_utm_source)
      AND (p_utm_medium   IS NULL OR
           CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_medium        ELSE r.first_utm_medium   END = p_utm_medium)
      AND (p_utm_campaign IS NULL OR
           CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_campaign      ELSE r.first_utm_campaign END = p_utm_campaign)
  ),

  -- Events in range (for reviewed/attended/data_completion)
  events_in_range AS (
    SELECT e.id, e.event_date
    FROM events e
    WHERE e.event_date >= p_start AND e.event_date < p_end
      AND (p_event_id IS NULL OR e.id = p_event_id)
  ),

  -- Active registrations for events in range
  active_regs_for_events AS (
    SELECT r.id AS reg_id, r.contact_id, la.status AS att_status
    FROM registrations r
    JOIN events_in_range eir ON r.event_id = eir.id
    LEFT JOIN lab_attendance la ON la.registration_id = r.id
    WHERE r.registration_status = 'active'
  ),

  -- Reviewed (has attendance record and status is not unreviewed)
  reviewed_ct AS (
    SELECT COUNT(*) AS n
    FROM active_regs_for_events
    WHERE att_status IN ('attended','partial','no_show')
  ),

  -- Attendees
  attended_ct AS (
    SELECT COUNT(*) AS n
    FROM active_regs_for_events
    WHERE att_status IN ('attended','partial')
  ),

  -- No show
  no_show_ct AS (
    SELECT COUNT(*) AS n
    FROM active_regs_for_events
    WHERE att_status = 'no_show'
  ),

  -- Total active regs for events in range (denominator for data_completion)
  total_active_for_events AS (
    SELECT COUNT(*) AS n
    FROM active_regs_for_events
  ),

  -- Repeat attendees: contacts with >=2 active regs in events_in_range with attended/partial
  repeat_att AS (
    SELECT COUNT(*) AS n
    FROM (
      SELECT arf.contact_id
      FROM active_regs_for_events arf
      WHERE arf.att_status IN ('attended','partial')
        AND arf.contact_id IS NOT NULL
      GROUP BY arf.contact_id
      HAVING COUNT(*) >= 2
    ) sub
  )

SELECT jsonb_build_object(
  'total_known_contacts',
    (SELECT COUNT(*) FROM contacts),

  'new_contacts',
    (SELECT COUNT(*) FROM contacts c WHERE c.first_seen_at >= p_start AND c.first_seen_at < p_end),

  'active_registrations',
    (SELECT COUNT(*) FROM utm_regs WHERE registration_status = 'active'),

  'cancelled_registrations',
    (SELECT COUNT(*) FROM utm_regs WHERE registration_status = 'cancelled'),

  'reviewed_registrations',
    (SELECT n FROM reviewed_ct),

  'attendees',
    (SELECT n FROM attended_ct),

  'attendance_rate',
    CASE
      WHEN (SELECT n FROM attended_ct) + (SELECT n FROM no_show_ct) = 0 THEN NULL
      ELSE ROUND(
        (SELECT n FROM attended_ct)::numeric /
        ((SELECT n FROM attended_ct) + (SELECT n FROM no_show_ct))::numeric * 100,
        1
      )
    END,

  'data_completion_rate',
    CASE
      WHEN (SELECT n FROM total_active_for_events) = 0 THEN NULL
      ELSE ROUND(
        (SELECT n FROM reviewed_ct)::numeric /
        (SELECT n FROM total_active_for_events)::numeric * 100,
        1
      )
    END,

  'repeat_attendees',
    (SELECT n FROM repeat_att),

  'assessment_completions',
    (SELECT COUNT(*)
     FROM assessment_sessions
     WHERE status IN ('submitted','scored')
       AND submitted_at >= p_start AND submitted_at < p_end),

  'whatsapp_requests',
    (SELECT COUNT(*) FROM whatsapp_requests WHERE created_at >= p_start AND created_at < p_end),

  'active_email_subscribers',
    (SELECT COUNT(*) FROM email_contacts WHERE status = 'subscribed')
);
$$;

REVOKE ALL ON FUNCTION public.get_funnel_overview(timestamptz, timestamptz, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_overview(timestamptz, timestamptz, text, text, text, text, uuid) TO service_role;

-- =============================================================================
-- FUNCTION 2: get_cohort_funnel
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_cohort_funnel(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH
  cohort AS (
    SELECT c.id AS contact_id
    FROM contacts c
    WHERE c.first_seen_at >= p_start AND c.first_seen_at < p_end
  ),

  cohort_count AS (
    SELECT COUNT(*) AS n FROM cohort
  ),

  -- registered: cohort contacts with >=1 registration (any status), no date filter
  registered AS (
    SELECT COUNT(DISTINCT co.contact_id) AS n
    FROM cohort co
    WHERE EXISTS (
      SELECT 1 FROM registrations r WHERE r.contact_id = co.contact_id
    )
  ),

  -- reviewed: cohort contacts with >=1 active registration where attendance reviewed
  reviewed AS (
    SELECT COUNT(DISTINCT co.contact_id) AS n
    FROM cohort co
    WHERE EXISTS (
      SELECT 1
      FROM registrations r
      JOIN lab_attendance la ON la.registration_id = r.id
      WHERE r.contact_id = co.contact_id
        AND r.registration_status = 'active'
        AND la.status IN ('attended','partial','no_show')
    )
  ),

  -- attended: cohort contacts with >=1 active registration where attended/partial
  attended AS (
    SELECT COUNT(DISTINCT co.contact_id) AS n
    FROM cohort co
    WHERE EXISTS (
      SELECT 1
      FROM registrations r
      JOIN lab_attendance la ON la.registration_id = r.id
      WHERE r.contact_id = co.contact_id
        AND r.registration_status = 'active'
        AND la.status IN ('attended','partial')
    )
  ),

  -- repeat_attendees: cohort contacts with >=2 active regs with attended/partial
  repeat_att AS (
    SELECT COUNT(DISTINCT sub.contact_id) AS n
    FROM (
      SELECT r.contact_id
      FROM cohort co
      JOIN registrations r ON r.contact_id = co.contact_id
      JOIN lab_attendance la ON la.registration_id = r.id
      WHERE r.registration_status = 'active'
        AND la.status IN ('attended','partial')
      GROUP BY r.contact_id
      HAVING COUNT(*) >= 2
    ) sub
  )

SELECT jsonb_build_object(
  'label', 'Contacts first seen during the selected period. Downstream progress measured through today.',
  'known_contacts',   (SELECT n FROM cohort_count),
  'registered',       (SELECT n FROM registered),
  'reviewed',         (SELECT n FROM reviewed),
  'attended',         (SELECT n FROM attended),
  'repeat_attendees', (SELECT n FROM repeat_att),
  'rates', jsonb_build_object(
    'registered_rate',
      CASE WHEN (SELECT n FROM cohort_count) = 0 THEN NULL
        ELSE ROUND((SELECT n FROM registered)::numeric / (SELECT n FROM cohort_count)::numeric * 100, 1) END,
    'reviewed_of_registered',
      CASE WHEN (SELECT n FROM registered) = 0 THEN NULL
        ELSE ROUND((SELECT n FROM reviewed)::numeric / (SELECT n FROM registered)::numeric * 100, 1) END,
    'attended_of_reviewed',
      CASE WHEN (SELECT n FROM reviewed) = 0 THEN NULL
        ELSE ROUND((SELECT n FROM attended)::numeric / (SELECT n FROM reviewed)::numeric * 100, 1) END,
    'repeat_of_attended',
      CASE WHEN (SELECT n FROM attended) = 0 THEN NULL
        ELSE ROUND((SELECT n FROM repeat_att)::numeric / (SELECT n FROM attended)::numeric * 100, 1) END
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_cohort_funnel(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohort_funnel(timestamptz, timestamptz) TO service_role;

-- =============================================================================
-- FUNCTION 3: get_funnel_activity
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_funnel_activity(
  p_start             timestamptz,
  p_end               timestamptz,
  p_utm_source        text    DEFAULT NULL,
  p_utm_medium        text    DEFAULT NULL,
  p_utm_campaign      text    DEFAULT NULL,
  p_attribution_mode  text    DEFAULT 'first_touch'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
SELECT jsonb_build_object(
  'new_contacts',
    (SELECT COUNT(*) FROM contacts WHERE first_seen_at >= p_start AND first_seen_at < p_end),

  'active_registrations',
    (SELECT COUNT(*)
     FROM registrations r
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.registration_status = 'active'
       AND (p_utm_source   IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_source        ELSE r.first_utm_source   END = p_utm_source)
       AND (p_utm_medium   IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_medium        ELSE r.first_utm_medium   END = p_utm_medium)
       AND (p_utm_campaign IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_campaign      ELSE r.first_utm_campaign END = p_utm_campaign)
    ),

  'cancelled_registrations',
    (SELECT COUNT(*)
     FROM registrations r
     WHERE r.created_at >= p_start AND r.created_at < p_end
       AND r.registration_status = 'cancelled'
       AND (p_utm_source   IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_source        ELSE r.first_utm_source   END = p_utm_source)
       AND (p_utm_medium   IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_medium        ELSE r.first_utm_medium   END = p_utm_medium)
       AND (p_utm_campaign IS NULL OR
            CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_campaign      ELSE r.first_utm_campaign END = p_utm_campaign)
    ),

  'lab_events_held',
    (SELECT COUNT(*)
     FROM events e
     WHERE e.event_date >= p_start AND e.event_date < p_end
       AND e.is_published = true),

  'assessment_started',
    (SELECT COUNT(*)
     FROM assessment_sessions
     WHERE started_at >= p_start AND started_at < p_end),

  'assessment_completions',
    (SELECT COUNT(*)
     FROM assessment_sessions
     WHERE status IN ('submitted','scored')
       AND submitted_at >= p_start AND submitted_at < p_end),

  'whatsapp_requests',
    (SELECT COUNT(*)
     FROM whatsapp_requests
     WHERE created_at >= p_start AND created_at < p_end)
);
$$;

REVOKE ALL ON FUNCTION public.get_funnel_activity(timestamptz, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_activity(timestamptz, timestamptz, text, text, text, text) TO service_role;

-- =============================================================================
-- FUNCTION 4: get_acquisition_breakdown
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_acquisition_breakdown(
  p_start             timestamptz,
  p_end               timestamptz,
  p_utm_source        text    DEFAULT NULL,
  p_utm_medium        text    DEFAULT NULL,
  p_utm_campaign      text    DEFAULT NULL,
  p_attribution_mode  text    DEFAULT 'first_touch'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH base AS (
  SELECT
    r.registration_status,
    COALESCE(
      NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_source   ELSE r.first_utm_source   END), ''),
      'Direct / unknown'
    ) AS eff_source,
    COALESCE(
      NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_medium   ELSE r.first_utm_medium   END), ''),
      'Direct / unknown'
    ) AS eff_medium,
    COALESCE(
      NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_campaign ELSE r.first_utm_campaign END), ''),
      'Direct / unknown'
    ) AS eff_campaign
  FROM registrations r
  WHERE r.created_at >= p_start AND r.created_at < p_end
    AND (p_utm_source   IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_source        ELSE r.first_utm_source   END),''), 'Direct / unknown') = p_utm_source)
    AND (p_utm_medium   IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_medium        ELSE r.first_utm_medium   END),''), 'Direct / unknown') = p_utm_medium)
    AND (p_utm_campaign IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN r.utm_campaign      ELSE r.first_utm_campaign END),''), 'Direct / unknown') = p_utm_campaign)
),

by_source_rows AS (
  SELECT
    eff_source AS dimension,
    COUNT(*) FILTER (WHERE registration_status = 'active')    AS active,
    COUNT(*) FILTER (WHERE registration_status = 'cancelled') AS cancelled,
    COUNT(*) AS total
  FROM base
  GROUP BY eff_source
  UNION ALL
  SELECT 'TOTAL', COUNT(*) FILTER (WHERE registration_status='active'), COUNT(*) FILTER (WHERE registration_status='cancelled'), COUNT(*) FROM base
),

by_medium_rows AS (
  SELECT
    eff_medium AS dimension,
    COUNT(*) FILTER (WHERE registration_status = 'active')    AS active,
    COUNT(*) FILTER (WHERE registration_status = 'cancelled') AS cancelled,
    COUNT(*) AS total
  FROM base
  GROUP BY eff_medium
  UNION ALL
  SELECT 'TOTAL', COUNT(*) FILTER (WHERE registration_status='active'), COUNT(*) FILTER (WHERE registration_status='cancelled'), COUNT(*) FROM base
),

by_campaign_rows AS (
  SELECT
    eff_campaign AS dimension,
    COUNT(*) FILTER (WHERE registration_status = 'active')    AS active,
    COUNT(*) FILTER (WHERE registration_status = 'cancelled') AS cancelled,
    COUNT(*) AS total
  FROM base
  GROUP BY eff_campaign
  UNION ALL
  SELECT 'TOTAL', COUNT(*) FILTER (WHERE registration_status='active'), COUNT(*) FILTER (WHERE registration_status='cancelled'), COUNT(*) FROM base
)

SELECT jsonb_build_object(
  'by_source',
    (SELECT jsonb_agg(jsonb_build_object('dimension', dimension, 'active', active, 'cancelled', cancelled, 'total', total) ORDER BY (dimension = 'TOTAL'), total DESC)
     FROM by_source_rows),
  'by_medium',
    (SELECT jsonb_agg(jsonb_build_object('dimension', dimension, 'active', active, 'cancelled', cancelled, 'total', total) ORDER BY (dimension = 'TOTAL'), total DESC)
     FROM by_medium_rows),
  'by_campaign',
    (SELECT jsonb_agg(jsonb_build_object('dimension', dimension, 'active', active, 'cancelled', cancelled, 'total', total) ORDER BY (dimension = 'TOTAL'), total DESC)
     FROM by_campaign_rows)
);
$$;

REVOKE ALL ON FUNCTION public.get_acquisition_breakdown(timestamptz, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_acquisition_breakdown(timestamptz, timestamptz, text, text, text, text) TO service_role;

-- =============================================================================
-- FUNCTION 5: get_lab_performance
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_lab_performance(
  p_start    timestamptz,
  p_end      timestamptz,
  p_event_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH event_set AS (
  SELECT e.id, e.title, e.event_date, e.seat_limit
  FROM events e
  WHERE e.event_date >= p_start AND e.event_date < p_end
    AND (p_event_id IS NULL OR e.id = p_event_id)
),

reg_stats AS (
  SELECT
    r.event_id,
    COUNT(*) AS total_registrations,
    COUNT(*) FILTER (WHERE r.registration_status = 'active')    AS active_registrations,
    COUNT(*) FILTER (WHERE r.registration_status = 'cancelled') AS cancelled_registrations
  FROM registrations r
  WHERE r.event_id IN (SELECT id FROM event_set)
  GROUP BY r.event_id
),

att_stats AS (
  SELECT
    r.event_id,
    COUNT(*) FILTER (WHERE la.status IN ('attended','partial','no_show')) AS reviewed,
    COUNT(*) FILTER (WHERE la.status IN ('attended','partial'))           AS attended,
    COUNT(*) FILTER (WHERE la.status = 'no_show')                        AS no_show,
    COUNT(*) FILTER (WHERE la.status = 'unreviewed')                     AS unreviewed
  FROM registrations r
  JOIN lab_attendance la ON la.registration_id = r.id
  WHERE r.registration_status = 'active'
    AND r.event_id IN (SELECT id FROM event_set)
  GROUP BY r.event_id
),

-- Returning attendees: contacts at this event who have a PRIOR event attendance
returning_att AS (
  SELECT
    e_curr.id AS event_id,
    COUNT(DISTINCT r_curr.contact_id) AS returning_attendees
  FROM event_set e_curr
  JOIN registrations r_curr ON r_curr.event_id = e_curr.id
    AND r_curr.registration_status = 'active'
    AND r_curr.contact_id IS NOT NULL
  JOIN lab_attendance la_curr ON la_curr.registration_id = r_curr.id
    AND la_curr.status IN ('attended','partial')
  WHERE EXISTS (
    SELECT 1
    FROM registrations r_prior
    JOIN events e_prior ON e_prior.id = r_prior.event_id
    JOIN lab_attendance la_prior ON la_prior.registration_id = r_prior.id
    WHERE r_prior.contact_id = r_curr.contact_id
      AND r_prior.registration_status = 'active'
      AND la_prior.status IN ('attended','partial')
      AND (
        e_prior.event_date < e_curr.event_date
        OR (e_prior.event_date = e_curr.event_date AND e_prior.id < e_curr.id)
      )
  )
  GROUP BY e_curr.id
)

SELECT COALESCE(
  jsonb_agg(
    jsonb_build_object(
      'event_id',            es.id,
      'event_title',         es.title,
      'event_date',          es.event_date,
      'seat_limit',          es.seat_limit,
      'total_registrations', COALESCE(rs.total_registrations, 0),
      'active_registrations',COALESCE(rs.active_registrations, 0),
      'cancelled_registrations', COALESCE(rs.cancelled_registrations, 0),
      'reviewed',            COALESCE(ats.reviewed, 0),
      'attended',            COALESCE(ats.attended, 0),
      'no_show',             COALESCE(ats.no_show, 0),
      'unreviewed',          COALESCE(ats.unreviewed, 0),
      'returning_attendees', COALESCE(ra.returning_attendees, 0),
      'attendance_rate',
        CASE
          WHEN COALESCE(ats.attended, 0) + COALESCE(ats.no_show, 0) = 0 THEN NULL
          ELSE ROUND(
            COALESCE(ats.attended, 0)::numeric /
            (COALESCE(ats.attended, 0) + COALESCE(ats.no_show, 0))::numeric * 100,
            1
          )
        END,
      'data_completion_rate',
        CASE
          WHEN COALESCE(rs.active_registrations, 0) = 0 THEN NULL
          ELSE ROUND(
            COALESCE(ats.reviewed, 0)::numeric /
            COALESCE(rs.active_registrations, 0)::numeric * 100,
            1
          )
        END
    )
    ORDER BY es.event_date DESC
  ),
  '[]'::jsonb
)
FROM event_set es
LEFT JOIN reg_stats rs ON rs.event_id = es.id
LEFT JOIN att_stats ats ON ats.event_id = es.id
LEFT JOIN returning_att ra ON ra.event_id = es.id;
$$;

REVOKE ALL ON FUNCTION public.get_lab_performance(timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_lab_performance(timestamptz, timestamptz, uuid) TO service_role;

-- =============================================================================
-- FUNCTION 6: get_audience_movement
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_audience_movement(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH source_counts AS (
  SELECT contact_id, COUNT(DISTINCT src_table) AS num_sources
  FROM (
    SELECT contact_id, 'registrations'         AS src_table FROM registrations         WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'participants'           AS src_table FROM participants           WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'subscribers'            AS src_table FROM subscribers            WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'whatsapp_requests'      AS src_table FROM whatsapp_requests      WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'contact_messages'       AS src_table FROM contact_messages       WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'immersion_applications' AS src_table FROM immersion_applications WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'lab_interest'           AS src_table FROM lab_interest           WHERE contact_id IS NOT NULL
    UNION ALL
    SELECT contact_id, 'email_contacts'         AS src_table FROM email_contacts         WHERE contact_id IS NOT NULL
  ) sub
  GROUP BY contact_id
),

-- Attended then re-registered: contacts with a qualifying attendance THEN a later active registration
att_then_rereg AS (
  SELECT COUNT(DISTINCT r1.contact_id) AS n
  FROM registrations r1
  JOIN lab_attendance la ON la.registration_id = r1.id
  JOIN registrations r2 ON r2.contact_id = r1.contact_id
    AND r2.registration_status = 'active'
    AND r2.created_at > r1.created_at
  WHERE r1.registration_status = 'active'
    AND la.status IN ('attended','partial')
    AND r1.contact_id IS NOT NULL
),

source_dist AS (
  SELECT num_sources, COUNT(*) AS contacts
  FROM source_counts
  GROUP BY num_sources
  ORDER BY num_sources
)

SELECT jsonb_build_object(
  'new_contacts_in_range',
    (SELECT COUNT(*) FROM contacts WHERE first_seen_at >= p_start AND first_seen_at < p_end),

  'multi_source_contacts',
    (SELECT COUNT(*) FROM source_counts WHERE num_sources >= 2),

  'single_source_contacts',
    (SELECT COUNT(*) FROM source_counts WHERE num_sources = 1),

  'single_source_rule',
    'Contact appears in exactly 1 source table (registrations, participants, subscribers, whatsapp_requests, contact_messages, immersion_applications, lab_interest, email_contacts)',

  'attended_then_reregistered',
    (SELECT n FROM att_then_rereg),

  'source_distribution',
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('num_sources', num_sources, 'contacts', contacts) ORDER BY num_sources), '[]'::jsonb)
     FROM source_dist)
);
$$;

REVOKE ALL ON FUNCTION public.get_audience_movement(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_audience_movement(timestamptz, timestamptz) TO service_role;

-- =============================================================================
-- FUNCTION 7: get_assessment_pathway
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_assessment_pathway(
  p_start             timestamptz,
  p_end               timestamptz,
  p_utm_source        text    DEFAULT NULL,
  p_utm_medium        text    DEFAULT NULL,
  p_utm_campaign      text    DEFAULT NULL,
  p_attribution_mode  text    DEFAULT 'first_touch'
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH base AS (
  SELECT
    ase.id,
    ase.status,
    COALESCE(
      NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN ase.utm_source        ELSE p.first_utm_source   END), ''),
      'Direct / unknown'
    ) AS eff_source
  FROM assessment_sessions ase
  LEFT JOIN participants p ON p.id = ase.participant_id
  WHERE ase.started_at >= p_start AND ase.started_at < p_end
    AND (p_utm_source IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN ase.utm_source   ELSE p.first_utm_source   END),''), 'Direct / unknown') = p_utm_source)
    AND (p_utm_medium IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN ase.utm_medium   ELSE p.first_utm_medium   END),''), 'Direct / unknown') = p_utm_medium)
    AND (p_utm_campaign IS NULL OR
         COALESCE(NULLIF(TRIM(CASE WHEN p_attribution_mode = 'latest_touch' THEN ase.utm_campaign ELSE p.first_utm_campaign END),''), 'Direct / unknown') = p_utm_campaign)
),

totals AS (
  SELECT
    COUNT(*)                                                AS total_started,
    COUNT(*) FILTER (WHERE status IN ('submitted','scored')) AS total_completed,
    COUNT(*) FILTER (WHERE status = 'abandoned')            AS total_abandoned,
    COUNT(*) FILTER (WHERE status = 'in_progress')          AS total_in_progress
  FROM base
),

by_source AS (
  SELECT
    eff_source AS src,
    COUNT(*)                                                AS started,
    COUNT(*) FILTER (WHERE status IN ('submitted','scored')) AS completed,
    COUNT(*) FILTER (WHERE status = 'abandoned')            AS abandoned,
    COUNT(*) FILTER (WHERE status = 'in_progress')          AS in_progress
  FROM base
  GROUP BY eff_source
)

SELECT jsonb_build_object(
  'total_started',     (SELECT total_started     FROM totals),
  'total_completed',   (SELECT total_completed   FROM totals),
  'total_abandoned',   (SELECT total_abandoned   FROM totals),
  'total_in_progress', (SELECT total_in_progress FROM totals),
  'completion_rate',
    CASE WHEN (SELECT total_started FROM totals) = 0 THEN NULL
      ELSE ROUND((SELECT total_completed FROM totals)::numeric / (SELECT total_started FROM totals)::numeric * 100, 1)
    END,
  'by_source',
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('src', src, 'started', started, 'completed', completed, 'abandoned', abandoned, 'in_progress', in_progress) ORDER BY started DESC), '[]'::jsonb)
     FROM by_source),
  'attribution_mode', p_attribution_mode
);
$$;

REVOKE ALL ON FUNCTION public.get_assessment_pathway(timestamptz, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_assessment_pathway(timestamptz, timestamptz, text, text, text, text) TO service_role;

-- =============================================================================
-- FUNCTION 8: get_data_health
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_data_health(
  p_start timestamptz,
  p_end   timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
SELECT jsonb_build_object(

  'regs_without_contact',
    (SELECT COUNT(*)
     FROM registrations
     WHERE contact_id IS NULL
       AND created_at >= p_start AND created_at < p_end),

  'unreviewed_attendance',
    (SELECT COUNT(*)
     FROM registrations r
     JOIN lab_attendance la ON la.registration_id = r.id
     JOIN events e ON e.id = r.event_id
     WHERE r.registration_status = 'active'
       AND la.status = 'unreviewed'
       AND e.event_date >= p_start AND e.event_date < p_end),

  'assessment_inconsistencies',
    (SELECT COUNT(*)
     FROM assessment_sessions
     WHERE
       (submitted_at IS NOT NULL AND status NOT IN ('submitted','scored'))
       OR (status IN ('submitted','scored') AND submitted_at IS NULL)
    ),

  'cancelled_without_cancelled_at',
    (SELECT COUNT(*)
     FROM registrations
     WHERE registration_status = 'cancelled'
       AND cancelled_at IS NULL),

  'contacts_first_after_last',
    (SELECT COUNT(*)
     FROM contacts
     WHERE first_seen_at > last_seen_at),

  'regs_missing_attendance',
    (SELECT COUNT(*)
     FROM registrations r
     LEFT JOIN lab_attendance la ON la.registration_id = r.id
     WHERE la.id IS NULL
       AND r.created_at >= p_start AND r.created_at < p_end),

  'email_contacts_unlinked',
    (SELECT COUNT(*)
     FROM email_contacts
     WHERE contact_id IS NULL),

  'participants_unlinked',
    (SELECT COUNT(*)
     FROM participants
     WHERE contact_id IS NULL)

);
$$;

REVOKE ALL ON FUNCTION public.get_data_health(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_data_health(timestamptz, timestamptz) TO service_role;

-- =============================================================================
-- FUNCTION 9: get_contact_funnel_history
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_contact_funnel_history(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
WITH contact_row AS (
  SELECT c.id, c.first_seen_at, c.last_seen_at
  FROM contacts c
  WHERE c.id = p_contact_id
),

reg_history AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'registration_id',    r.id,
      'event_title',        e.title,
      'event_date',         e.event_date,
      'registration_status',r.registration_status,
      'cancelled_at',       r.cancelled_at,
      'reactivated_at',     r.reactivated_at,
      'attendance_status',  la.status,
      'attended_minutes',   la.attended_minutes,
      'created_at',         r.created_at
    )
    ORDER BY r.created_at DESC
  ) AS data
  FROM registrations r
  JOIN events e ON e.id = r.event_id
  LEFT JOIN lab_attendance la ON la.registration_id = r.id
  WHERE r.contact_id = p_contact_id
),

assessment_history AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'session_id',   ase.id,
      'status',       ase.status,
      'started_at',   ase.started_at,
      'submitted_at', ase.submitted_at
    )
    ORDER BY ase.started_at DESC
  ) AS data
  FROM assessment_sessions ase
  JOIN participants p ON p.id = ase.participant_id
  WHERE p.contact_id = p_contact_id
),

wa_history AS (
  SELECT jsonb_agg(
    jsonb_build_object('created_at', w.created_at)
    ORDER BY w.created_at DESC
  ) AS data
  FROM whatsapp_requests w
  WHERE w.contact_id = p_contact_id
),

email_status AS (
  SELECT jsonb_build_object('status', ec.status) AS data
  FROM email_contacts ec
  WHERE ec.contact_id = p_contact_id
  ORDER BY ec.created_at DESC
  LIMIT 1
),

source_list AS (
  SELECT jsonb_agg(DISTINCT src_table ORDER BY src_table) AS data
  FROM (
    SELECT 'registrations'         AS src_table WHERE EXISTS (SELECT 1 FROM registrations         WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'participants'           AS src_table WHERE EXISTS (SELECT 1 FROM participants           WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'subscribers'            AS src_table WHERE EXISTS (SELECT 1 FROM subscribers            WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'whatsapp_requests'      AS src_table WHERE EXISTS (SELECT 1 FROM whatsapp_requests      WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'contact_messages'       AS src_table WHERE EXISTS (SELECT 1 FROM contact_messages       WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'immersion_applications' AS src_table WHERE EXISTS (SELECT 1 FROM immersion_applications WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'lab_interest'           AS src_table WHERE EXISTS (SELECT 1 FROM lab_interest           WHERE contact_id = p_contact_id)
    UNION ALL
    SELECT 'email_contacts'         AS src_table WHERE EXISTS (SELECT 1 FROM email_contacts         WHERE contact_id = p_contact_id)
  ) s
)

SELECT jsonb_build_object(
  'contact_id',          cr.id,
  'first_seen_at',       cr.first_seen_at,
  'last_seen_at',        cr.last_seen_at,
  'registrations',       COALESCE((SELECT data FROM reg_history),       '[]'::jsonb),
  'assessments',         COALESCE((SELECT data FROM assessment_history), '[]'::jsonb),
  'whatsapp_requests',   COALESCE((SELECT data FROM wa_history),         '[]'::jsonb),
  'email_status',        COALESCE((SELECT data FROM email_status),       'null'::jsonb),
  'source_tables',       COALESCE((SELECT data FROM source_list),        '[]'::jsonb)
)
FROM contact_row cr;
$$;

REVOKE ALL ON FUNCTION public.get_contact_funnel_history(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_funnel_history(uuid) TO service_role;
