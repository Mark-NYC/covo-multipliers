-- =============================================================================
-- CoVo Fivefold Stewardship Assessment — Scoring Rules
-- Stored as JSONB in a dedicated table for server-side reference.
-- The Edge Function reads these rules; no scoring logic runs in the browser.
-- =============================================================================

CREATE TABLE IF NOT EXISTS assessment_scoring_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id     uuid NOT NULL REFERENCES assessment_versions(id) ON DELETE CASCADE,
  scoring_version text NOT NULL DEFAULT 'pilot-v1-scoring-v1',
  rules          jsonb NOT NULL,   -- array of ScoringRule objects
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, scoring_version)
);

ALTER TABLE assessment_scoring_rules ENABLE ROW LEVEL SECURITY;
-- No public read — scoring rules are server-side only

-- ---------------------------------------------------------------------------
-- Pilot v1 scoring rules
-- Each rule:
--   pilot_id:       matches assessment_items.pilot_id
--   domain_key:     primary scoring domain
--   construct_key:  primary construct (null for cross-function items)
--   evidence_label: A | B | S | F | FC | O | R
--   reverse_keyed:  if true, score = (max_score + 1) - raw_score
--   weight:         multiplier applied to scaled score (default 1.0)
--   scoring_map:    for SC4/FC2/FC3, maps option_key → domain_key → score
-- ---------------------------------------------------------------------------
INSERT INTO assessment_scoring_rules (version_id, scoring_version, rules, notes)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'pilot-v1-scoring-v1',
  '[
    {"pilot_id":"PP-002","domain_key":"prophetic","construct_key":"PL-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PP-003","domain_key":"prophetic","construct_key":"PL-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PP-004","domain_key":"prophetic","construct_key":"PL-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PP-005","domain_key":"prophetic","construct_key":"PL-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PP-006","domain_key":"prophetic","construct_key":"PL-3","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PP-007","domain_key":"prophetic","construct_key":"PL-3","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PP-008","domain_key":"prophetic","construct_key":"PL-3","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"prophetic":2},"B":{"prophetic":4},"C":{"prophetic":3},"D":{"prophetic":1}}},
    {"pilot_id":"PP-009","domain_key":"prophetic","construct_key":"PL-3","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"teaching":3,"prophetic":1},"B":{"prophetic":2},"C":{"prophetic":4},"D":{"prophetic":1}}},
    {"pilot_id":"PP-010","domain_key":"prophetic","construct_key":"PL-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PP-012","domain_key":"prophetic","construct_key":"PL-4","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PP-013","domain_key":"prophetic","construct_key":"PL-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},

    {"pilot_id":"PE-001","domain_key":"evangelistic","construct_key":"EV-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-002","domain_key":"evangelistic","construct_key":"EV-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PE-003","domain_key":"evangelistic","construct_key":"EV-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-004","domain_key":"evangelistic","construct_key":"EV-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PE-005","domain_key":"evangelistic","construct_key":"EV-3","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-006","domain_key":"evangelistic","construct_key":"EV-3","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PE-007","domain_key":"evangelistic","construct_key":"EV-4","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-008","domain_key":"evangelistic","construct_key":"EV-4","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-009","domain_key":"evangelistic","construct_key":"EV-1","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PE-010","domain_key":"evangelistic","construct_key":"EV-3","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"evangelistic":4},"B":{"evangelistic":3},"C":{"evangelistic":3},"D":{"evangelistic":2}}},
    {"pilot_id":"PE-011","domain_key":"evangelistic","construct_key":"EV-3","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PE-013","domain_key":"evangelistic","construct_key":"EV-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PE-014","domain_key":"evangelistic","construct_key":"EV-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},

    {"pilot_id":"PS-001","domain_key":"shepherding","construct_key":"SH-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PS-002","domain_key":"shepherding","construct_key":"SH-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PS-003","domain_key":"shepherding","construct_key":"SH-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PS-004","domain_key":"shepherding","construct_key":"SH-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PS-005","domain_key":"shepherding","construct_key":"SH-3","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PS-006","domain_key":"shepherding","construct_key":"SH-3","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PS-007","domain_key":"shepherding","construct_key":"SH-4","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PS-008","domain_key":"shepherding","construct_key":"SH-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PS-009","domain_key":"shepherding","construct_key":"SH-4","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"shepherding":3},"B":{"shepherding":3},"C":{"shepherding":4},"D":{"shepherding":2}}},
    {"pilot_id":"PS-010","domain_key":"shepherding","construct_key":"SH-1","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PS-012","domain_key":"shepherding","construct_key":"SH-2","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PS-013","domain_key":"shepherding","construct_key":"SH-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},

    {"pilot_id":"PT-001","domain_key":"teaching","construct_key":"TE-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PT-002","domain_key":"teaching","construct_key":"TE-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PT-003","domain_key":"teaching","construct_key":"TE-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PT-004","domain_key":"teaching","construct_key":"TE-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PT-005","domain_key":"teaching","construct_key":"TE-3","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PT-006","domain_key":"teaching","construct_key":"TE-3","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PT-007","domain_key":"teaching","construct_key":"TE-4","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PT-008","domain_key":"teaching","construct_key":"TE-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PT-009","domain_key":"teaching","construct_key":"TE-4","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"teaching":3},"B":{"teaching":3},"C":{"teaching":2},"D":{"teaching":4}}},
    {"pilot_id":"PT-011","domain_key":"teaching","construct_key":"TE-4","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PT-012","domain_key":"teaching","construct_key":"TE-3","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PT-013","domain_key":"teaching","construct_key":"TE-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},

    {"pilot_id":"PAD-001","domain_key":"apostolic_direction","construct_key":"FI-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAD-002","domain_key":"apostolic_direction","construct_key":"FI-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAD-004","domain_key":"apostolic_direction","construct_key":"FI-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAD-005","domain_key":"apostolic_direction","construct_key":"FI-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAD-006","domain_key":"apostolic_direction","construct_key":"FI-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAD-007","domain_key":"apostolic_direction","construct_key":"EC-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAD-008","domain_key":"apostolic_direction","construct_key":"EC-1","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"apostolic_direction":2},"B":{"apostolic_direction":4},"C":{"apostolic_direction":3},"D":{"apostolic_direction":1}}},
    {"pilot_id":"PAD-009","domain_key":"apostolic_direction","construct_key":"FI-4","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAD-010","domain_key":"apostolic_direction","construct_key":"FI-1","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PAD-011","domain_key":"apostolic_direction","construct_key":"FI-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},

    {"pilot_id":"PAF-001","domain_key":"apostolic_formation","construct_key":"SD-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAF-002","domain_key":"apostolic_formation","construct_key":"SD-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAF-003","domain_key":"apostolic_formation","construct_key":"SD-2","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PAF-004","domain_key":"apostolic_formation","construct_key":"SD-3","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAF-005","domain_key":"apostolic_formation","construct_key":"SD-4","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAF-006","domain_key":"apostolic_formation","construct_key":"SD-5","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PAF-007","domain_key":"apostolic_formation","construct_key":"SD-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAF-008","domain_key":"apostolic_formation","construct_key":"EC-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAF-009","domain_key":"apostolic_formation","construct_key":"SD-3","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAF-010","domain_key":"apostolic_formation","construct_key":"SD-2","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PAF-011","domain_key":"apostolic_formation","construct_key":"SD-5","evidence_label":"F","reverse_keyed":true,"weight":1.0},
    {"pilot_id":"PAF-012","domain_key":"apostolic_formation","construct_key":"SD-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},

    {"pilot_id":"PAM-001","domain_key":"apostolic_multiplying","construct_key":"DT-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAM-002","domain_key":"apostolic_multiplying","construct_key":"DT-1","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAM-003","domain_key":"apostolic_multiplying","construct_key":"DT-2","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAM-004","domain_key":"apostolic_multiplying","construct_key":"DT-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAM-005","domain_key":"apostolic_multiplying","construct_key":"LE-1","evidence_label":"A","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAM-006","domain_key":"apostolic_multiplying","construct_key":"LE-2","evidence_label":"B","reverse_keyed":false,"weight":1.2},
    {"pilot_id":"PAM-007","domain_key":"apostolic_multiplying","construct_key":"LE-2","evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"apostolic_multiplying":3},"B":{"apostolic_multiplying":4},"C":{"apostolic_multiplying":2},"D":{"apostolic_multiplying":3}}},
    {"pilot_id":"PAM-008","domain_key":"apostolic_multiplying","construct_key":"DT-3","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAM-009","domain_key":"apostolic_multiplying","construct_key":"LE-2","evidence_label":"O","reverse_keyed":false,"weight":1.0},
    {"pilot_id":"PAM-010","domain_key":"apostolic_multiplying","construct_key":"DT-2","evidence_label":"F","reverse_keyed":true,"weight":1.0},

    {"pilot_id":"PX-001","domain_key":"cross_function","construct_key":null,"evidence_label":"FC","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"teaching":2},"B":{"shepherding":2},"C":{"evangelistic":2}}},
    {"pilot_id":"PX-002","domain_key":"cross_function","construct_key":null,"evidence_label":"FC","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"prophetic":2},"B":{"apostolic_direction":2},"C":{"shepherding":2}}},
    {"pilot_id":"PX-003","domain_key":"cross_function","construct_key":null,"evidence_label":"FC","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"shepherding":1,"teaching":1},"B":{"apostolic_direction":2}}},
    {"pilot_id":"PX-004","domain_key":"cross_function","construct_key":null,"evidence_label":"FC","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"teaching":2},"B":{"shepherding":2},"C":{"prophetic":2}}},
    {"pilot_id":"PX-005","domain_key":"cross_function","construct_key":null,"evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"prophetic":2,"teaching":1},"B":{"shepherding":2},"C":{"apostolic_direction":2},"D":{"evangelistic":2}}},
    {"pilot_id":"PX-006","domain_key":"cross_function","construct_key":null,"evidence_label":"S","reverse_keyed":false,"weight":1.0,
     "scoring_map":{"A":{"apostolic_direction":1},"B":{"prophetic":2},"C":{"teaching":2},"D":{"shepherding":2}}},
    {"pilot_id":"PX-007","domain_key":"cross_function","construct_key":null,"evidence_label":"A","reverse_keyed":false,"weight":0.5},
    {"pilot_id":"PX-008","domain_key":"cross_function","construct_key":null,"evidence_label":"B","reverse_keyed":false,"weight":0.5}
  ]'::jsonb,
  'Pilot v1 scoring rules — provisional. Weights and scoring maps subject to revision after psychometric analysis of pilot data. Do not report as validated.'
);
