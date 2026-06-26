-- =============================================================================
-- Disciple Maker Pathway Assessment — Dedicated Schema
-- =============================================================================
--
-- This migration creates dedicated tables for the Disciple Maker assessment.
-- It is completely isolated from the Fivefold Stewardship Assessment.
--
-- Rationale:
--   - Zero risk of breaking existing assessment functionality
--   - Cleaner schema specific to this assessment's needs
--   - Simpler queries with no filter requirements
--
-- Tables:
--   disciple_maker_sessions    — one row per participant attempt
--   disciple_maker_responses   — one row per question response
--
-- =============================================================================


-- ---------------------------------------------------------------------------
-- disciple_maker_sessions
-- One row per participant's attempt at the assessment.
-- Stores basic participant info + session state + results.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disciple_maker_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  first_name            text NOT NULL,
  organization          text,

  -- Session state
  status                text NOT NULL DEFAULT 'in_progress',
                          -- in_progress | completed
  session_token_hash    text,             -- SHA-256 hash (for resume)
  results_token_hash    text,             -- SHA-256 hash (for results access)

  -- Scoring (computed at submit time)
  dimension_scores      jsonb,            -- { dimension_key: avg_score, ... }
  pathway               text,             -- 'explorer' | 'practitioner' | 'multiplier' | 'catalyst'
  strongest_dimension   text,             -- dimension with highest score
  lowest_dimension      text,             -- dimension with lowest score
  bottleneck            text,             -- diagnosis of main constraint

  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disciple_maker_sessions_email_idx
  ON disciple_maker_sessions (email);
CREATE INDEX IF NOT EXISTS disciple_maker_sessions_session_token_hash_idx
  ON disciple_maker_sessions (session_token_hash);
CREATE INDEX IF NOT EXISTS disciple_maker_sessions_results_token_hash_idx
  ON disciple_maker_sessions (results_token_hash);
CREATE INDEX IF NOT EXISTS disciple_maker_sessions_status_idx
  ON disciple_maker_sessions (status);


-- ---------------------------------------------------------------------------
-- disciple_maker_responses
-- One row per question per session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disciple_maker_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES disciple_maker_sessions(id) ON DELETE CASCADE,
  question_id   text NOT NULL,           -- e.g. "v1", "o2", "c3"
  dimension     text NOT NULL,           -- dimension_key for this question
  score         integer NOT NULL,        -- 1-5 Likert scale
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS disciple_maker_responses_session_idx
  ON disciple_maker_responses (session_id);
CREATE INDEX IF NOT EXISTS disciple_maker_responses_dimension_idx
  ON disciple_maker_responses (dimension);
