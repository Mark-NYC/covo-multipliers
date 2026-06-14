-- =============================================================================
-- CoVo Fivefold Stewardship Assessment — Pilot Item Bank Seed
-- 88 items across 8 domains
-- =============================================================================
-- Evidence labels:  A=orientation B=behavioral S=scenario F=false-positive/shadow
--                   FC=forced-choice O=self-reported-outcome R=reproduction
-- Response formats: AGR6 FREQ6 EX6 SC4 FC2 FC3
-- =============================================================================

-- Convenience: reference the version UUID inline
DO $$ DECLARE v uuid := '00000000-0000-0000-0000-000000000001'; BEGIN

-- ============================================================
-- PROPHETIC DOMAIN — 11 items (PP-002 to PP-013, excl PP-001 and PP-011)
-- Constructs: PL-1, PL-2, PL-3, PL-4
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PP-002',
 'When I am in ordinary conversations, I find myself noticing what seems spiritually significant in what people say or do not say.',
 'prophetic', 'PL-1', 'Perception', 'A', 'AGR6', false, 'generally', 101),

(v, 'PP-003',
 'I regularly make connections between what I read in Scripture and patterns I observe in people''s lives or circumstances around me.',
 'prophetic', 'PL-2', 'Perception', 'A', 'AGR6', false, 'generally', 102),

(v, 'PP-004',
 'In the past 12 months, I can identify a time when a connection I drew between Scripture and a current situation gave someone genuine clarity they said they did not have before.',
 'prophetic', 'PL-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 103),

(v, 'PP-005',
 'When someone in my community or context seems to be struggling spiritually, I tend to notice it before others name it — even if the person has not said anything.',
 'prophetic', 'PL-1', 'Operating Style', 'A', 'AGR6', false, 'generally', 104),

(v, 'PP-006',
 'I feel a genuine weight of concern when I sense a community or group I belong to is drifting away from what matters most spiritually.',
 'prophetic', 'PL-3', 'Instinct', 'A', 'AGR6', false, 'generally', 105),

(v, 'PP-007',
 'In the past 12 months, I can identify a time when I raised a concern about the spiritual trajectory of a group I was part of — and did so in a way that was received rather than dismissed.',
 'prophetic', 'PL-3', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 106),

(v, 'PP-008',
 'A faith community you care about begins making decisions that seem to be driven more by what is comfortable or familiar than by spiritual discernment. Which response feels most natural to you?',
 'prophetic', 'PL-3', 'Operating Style', 'S', 'SC4', false, null, 107),

(v, 'PP-009',
 'A group you lead is processing an ambiguous situation that could be interpreted several different ways. People are uncertain what it means or how to respond. Which response feels most characteristic of you?',
 'prophetic', 'PL-3', 'Operating Style', 'S', 'SC4', false, null, 108),

(v, 'PP-010',
 'In the past 12 months, I can identify a time when I brought a spiritually significant impression to trusted people before acting on it — specifically because I wanted their input before moving forward.',
 'prophetic', 'PL-4', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 109),

(v, 'PP-012',
 'When I feel strongly that something is spiritually significant, I prefer to act on it rather than wait for confirmation from others.',
 'prophetic', 'PL-4', 'Shadow', 'F', 'AGR6', true, 'generally', 110),

(v, 'PP-013',
 'In the past 12 months, how often did you share a spiritual impression or concern with someone else before you were fully certain of it — specifically in order to have it tested?',
 'prophetic', 'PL-4', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 111);

-- SC4 options for PP-008
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I would wait and observe more before saying anything — naming things too early can create more division than it resolves.', 1
FROM assessment_items WHERE pilot_id = 'PP-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I would name what I am seeing to a small group of trusted people and invite them to discern whether it is real.', 2
FROM assessment_items WHERE pilot_id = 'PP-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I would address it directly with the community, even if it creates tension — this is too important to leave unnamed.', 3
FROM assessment_items WHERE pilot_id = 'PP-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I would focus on what practical changes could shift the situation, rather than framing it as a spiritual concern.', 4
FROM assessment_items WHERE pilot_id = 'PP-008' AND version_id = v;

-- SC4 options for PP-009
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I help the group identify the relevant scriptural framework and work through it together until there is interpretive agreement.', 1
FROM assessment_items WHERE pilot_id = 'PP-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I ask what each person is sensing, hold everything together without naming a direction, and wait for consensus to emerge.', 2
FROM assessment_items WHERE pilot_id = 'PP-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I offer a provisional read of what I think may be happening, make clear it is a working interpretation, and invite the group to test whether it is right.', 3
FROM assessment_items WHERE pilot_id = 'PP-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I help the group move toward practical next steps without requiring everyone to agree on what the situation means first.', 4
FROM assessment_items WHERE pilot_id = 'PP-009' AND version_id = v;


-- ============================================================
-- EVANGELISTIC DOMAIN — 13 items (PE-001 to PE-014, excl PE-012)
-- Constructs: EV-1, EV-2, EV-3, EV-4
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PE-001',
 'I find it natural to initiate conversations with people who do not appear to have a faith community or spiritual anchor.',
 'evangelistic', 'EV-1', 'Instinct', 'A', 'AGR6', false, 'generally', 201),

