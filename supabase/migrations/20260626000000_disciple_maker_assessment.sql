-- =============================================================================
-- Disciple Maker Pathway Assessment — Schema Extension
-- =============================================================================
--
-- This migration adds support for the Disciple Maker assessment alongside
-- the existing Fivefold Stewardship Assessment.
--
-- Changes:
--   1. Add assessment_type column to assessment_sessions
--   2. Make version_id nullable (fivefold only uses it)
--   3. Add question_id column to assessment_responses (for disciple-maker)
--   4. Add results_token_hash and completed_at to assessment_sessions
--
-- =============================================================================


-- Add assessment_type column to assessment_sessions
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'fivefold';

-- Add index for fast lookup by type and participant
CREATE INDEX IF NOT EXISTS assessment_sessions_type_participant_idx
  ON assessment_sessions (assessment_type, participant_id);

-- Make version_id nullable (fivefold uses it, disciple-maker doesn't)
ALTER TABLE assessment_sessions
  ALTER COLUMN version_id DROP NOT NULL;

-- Add results_token_hash for secure results access
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS results_token_hash text;

CREATE INDEX IF NOT EXISTS assessment_sessions_results_token_hash_idx
  ON assessment_sessions (results_token_hash);

-- Add completed_at for disciple-maker (different from submitted_at)
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;


-- Add question_id column to assessment_responses (for disciple-maker)
ALTER TABLE assessment_responses
  ADD COLUMN IF NOT EXISTS question_id text;

-- For disciple-maker, we use question_id; for fivefold, we use item_id
-- Add index for fast lookup by question
CREATE INDEX IF NOT EXISTS assessment_responses_question_id_idx
  ON assessment_responses (question_id);

-- Update the UNIQUE constraint to handle both question_id and item_id
-- For now, keep session_id, item_id unique for fivefold
-- And add a separate index for disciple-maker (question_id, session_id)

-- Note: assessment_responses.score column will be used by disciple-maker
-- For fivefold, response_num serves the same purpose
ALTER TABLE assessment_responses
  ADD COLUMN IF NOT EXISTS score numeric;

CREATE INDEX IF NOT EXISTS assessment_responses_score_idx
  ON assessment_responses (score)
  WHERE score IS NOT NULL;
