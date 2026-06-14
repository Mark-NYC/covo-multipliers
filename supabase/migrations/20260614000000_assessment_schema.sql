-- =============================================================================
-- CoVo Fivefold Stewardship Assessment — Core Schema
-- =============================================================================
--
-- Tables:
--   assessment_versions      — versioned configurations for the assessment
--   assessment_domains       — the 8 scoring domains (PEST + 3 Apostolic + Cross)
--   assessment_constructs    — the 32 locked theological constructs
--   assessment_items         — the pilot item bank (88 items at launch)
--   assessment_item_options  — answer options for scenario and forced-choice items
--   participants             — one row per unique email address
--   assessment_sessions      — one row per participant attempt
--   assessment_responses     — one row per item response
--   assessment_results       — scored output, stored server-side
--   admin_audit_log          — admin action trail
--
-- All scoring is performed server-side in Edge Functions.
-- Participants may access only their own result via a secure hashed token.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- assessment_versions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_tag   text NOT NULL UNIQUE,          -- e.g. "pilot-v1"
  label         text NOT NULL,                 -- human display name
  is_active     boolean NOT NULL DEFAULT false,
  config        jsonb NOT NULL DEFAULT '{}',   -- future overrides (timing, item subsets)
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Only one version active at a time
CREATE UNIQUE INDEX IF NOT EXISTS assessment_versions_active_unique
  ON assessment_versions (is_active)
  WHERE is_active = true;


-- ---------------------------------------------------------------------------
-- assessment_domains
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_domains (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  domain_key   text NOT NULL,      -- e.g. "prophetic", "apostolic_direction"
  label        text NOT NULL,      -- e.g. "Prophetic"
  short_label  text,               -- e.g. "P"
  sort_order   int NOT NULL DEFAULT 0,
  UNIQUE (version_id, domain_key)
);


-- ---------------------------------------------------------------------------
-- assessment_constructs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_constructs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id     uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  construct_key  text NOT NULL,    -- e.g. "PL-1", "FI-2", "SD-3"
  domain_key     text NOT NULL,
  label          text NOT NULL,
  description    text,
  UNIQUE (version_id, construct_key)
);


-- ---------------------------------------------------------------------------
-- assessment_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  pilot_id         text NOT NULL,               -- e.g. "PP-002"
  item_text        text NOT NULL,
  domain_key       text NOT NULL,
  construct_key    text,                        -- null for cross-domain items
  phenotype_layer  text NOT NULL,               -- Perception | Instinct | Operating Style | Behavioral History | Self-Reported Outcome | Reproduction | Shadow
  evidence_label   text NOT NULL,               -- A | B | S | F | FC | O | R
  response_format  text NOT NULL,               -- AGR6 | FREQ6 | EX6 | SC4 | FC2 | FC3
  reverse_keyed    boolean NOT NULL DEFAULT false,
  timeframe        text,                        -- e.g. "past 12 months" | "generally" | null
  sort_order       int NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  UNIQUE (version_id, pilot_id)
);


-- ---------------------------------------------------------------------------
-- assessment_item_options
-- Stores labelled answer options for SC4, FC2, FC3 items.
-- AGR6/FREQ6/EX6 use a shared scale; their options are not stored here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_item_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  option_key  text NOT NULL,        -- e.g. "A", "B", "C", "D"
  option_text text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  UNIQUE (item_id, option_key)
);


-- ---------------------------------------------------------------------------
-- participants
-- One row per unique email. Upserted on each new session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS participants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  first_name      text NOT NULL,
  last_name       text,
  church_org      text,
  role_context    text,             -- free-text role description
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS participants_email_idx ON participants (email);


-- ---------------------------------------------------------------------------
-- assessment_sessions
-- One row per attempt. A participant may have multiple sessions over time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id      uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  version_id          uuid NOT NULL REFERENCES assessment_versions(id),
  status              text NOT NULL DEFAULT 'in_progress',
                        -- in_progress | submitted | scored | abandoned
  consent_given       boolean NOT NULL DEFAULT false,
  consent_timestamp   timestamptz,
  resume_token_hash   text,         -- SHA-256 hex of the secret token
  resume_token_sent_at timestamptz,
  started_at          timestamptz NOT NULL DEFAULT now(),
  submitted_at        timestamptz,
  scored_at           timestamptz,
  last_active_at      timestamptz NOT NULL DEFAULT now(),
  item_order          jsonb,        -- ordered array of item IDs for this session
  metadata            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS assessment_sessions_participant_idx
  ON assessment_sessions (participant_id);
CREATE INDEX IF NOT EXISTS assessment_sessions_resume_token_hash_idx
  ON assessment_sessions (resume_token_hash);


-- ---------------------------------------------------------------------------
-- assessment_responses
-- One row per item per session. Upserted if participant changes an answer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_responses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES assessment_items(id),
  pilot_id     text NOT NULL,           -- denormalized for query convenience
  response_raw text NOT NULL,           -- exactly what the participant chose
  response_num numeric,                 -- numeric equivalent (for scale items)
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, item_id)
);

CREATE INDEX IF NOT EXISTS assessment_responses_session_idx
  ON assessment_responses (session_id);


-- ---------------------------------------------------------------------------
-- assessment_results
-- Stored server-side after scoring. Never recomputed client-side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  participant_id    uuid NOT NULL REFERENCES participants(id),
  version_id        uuid NOT NULL REFERENCES assessment_versions(id),
  result_token_hash text UNIQUE,     -- SHA-256 hex; used for tokenized result URL
  domain_scores     jsonb NOT NULL,  -- { domain_key: { raw, percentile_band, evidence_counts } }
  construct_scores  jsonb NOT NULL,  -- { construct_key: { raw, evidence_counts } }
  summary_flags     jsonb NOT NULL DEFAULT '[]',  -- caution flags, shadow notes
  result_copy       jsonb NOT NULL DEFAULT '{}',  -- rendered result text blocks
  scoring_version   text NOT NULL,   -- which scoring ruleset was used
  email_sent_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assessment_results_token_hash_idx
  ON assessment_results (result_token_hash);
CREATE INDEX IF NOT EXISTS assessment_results_participant_idx
  ON assessment_results (participant_id);


-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       text NOT NULL,         -- admin email or "system"
  action      text NOT NULL,         -- e.g. "item.deactivate", "session.abandon"
  target_type text,
  target_id   uuid,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL  DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- assessment_versions: public read of active version
ALTER TABLE assessment_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read active versions"
  ON assessment_versions FOR SELECT
  USING (is_active = true);

-- assessment_domains: public read
ALTER TABLE assessment_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read domains"
  ON assessment_domains FOR SELECT
  USING (true);

-- assessment_constructs: public read
ALTER TABLE assessment_constructs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read constructs"
  ON assessment_constructs FOR SELECT
  USING (true);

-- assessment_items: public read of active items
ALTER TABLE assessment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read active items"
  ON assessment_items FOR SELECT
  USING (is_active = true);

-- assessment_item_options: public read
ALTER TABLE assessment_item_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public can read item options"
  ON assessment_item_options FOR SELECT
  USING (true);

-- participants: no direct public access; all writes via service-role Edge Functions
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- assessment_sessions: no direct public access
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;

-- assessment_responses: no direct public access
ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;

-- assessment_results: no direct public access
ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;

-- admin_audit_log: no direct public access
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
