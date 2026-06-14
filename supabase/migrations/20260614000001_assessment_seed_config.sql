-- =============================================================================
-- CoVo Fivefold Stewardship Assessment — Pilot v1 Configuration Seed
-- =============================================================================
-- Seeds:
--   1. assessment_versions   — pilot-v1
--   2. assessment_domains    — 8 domains
--   3. assessment_constructs — 32 constructs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Version
-- ---------------------------------------------------------------------------
INSERT INTO assessment_versions (id, version_tag, label, is_active, config)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'pilot-v1',
  'Fivefold Stewardship Assessment — Pilot Version 1',
  true,
  '{
    "item_count": 88,
    "estimated_minutes": 25,
    "validated": false,
    "pilot_note": "This is an unvalidated pilot instrument. Label all analytics as Pilot Analytics."
  }'
);


-- ---------------------------------------------------------------------------
-- 2. Domains
-- ---------------------------------------------------------------------------
INSERT INTO assessment_domains (version_id, domain_key, label, short_label, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'prophetic',             'Prophetic',             'P',   1),
  ('00000000-0000-0000-0000-000000000001', 'evangelistic',          'Evangelistic',          'E',   2),
  ('00000000-0000-0000-0000-000000000001', 'shepherding',           'Shepherding',           'S',   3),
  ('00000000-0000-0000-0000-000000000001', 'teaching',              'Teaching',              'T',   4),
  ('00000000-0000-0000-0000-000000000001', 'apostolic_direction',   'Apostolic Direction',   'AD',  5),
  ('00000000-0000-0000-0000-000000000001', 'apostolic_formation',   'Apostolic Formation',   'AF',  6),
  ('00000000-0000-0000-0000-000000000001', 'apostolic_multiplying', 'Apostolic Multiplying', 'AM',  7),
  ('00000000-0000-0000-0000-000000000001', 'cross_function',        'Cross-Function',        'X',   8);


-- ---------------------------------------------------------------------------
-- 3. Constructs — Prophetic (PL-1 through PL-4)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'PL-1', 'prophetic',
   'Perception of Spiritual Significance',
   'Attentiveness to the spiritual dimension of ordinary events, conversations, and circumstances.'),
  ('00000000-0000-0000-0000-000000000001', 'PL-2', 'prophetic',
   'Pattern Recognition Across Scripture and Experience',
   'Connecting scriptural themes to present circumstances in ways others find clarifying.'),
  ('00000000-0000-0000-0000-000000000001', 'PL-3', 'prophetic',
   'Burden for Community Faithfulness',
   'Concern for the spiritual trajectory of a group, community, or context.'),
  ('00000000-0000-0000-0000-000000000001', 'PL-4', 'prophetic',
   'Tested and Provisional Communication',
   'Bringing spiritual impressions to community for testing before acting on them.');


-- ---------------------------------------------------------------------------
-- Constructs — Evangelistic (EV-1 through EV-4)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'EV-1', 'evangelistic',
   'Natural Bridge-Building with the Unconnected',
   'Ease and frequency of meaningful connection with people outside the faith community.'),
  ('00000000-0000-0000-0000-000000000001', 'EV-2', 'evangelistic',
   'Gospel Clarity and Conversational Confidence',
   'Ability to articulate the gospel clearly in ordinary conversation without anxiety.'),
  ('00000000-0000-0000-0000-000000000001', 'EV-3', 'evangelistic',
   'Sustained Relational Investment in Pre-Believers',
   'Long-term, non-transactional investment in relationships with people far from faith.'),
  ('00000000-0000-0000-0000-000000000001', 'EV-4', 'evangelistic',
   'Catalytic Effect on Others'' Witness',
   'Tendency to draw others into evangelistic engagement by example or invitation.');


-- ---------------------------------------------------------------------------
-- Constructs — Shepherding (SH-1 through SH-4)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'SH-1', 'shepherding',
   'Attentiveness to Individual Wellbeing',
   'Noticing and responding to the emotional, relational, and spiritual state of specific people.'),
  ('00000000-0000-0000-0000-000000000001', 'SH-2', 'shepherding',
   'Long-Haul Relational Commitment',
   'Sustained presence with people through difficulty, not only in times of immediate need.'),
  ('00000000-0000-0000-0000-000000000001', 'SH-3', 'shepherding',
   'Safe and Bounded Space Creation',
   'Ability to create environments where people feel genuinely safe to be honest.'),
  ('00000000-0000-0000-0000-000000000001', 'SH-4', 'shepherding',
   'Protection Posture (vs. Control)',
   'Acting to protect the community or individuals from harm, distinguished from controlling behavior.');