(v, 'PE-002',
 'In the past 12 months, how often did you initiate a meaningful personal conversation with someone you knew to be outside the Christian faith — not primarily about faith, but rooted in genuine interest in them?',
 'evangelistic', 'EV-1', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 202),

(v, 'PE-003',
 'When a natural opening arises in conversation to say something about my faith, I typically feel more comfortable than anxious.',
 'evangelistic', 'EV-2', 'Operating Style', 'A', 'AGR6', false, 'generally', 203),

(v, 'PE-004',
 'In the past 12 months, I can identify a time when I explained something about my faith to someone who did not share it — in a way they said was clear and not off-putting.',
 'evangelistic', 'EV-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 204),

(v, 'PE-005',
 'I tend to maintain friendships with people far from faith over extended time — not as projects or ministry targets, but as people I genuinely enjoy and care about.',
 'evangelistic', 'EV-3', 'Instinct', 'A', 'AGR6', false, 'generally', 205),

(v, 'PE-006',
 'In the past 12 months, I can identify a friendship I sustained with someone outside the faith that was characterized by non-transactional care over multiple months.',
 'evangelistic', 'EV-3', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 206),

(v, 'PE-007',
 'People who know me have told me that watching how I engage with people outside the faith has influenced how they themselves think about or approach their own witness.',
 'evangelistic', 'EV-4', 'Operating Style', 'A', 'AGR6', false, 'generally', 207),

(v, 'PE-008',
 'I have seen someone from my faith community take a meaningful step toward sharing their faith with someone outside it — in a context where my example or invitation was part of what moved them.',
 'evangelistic', 'EV-4', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 208),

(v, 'PE-009',
 'I feel most alive and effective in ministry when I am serving people who are already part of a faith community.',
 'evangelistic', 'EV-1', 'Shadow', 'F', 'AGR6', true, 'generally', 209),

(v, 'PE-010',
 'You''ve been getting to know someone outside the faith over several months. They show genuine curiosity about spiritual things but are not ready to make any kind of commitment. Which response feels most natural to you?',
 'evangelistic', 'EV-3', 'Operating Style', 'S', 'SC4', false, null, 210),

(v, 'PE-011',
 'I have seen someone I was in relationship with cross a threshold toward faith — a decision, a commitment, or a turning point that they would themselves describe as significant.',
 'evangelistic', 'EV-3', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 211),

(v, 'PE-013',
 'In the past 12 months, I can identify a specific person outside the faith with whom I had a sustained meaningful friendship — not one focused on getting to a gospel conversation, but genuinely centered on knowing and being known.',
 'evangelistic', 'EV-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 212),

(v, 'PE-014',
 'In the past 12 months, how often did you find yourself in a genuine conversation about faith, meaning, or spiritual questions with someone who did not share your faith?',
 'evangelistic', 'EV-2', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 213);

-- SC4 options for PE-010
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I keep investing in the friendship and stay patient — readiness cannot be manufactured, and the relationship matters regardless of outcome.', 1
FROM assessment_items WHERE pilot_id = 'PE-010' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I look for a clear moment to share the gospel in a way that invites them to make a decision — spiritual curiosity should not be left without a clear invitation.', 2
FROM assessment_items WHERE pilot_id = 'PE-010' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I invite them into a community context where they can experience faith up close alongside others without any pressure to decide anything.', 3
FROM assessment_items WHERE pilot_id = 'PE-010' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I stay honest about what I believe when it comes up naturally but do not make the relationship contingent on where they land spiritually.', 4
FROM assessment_items WHERE pilot_id = 'PE-010' AND version_id = v;


-- ============================================================
-- SHEPHERDING DOMAIN — 12 items (PS-001 to PS-013, excl PS-011)
-- Constructs: SH-1, SH-2, SH-3, SH-4
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PS-001',
 'I tend to notice when someone in a group I am part of is struggling emotionally or spiritually — even before they say anything about it.',
 'shepherding', 'SH-1', 'Perception', 'A', 'AGR6', false, 'generally', 301),

(v, 'PS-002',
 'In the past 12 months, I can identify a time when I noticed someone was struggling before they told anyone — and I reached out to them directly.',
 'shepherding', 'SH-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 302),

(v, 'PS-003',
 'When someone I care for goes through a long difficult season, I do not pull back — I find I stay present even when I am not sure what to say or do.',
 'shepherding', 'SH-2', 'Instinct', 'A', 'AGR6', false, 'generally', 303),

(v, 'PS-004',
 'In the past 12 months, how often did you check in with someone you knew was going through an ongoing difficulty — not just at its peak, but weeks or months after the initial crisis?',
 'shepherding', 'SH-2', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 304),

(v, 'PS-005',
 'People I walk closely with tend to tell me things they say they have not told others — they describe feeling genuinely safe with me.',
 'shepherding', 'SH-3', 'Operating Style', 'A', 'AGR6', false, 'generally', 305),

(v, 'PS-006',
 'In the past 12 months, I can identify a time when someone shared something vulnerable about their life with me that they said they had not shared with others.',
 'shepherding', 'SH-3', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 306),

(v, 'PS-007',
 'When I sense that someone in my community is being put in a harmful situation or taken advantage of, I feel a strong impulse to step in on their behalf.',
 'shepherding', 'SH-4', 'Instinct', 'A', 'AGR6', false, 'generally', 307),

(v, 'PS-008',
 'In the past 12 months, I can identify a time when I acted to protect someone in my community from a situation or relationship that was causing them harm.',
 'shepherding', 'SH-4', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 308),

(v, 'PS-009',
 'A leader in a community you are part of begins to restrict who certain members can spend time with, framing it as protecting them from harmful influences. How do you respond?',
 'shepherding', 'SH-4', 'Operating Style', 'S', 'SC4', false, null, 309),

(v, 'PS-010',
 'I find it difficult to remain consistently present with people who are in intense or prolonged emotional pain.',
 'shepherding', 'SH-1', 'Shadow', 'F', 'AGR6', true, 'generally', 310),

(v, 'PS-012',
 'I have seen someone I walked with through a difficult season grow in their faith in ways they attributed partly to the consistency of my presence with them.',
 'shepherding', 'SH-2', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 311),

(v, 'PS-013',
 'In the past 12 months, I can identify a specific person whose emotional or spiritual state I tracked closely over multiple months — not because they asked me to, but because I noticed they needed consistent care.',
 'shepherding', 'SH-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 312);

-- SC4 options for PS-009
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I raise my concern with the leader directly and ask them to reconsider — the restriction may be creating the opposite of what they intend.', 1
FROM assessment_items WHERE pilot_id = 'PS-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I sit with the people being restricted and name my concern gently, then let them discern how to respond — it is their choice to make.', 2
FROM assessment_items WHERE pilot_id = 'PS-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I stay close to the people most affected and remain present whatever they decide, making sure they know they are not alone.', 3
FROM assessment_items WHERE pilot_id = 'PS-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I try to understand the leader''s concern first — there may be a genuine protective intent here that deserves a fair hearing before I respond.', 4
FROM assessment_items WHERE pilot_id = 'PS-009' AND version_id = v;


-- ============================================================
-- TEACHING DOMAIN — 12 items (PT-001 to PT-013, excl PT-010)
-- Constructs: TE-1, TE-2, TE-3, TE-4
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PT-001',
 'When I am helping someone understand a situation or make a decision, I almost always find myself reaching for Scripture as a primary reference point.',
 'teaching', 'TE-1', 'Instinct', 'A', 'AGR6', false, 'generally', 401),

(v, 'PT-002',
 'In the past 12 months, I can identify a time when I helped someone understand a situation in their life by grounding my response primarily in Scripture rather than general wisdom or experience.',
 'teaching', 'TE-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 402),

(v, 'PT-003',
 'People who hear me explain complex ideas tend to tell me they found it clear and accessible — that I put things in language that made sense for where they are.',
 'teaching', 'TE-2', 'Operating Style', 'A', 'AGR6', false, 'generally', 403),

(v, 'PT-004',
 'In the past 12 months, I can identify a time when someone told me that my explanation of something they had found confusing actually helped it click for them.',
 'teaching', 'TE-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 404),

(v, 'PT-005',
 'I often find myself continuing to pursue questions and ideas raised in a conversation or teaching long after the immediate context has moved on.',
 'teaching', 'TE-3', 'Instinct', 'A', 'AGR6', false, 'generally', 405),

(v, 'PT-006',
 'In the past 12 months, how often did you engage in extended study or research on a theological or ministry-related question — beyond what was required of you for a specific task?',
 'teaching', 'TE-3', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 406),

(v, 'PT-007',
 'When I teach or explain something, I am primarily motivated by whether it changes how people live — not whether they find the content interesting or impressive.',
 'teaching', 'TE-4', 'Operating Style', 'A', 'AGR6', false, 'generally', 407),

(v, 'PT-008',
 'In the past 12 months, I can identify a time when something I taught or explained contributed to a visible change in how someone approached their life or faith.',
 'teaching', 'TE-4', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 408),

(v, 'PT-009',
 'A teaching opportunity comes up that you did not prepare for and cannot fully develop in the time available. Which response feels most characteristic of you?',
 'teaching', 'TE-4', 'Operating Style', 'S', 'SC4', false, null, 409),

(v, 'PT-011',
 'I have seen someone change a concrete habit or behavior as a result of something I taught or explained to them.',
 'teaching', 'TE-4', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 410),

(v, 'PT-012',
 'I sometimes find that my attention to theological precision or depth makes it harder for people to stay with what I am saying.',
 'teaching', 'TE-3', 'Shadow', 'F', 'AGR6', true, 'generally', 411),

(v, 'PT-013',
 'In the past 12 months, I can identify a specific moment where my first instinct when someone asked for guidance was to turn to Scripture, and where doing so provided something that general advice would not have.',
 'teaching', 'TE-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 412);

-- SC4 options for PT-009
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I draw on a framework I have worked through before, adapting its core structure to fit this audience and situation.', 1
FROM assessment_items WHERE pilot_id = 'PT-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I am transparent about where I am in my own thinking and engage the people present in working through the question together.', 2
FROM assessment_items WHERE pilot_id = 'PT-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I focus entirely on practical application for this specific group, even if the theological grounding is lighter than I would prefer.', 3
FROM assessment_items WHERE pilot_id = 'PT-009' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I narrow down to one core idea I can make genuinely clear and useful, rather than covering more ground with less depth.', 4
FROM assessment_items WHERE pilot_id = 'PT-009' AND version_id = v;


-- ============================================================
-- APOSTOLIC DIRECTION — 10 items
-- PAD-001, PAD-002, PAD-004 to PAD-011
-- Constructs: FI-1, FI-2, FI-4, EC-1
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PAD-001',
 'I feel drawn toward places, communities, or contexts where the gospel has little or no presence — more than toward settings where Christians are already gathered.',
 'apostolic_direction', 'FI-1', 'Instinct', 'A', 'AGR6', false, 'generally', 501),

(v, 'PAD-002',
 'In the past 12 months, I can identify a time when I deliberately placed myself in a context where the gospel was not yet present — not primarily to serve or support existing Christians.',
 'apostolic_direction', 'FI-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 502),

(v, 'PAD-004',
 'I feel genuinely restless when the primary ministry focus around me is sustaining what already exists rather than reaching what does not yet exist.',
 'apostolic_direction', 'FI-2', 'Instinct', 'A', 'AGR6', false, 'generally', 503),

(v, 'PAD-005',
 'When I think about what excites me most about ministry, it has more to do with establishing something new than with sustaining something already established.',
 'apostolic_direction', 'FI-2', 'Operating Style', 'A', 'AGR6', false, 'generally', 504),

(v, 'PAD-006',
 'In the past 12 months, I can identify a time when I adapted how I communicated or approached ministry to fit a cultural context different from my own background or tradition.',
 'apostolic_direction', 'FI-4', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 505),

(v, 'PAD-007',
 'When I think about what a faith community could look like in a context where none currently exists, I find I have a fairly clear instinct about where to start — even before I know all the specifics.',
 'apostolic_direction', 'EC-1', 'Instinct', 'A', 'AGR6', false, 'generally', 506),

(v, 'PAD-008',
 'A ministry leader asks for your input on a new context where there is no existing faith community and no clear established model for how to proceed. Which response feels most natural to you?',
 'apostolic_direction', 'EC-1', 'Operating Style', 'S', 'SC4', false, null, 507),

(v, 'PAD-009',
 'In the past 12 months, I can identify a time when I meaningfully adjusted my approach — language, format, timing, or relational style — to connect more genuinely with people from a background different from my own.',
 'apostolic_direction', 'FI-4', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 508),

(v, 'PAD-010',
 'In the past 12 months, I can identify a time when I pursued a new initiative primarily because the existing situation felt limiting or unsatisfying, rather than because I had a clear sense of where I was going.',
 'apostolic_direction', 'FI-1', 'Shadow', 'F', 'EX6', true, 'past 12 months', 509),

(v, 'PAD-011',
 'In the past 12 months, I can identify a situation where I consciously invested time or energy in a context that was not yet producing visible results, rather than shifting focus to where traction was already present.',
 'apostolic_direction', 'FI-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 510);

-- SC4 options for PAD-008
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I would spend significant time listening and observing the context before suggesting any direction — understanding the context well is the necessary first step.', 1
FROM assessment_items WHERE pilot_id = 'PAD-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I would encourage beginning with small, reversible experiments to test what resonates in the context, staying open to what emerges from those early attempts.', 2
FROM assessment_items WHERE pilot_id = 'PAD-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I would help them identify and gather a small core group of interested people to begin building a shared vision together.', 3
FROM assessment_items WHERE pilot_id = 'PAD-008' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I would recommend partnering with an established church or organization that could provide structure, accountability, and resources for the new work.', 4
FROM assessment_items WHERE pilot_id = 'PAD-008' AND version_id = v;


-- ============================================================
-- APOSTOLIC FORMATION — 12 items (PAF-001 to PAF-012)
-- Constructs: SD-1, SD-2, SD-3, SD-4, SD-5, EC-2
-- Reverse-keyed: PAF-003, PAF-006, PAF-010, PAF-011
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PAF-001',
 'In the past 12 months, how often did you maintain a consistent personal practice of prayer and Scripture reading during seasons when ministry activity or visible results were minimal?',
 'apostolic_formation', 'SD-1', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 601),

(v, 'PAF-002',
 'In the past 12 months, I can identify a sustained period when personal prayer and Scripture remained important to me even when ministry activity or visible results were limited.',
 'apostolic_formation', 'SD-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 602),

(v, 'PAF-003',
 'I find that I can sustain my spiritual health and ministry effectiveness without regular input or accountability from others who know me well.',
 'apostolic_formation', 'SD-2', 'Shadow', 'F', 'AGR6', true, 'generally', 603),

(v, 'PAF-004',
 'When I face opposition, failure, or a long season without visible results, I find my sense of identity and purpose remains fairly stable.',
 'apostolic_formation', 'SD-3', 'Instinct', 'A', 'AGR6', false, 'generally', 604),

(v, 'PAF-005',
 'I find it possible to hold strong theological convictions while remaining genuinely flexible about how ministry approaches need to adapt in different contexts.',
 'apostolic_formation', 'SD-4', 'Operating Style', 'A', 'AGR6', false, 'generally', 605),

(v, 'PAF-006',
 'When a ministry initiative is not working after sustained effort, I tend to move on relatively quickly rather than persisting through the difficulty.',
 'apostolic_formation', 'SD-5', 'Shadow', 'F', 'AGR6', true, 'generally', 606),

(v, 'PAF-007',
 'In the past 12 months, how often did you pray for a specific named person, place, or community — not general prayer, but prayer with identifiable people or situations in mind?',
 'apostolic_formation', 'SD-1', 'Behavioral History', 'B', 'FREQ6', false, 'past 12 months', 607),

(v, 'PAF-008',
 'I find myself naturally creating gathering points — informal or structured — where people come together around shared spiritual purpose.',
 'apostolic_formation', 'EC-2', 'Instinct', 'A', 'AGR6', false, 'generally', 608),

(v, 'PAF-009',
 'In the past 12 months, I can identify a period of sustained difficulty, opposition, or fruitlessness in which I maintained my core ministry commitments without significant drift.',
 'apostolic_formation', 'SD-3', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 609),

(v, 'PAF-010',
 'I prefer to figure out my own direction in ministry rather than bring significant decisions to others for input or accountability.',
 'apostolic_formation', 'SD-2', 'Shadow', 'F', 'AGR6', true, 'generally', 610),

(v, 'PAF-011',
 'When people question the direction I am taking in ministry, I tend to find it significantly discouraging rather than useful.',
 'apostolic_formation', 'SD-5', 'Shadow', 'F', 'AGR6', true, 'generally', 611),

(v, 'PAF-012',
 'My ministry effectiveness is directly connected to the consistency of my personal spiritual practices — I notice the difference when they slip.',
 'apostolic_formation', 'SD-1', 'Operating Style', 'A', 'AGR6', false, 'generally', 612);


-- ============================================================
-- APOSTOLIC MULTIPLYING — 10 items (PAM-001 to PAM-010)
-- Constructs: DT-1, DT-2, DT-3, LE-1, LE-2, LE-3
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PAM-001',
 'I tend to see people in terms of their potential to grow as disciples — and that orientation shapes how I invest my time with them.',
 'apostolic_multiplying', 'DT-1', 'Instinct', 'A', 'AGR6', false, 'generally', 701),

(v, 'PAM-002',
 'In the past 12 months, I can identify a specific person in whom I made a deliberate, ongoing investment aimed at their growth as a disciple — not just friendship or pastoral support.',
 'apostolic_multiplying', 'DT-1', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 702),

(v, 'PAM-003',
 'When I mentor or teach someone, I am consistently thinking about whether they could pass what I am giving them to someone else — not just whether they are receiving it well.',
 'apostolic_multiplying', 'DT-2', 'Operating Style', 'A', 'AGR6', false, 'generally', 703),

(v, 'PAM-004',
 'In the past 12 months, I can identify something I taught or modeled in a way I specifically intended to be reproducible — and I know the person has since replicated it in some form.',
 'apostolic_multiplying', 'DT-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 704),

(v, 'PAM-005',
 'I notice leadership potential in people who are not yet being recognized or developed as leaders by others around them.',
 'apostolic_multiplying', 'LE-1', 'Perception', 'A', 'AGR6', false, 'generally', 705),

(v, 'PAM-006',
 'In the past 12 months, I can identify a person in whom I made a sustained, personalized investment specifically aimed at their development as a leader — distinct from their general spiritual growth.',
 'apostolic_multiplying', 'LE-2', 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 706),

(v, 'PAM-007',
 'You have identified someone with significant leadership potential who is ready for more intentional development. Which approach feels most characteristic of how you would invest in them?',
 'apostolic_multiplying', 'LE-2', 'Operating Style', 'S', 'SC4', false, null, 707),

(v, 'PAM-008',
 'I have seen someone I intentionally invested in as a disciple begin making disciples themselves.',
 'apostolic_multiplying', 'DT-3', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 708),

(v, 'PAM-009',
 'I have seen someone I walked with develop into a leader who is now leading others effectively.',
 'apostolic_multiplying', 'LE-2', 'Self-Reported Outcome', 'O', 'EX6', false, 'generally', 709),

(v, 'PAM-010',
 'I find it genuinely difficult to fully release ministry responsibilities or relationships when the time comes for someone else to take them over.',
 'apostolic_multiplying', 'DT-2', 'Shadow', 'F', 'AGR6', true, 'generally', 710);

-- SC4 options for PAM-007
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I give them increasing levels of responsibility and debrief with them regularly afterward — real development happens through action and reflection.', 1
FROM assessment_items WHERE pilot_id = 'PAM-007' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I invest significant personal time with them — modeling how I think, make decisions, and approach ministry situations as they come up.', 2
FROM assessment_items WHERE pilot_id = 'PAM-007' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I connect them with other leaders who can speak specifically into the areas where I see their greatest growth edges.', 3
FROM assessment_items WHERE pilot_id = 'PAM-007' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I put them in situations that appropriately stretch them, observe how they respond, and create space afterward to process what they are learning.', 4
FROM assessment_items WHERE pilot_id = 'PAM-007' AND version_id = v;


-- ============================================================
-- CROSS-FUNCTION — 8 items (PX-001 to PX-008)
-- These items are used to support cross-domain differentiation
-- and do not score to a single domain
-- ============================================================

INSERT INTO assessment_items
  (version_id, pilot_id, item_text, domain_key, construct_key, phenotype_layer,
   evidence_label, response_format, reverse_keyed, timeframe, sort_order) VALUES

(v, 'PX-001',
 'When you are with a group of people who are new to faith or exploring it, what do you find yourself most naturally doing?',
 'cross_function', null, 'Operating Style', 'FC', 'FC3', false, null, 801),

(v, 'PX-002',
 'When you sense something spiritually significant is happening in your community, what is your first instinct?',
 'cross_function', null, 'Instinct', 'FC', 'FC3', false, null, 802),

(v, 'PX-003',
 'When you picture the ministry context that feels most energizing to you, it more closely resembles:',
 'cross_function', null, 'Instinct', 'FC', 'FC2', false, null, 803),

(v, 'PX-004',
 'Someone in your community comes to you in the middle of a personal conflict with another person. Which response feels most natural?',
 'cross_function', null, 'Operating Style', 'FC', 'FC3', false, null, 804),

(v, 'PX-005',
 'A faith community you are part of is going through a significant season of transition. Which role do you most naturally find yourself in?',
 'cross_function', null, 'Operating Style', 'S', 'SC4', false, null, 805),

(v, 'PX-006',
 'When someone asks you for help with a decision, which response feels most like you?',
 'cross_function', null, 'Instinct', 'S', 'SC4', false, null, 806),

(v, 'PX-007',
 'I tend to have one or two ministry orientations that feel most like me — and people who know me well consistently confirm the pattern.',
 'cross_function', null, 'Perception', 'A', 'AGR6', false, 'generally', 807),

(v, 'PX-008',
 'In the past 12 months, I can identify a specific ministry contribution I made that felt deeply characteristic of how I am wired — not just something I was asked to do, but something that genuinely felt like me.',
 'cross_function', null, 'Behavioral History', 'B', 'EX6', false, 'past 12 months', 808);

-- FC3 options for PX-001
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'Helping people understand what they are experiencing — making sense of it through explanation and Scripture.', 1
FROM assessment_items WHERE pilot_id = 'PX-001' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'Noticing who seems uncertain or on the outside and staying close to them — making sure no one feels alone.', 2
FROM assessment_items WHERE pilot_id = 'PX-001' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'Looking for who in the room may be moving toward faith and making sure they have a clear next step.', 3
FROM assessment_items WHERE pilot_id = 'PX-001' AND version_id = v;

-- FC3 options for PX-002
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'Name what I am sensing and help the community understand its significance — the pattern needs to be identified before we can respond to it.', 1
FROM assessment_items WHERE pilot_id = 'PX-002' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'Figure out what this means for where the community should move next — significant moments are invitations to a new direction.', 2
FROM assessment_items WHERE pilot_id = 'PX-002' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'Make sure the people most vulnerable to disruption are cared for and protected through whatever is changing.', 3
FROM assessment_items WHERE pilot_id = 'PX-002' AND version_id = v;

-- FC2 options for PX-003
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'An existing community of people growing deeper in faith, care, and maturity together.', 1
FROM assessment_items WHERE pilot_id = 'PX-003' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'A new or forming community of people being gathered where nothing yet exists.', 2
FROM assessment_items WHERE pilot_id = 'PX-003' AND version_id = v;

-- FC3 options for PX-004
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'Help them understand what Scripture says about this kind of situation and how to apply it faithfully.', 1
FROM assessment_items WHERE pilot_id = 'PX-004' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'Sit with them, listen carefully to what they are experiencing, and focus primarily on their wellbeing through it.', 2
FROM assessment_items WHERE pilot_id = 'PX-004' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'Help them see what this conflict reveals about a larger pattern — in the relationship, in the community, or in themselves.', 3
FROM assessment_items WHERE pilot_id = 'PX-004' AND version_id = v;

-- SC4 options for PX-005
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'Helping people understand what is happening and what it means — giving the transition theological and narrative shape.', 1
FROM assessment_items WHERE pilot_id = 'PX-005' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'Staying close to the people who are most uncertain or struggling during the change, making sure they are not lost in the shuffle.', 2
FROM assessment_items WHERE pilot_id = 'PX-005' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'Helping the community see where this transition could lead — casting a picture of what could emerge on the other side.', 3
FROM assessment_items WHERE pilot_id = 'PX-005' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'Making sure people outside the community are not forgotten during the internal focus — keeping the outward orientation alive.', 4
FROM assessment_items WHERE pilot_id = 'PX-005' AND version_id = v;

-- SC4 options for PX-006
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'A', 'I ask questions to understand their situation more fully before offering any direction.', 1
FROM assessment_items WHERE pilot_id = 'PX-006' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'B', 'I share what I sense might be happening beneath the surface of the decision they are facing.', 2
FROM assessment_items WHERE pilot_id = 'PX-006' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'C', 'I open Scripture and work through what it has to say about their situation.', 3
FROM assessment_items WHERE pilot_id = 'PX-006' AND version_id = v;
INSERT INTO assessment_item_options (item_id, option_key, option_text, sort_order)
SELECT id, 'D', 'I focus on making sure they feel genuinely heard and supported before we think about what to do.', 4
FROM assessment_items WHERE pilot_id = 'PX-006' AND version_id = v;

END $$;
