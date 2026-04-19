// generate-plan.js
//
// POST /api/generate-plan
//
// Accepts: { payload: { ...buildPayload() output from six-week-plan.html... } }
// Returns: parsed plan JSON matching the frontend renderer schema
//
// Required environment variable:
//   OPENAI_API_KEY  — OpenAI secret key, never sent to the client
//
// Wiring (Express):
//   const generatePlan = require('./generate-plan');
//   app.post('/api/generate-plan', express.json(), generatePlan);

'use strict';

const OpenAI = require('openai');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a disciple-making coach for covocational believers.
Generate a personalized, structured 6-week disciple-making plan.

RULES — follow these exactly:
- Choose ONE primary lane. Do not treat all 4 Ps equally.
- Use the user's actual subtype label in your language.
- Use the user's actual named people.
- Honor each person's relational stage: casual, meaningful, spiritual, discovery.
- Diagnose ONE primary bottleneck clearly.
- Suggest rhythms from existing life only — not invented margin.
- Keep tone direct, practical, grounded. Not preachy. Not corporate.
- Every section must imply action this week.
- Avoid churchy abstraction. Sound like a coach who knows the framework.

OUTPUT FORMAT — respond ONLY with valid JSON matching this schema exactly.
No markdown fences. No explanation. Just the JSON object.

{
  "starting_lane": { "name": "string", "reason": "string" },
  "lane_application": { "subtype": "string", "summary": "string" },
  "focus_people": [
    { "name": "string", "stage": "string", "reason": "string" }
  ],
  "diagnosis": { "primary_block": "string", "explanation": "string" },
  "first_move": {
    "person": "string",
    "stage": "string",
    "timing": "string",
    "reason": "string",
    "action": "string",
    "suggested_line": "string"
  },
  "weekly_rhythm": {
    "summary": "string",
    "this_week": ["string", "string", "string"]
  },
  "conversation_help": {
    "casual_to_meaningful": "string",
    "meaningful_to_spiritual": "string",
    "spiritual_to_discovery": "string"
  },
  "six_week_plan": [
    { "week": 1, "focus": "string", "action": "string" },
    { "week": 2, "focus": "string", "action": "string" },
    { "week": 3, "focus": "string", "action": "string" },
    { "week": 4, "focus": "string", "action": "string" },
    { "week": 5, "focus": "string", "action": "string" },
    { "week": 6, "focus": "string", "action": "string" }
  ],
  "cta": {
    "headline": "string",
    "primary_action": "string",
    "secondary_action": "string"
  }
}`;

// Top-level keys the frontend renderer requires.
const REQUIRED_KEYS = [
  'starting_lane',
  'lane_application',
  'focus_people',
  'diagnosis',
  'first_move',
  'weekly_rhythm',
  'conversation_help',
  'six_week_plan',
  'cta',
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function generatePlan(req, res) {
  // Accept POST only.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Validate request body shape.
  const { payload } = req.body || {};
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body must include a payload object.' });
  }

  // Validate that the payload carries the minimum fields the prompt needs.
  if (!payload.user_context || !Array.isArray(payload.people)) {
    return res.status(400).json({
      error: 'payload must include user_context and people array.',
    });
  }

  // Initialise the OpenAI client from the server-side environment.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set.');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const openai = new OpenAI({ apiKey });

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Here is my disciple-making context. Generate my personalized 6-week plan as JSON:\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });
  } catch (err) {
    console.error('OpenAI API error:', err);
    return res.status(502).json({ error: 'Failed to reach the AI service. Please try again.' });
  }

  // Parse the returned JSON.
  const raw = completion.choices?.[0]?.message?.content ?? '';
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse OpenAI response as JSON:', raw);
    return res.status(500).json({ error: 'AI returned a malformed response. Please try again.' });
  }

  // Validate that the plan contains every key the frontend renderer expects.
  const missing = REQUIRED_KEYS.filter(k => !(k in plan));
  if (missing.length > 0) {
    console.error('Plan missing required keys:', missing, plan);
    return res.status(500).json({ error: 'AI response was incomplete. Please try again.' });
  }

  return res.status(200).json(plan);
};