-- ---------------------------------------------------------------------------
-- Constructs — Teaching (TE-1 through TE-4)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'TE-1', 'teaching',
   'Scripturally-Rooted Explanation',
   'Habitual grounding of explanation and guidance in Scripture.'),
  ('00000000-0000-0000-0000-000000000001', 'TE-2', 'teaching',
   'Accessible Translation Across Contexts',
   'Ability to explain complex ideas in language ordinary people find clear and useful.'),
  ('00000000-0000-0000-0000-000000000001', 'TE-3', 'teaching',
   'Delight in Inquiry and Study',
   'Intrinsic motivation toward learning, research, and sustained engagement with ideas.'),
  ('00000000-0000-0000-0000-000000000001', 'TE-4', 'teaching',
   'Formation-Oriented Teaching',
   'Teaching aimed at life change and character formation, not merely information transfer.');


-- ---------------------------------------------------------------------------
-- Constructs — Apostolic Direction (FI-1 through FI-4, EC-1)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'FI-1', 'apostolic_direction',
   'Frontier Instinct',
   'Pull toward contexts, people groups, or territories where the gospel is absent or thin.'),
  ('00000000-0000-0000-0000-000000000001', 'FI-2', 'apostolic_direction',
   'Dissatisfaction with Settler Posture',
   'Discomfort with purely maintenance-oriented ministry; orientation toward expansion.'),
  ('00000000-0000-0000-0000-000000000001', 'FI-3', 'apostolic_direction',
   'Field-Reading Capacity',
   'Ability to assess a new context and identify what gospel entry might look like there.'),
  ('00000000-0000-0000-0000-000000000001', 'FI-4', 'apostolic_direction',
   'Cross-Cultural Adaptability',
   'Ease adjusting communication, practice, and expectation across cultural contexts.'),
  ('00000000-0000-0000-0000-000000000001', 'EC-1', 'apostolic_direction',
   'Ecclesiological Imagination',
   'Capacity to envision forms of community and gathering not yet present in a given context.');


-- ---------------------------------------------------------------------------
-- Constructs — Apostolic Formation (SD-1 through SD-5, EC-2)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'SD-1', 'apostolic_formation',
   'Personal Spiritual Discipline',
   'Consistent practices of prayer, Scripture, and spiritual formation as the base of ministry.'),
  ('00000000-0000-0000-0000-000000000001', 'SD-2', 'apostolic_formation',
   'Covenantal Accountability',
   'Willingness to invite sustained accountability from trusted others for one''s own growth.'),
  ('00000000-0000-0000-0000-000000000001', 'SD-3', 'apostolic_formation',
   'Identity Groundedness Under Pressure',
   'Stability of self and calling during opposition, failure, or extended fruitlessness.'),
  ('00000000-0000-0000-0000-000000000001', 'SD-4', 'apostolic_formation',
   'Theological Integration',
   'Capacity to hold together doctrinal conviction with missional flexibility.'),
  ('00000000-0000-0000-0000-000000000001', 'SD-5', 'apostolic_formation',
   'Resilience and Perseverance',
   'Sustained movement toward mission through difficulty, opposition, and disappointment.'),
  ('00000000-0000-0000-0000-000000000001', 'EC-2', 'apostolic_formation',
   'Community-Formation Instinct',
   'Impulse to gather people around shared spiritual purpose and to form them together.');


-- ---------------------------------------------------------------------------
-- Constructs — Apostolic Multiplying (DT-1 through DT-3, LE-1 through LE-3)
-- ---------------------------------------------------------------------------
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'DT-1', 'apostolic_multiplying',
   'Intentional Disciple-Making Posture',
   'Consistent, deliberate investment in helping specific people grow as disciples.'),
  ('00000000-0000-0000-0000-000000000001', 'DT-2', 'apostolic_multiplying',
   'Investment in Reproducible Patterns',
   'Teaching and modeling in ways others can replicate, not just receive.'),
  ('00000000-0000-0000-0000-000000000001', 'DT-3', 'apostolic_multiplying',
   'Second-Generation Fruit',
   'Evidence of disciples who are themselves making disciples.'),
  ('00000000-0000-0000-0000-000000000001', 'LE-1', 'apostolic_multiplying',
   'Leader Identification',
   'Ability to spot leadership potential in people others overlook.'),
  ('00000000-0000-0000-0000-000000000001', 'LE-2', 'apostolic_multiplying',
   'Leader Development Investment',
   'Sustained, personalized investment in developing identified leaders.'),
  ('00000000-0000-0000-0000-000000000001', 'LE-3', 'apostolic_multiplying',
   'Release and Sending',
   'Willingness to release developed leaders into new contexts rather than retaining them.');
