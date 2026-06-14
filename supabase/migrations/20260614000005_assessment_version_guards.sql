-- =============================================================================
-- Version-level guards.
-- Adds a DB-enforced check: no session may be created against a version
-- that is not active, has publicly_available=false, or has zero active items.
--
-- These guards supplement the application-layer checks in assessment-start.
-- =============================================================================

-- Function: returns true only if the version is safe to use for participants.
CREATE OR REPLACE FUNCTION assessment_version_is_participant_ready(p_version_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    v.is_active = true
    AND (v.config->>'publicly_available')::boolean IS NOT FALSE
    AND (v.config->>'unapproved')::boolean IS NOT TRUE
    AND (SELECT count(*) FROM assessment_items i WHERE i.version_id = p_version_id AND i.is_active = true) > 0
  FROM assessment_versions v
  WHERE v.id = p_version_id;
$$;

-- Trigger function: block session inserts against non-ready versions.
CREATE OR REPLACE FUNCTION trg_block_session_on_unready_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE(assessment_version_is_participant_ready(NEW.version_id), false) THEN
    RAISE EXCEPTION
      'Assessment version % is not ready for participant use. '
      'The version must be active, publicly_available, not marked unapproved, '
      'and must contain at least one active item.',
      NEW.version_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assessment_session_version_check
  BEFORE INSERT ON assessment_sessions
  FOR EACH ROW
  EXECUTE FUNCTION trg_block_session_on_unready_version();

COMMENT ON FUNCTION assessment_version_is_participant_ready IS
  'Returns true only when a version is active, publicly_available, not unapproved, '
  'and has at least one active item. Called by trigger before session insert.';
