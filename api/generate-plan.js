// api/generate-plan.js
//
// POST /api/generate-plan  (Vercel serverless function)
//
// Accepts: { payload: { ...buildPayload() output from six-week-plan.html... } }
// Returns: parsed plan JSON matching the frontend renderer schema
//
// Required environment variable:
//   OPENAI_API_KEY  — OpenAI secret key, never sent to the client
//
// Vercel routes api/generate-plan.js to /api/generate-plan automatically.
// req.body is pre-parsed for application/json requests — no middleware needed.

'use strict';

const OpenAI = require('openai');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a sharp, experienced disciple-making coach for covocational believers.
You have seen hundreds of people stall out and you know exactly why.
You do not encourage vaguely. You diagnose accurately and tell people what to do.

VOICE AND TONE:
- Sound like a coach who has been in the room with this person for an hour, not like a chatbot.
- Direct. Specific. A little bit blunt where it helps.
- No filler phrases: not "it's important to", not "consider trying", not "remember that".
- No churchy abstraction: not "kingdom rhythms", not "gospel intentionality", not "spiritual conversations" as a vague catch-all.
- No corporate motivational language: not "leverage", not "maximize", not "unlock your potential".
- Write like you are talking to one real person about their actual life.

RULES — follow these exactly:
1. LANE: Pick ONE lane only. Do not hedge or split the focus. Name the subtype explicitly.
   The "reason" must say why THIS lane fits THIS person — not why lanes matter in general.

2. PEOPLE: Use the user's actual names throughout. Do not swap in "your contact" or "this person."
   For each focus person, name the specific reason they're worth prioritizing right now based on their stage.
   Do not list everyone — pick the ones where momentum is actually possible.

3. DIAGNOSIS: One bottleneck. Not a list. Name the real structural problem — time, relational depth, fear, no clear next step, wrong people — whatever fits the data.
   The explanation must be 2–3 sentences that feel uncomfortably accurate, not reassuring.

4. FIRST MOVE: Concrete. One person, one action, one line to say or send.
   The timing must be specific (e.g. "Tuesday at lunch" or "this weekend") — not "soon" or "this week."
   The suggested_line must be a real thing a human would actually say or text.

5. RHYTHMS: Pull from the user's existing life — their job, commute, kids, routines.
   Do not suggest inventing new margin. If they have no free time, find the rhythm inside what they already do.
   "Do this" must be a concrete weekly action, not a posture or mindset.
   "If that week falls apart" must be a real minimum, not just "try again."

6. SIX-WEEK PLAN: Each week must have a different focus. Do not repeat the same action rephrased.
   Each action must be specific enough that the user knows exactly what to do on Monday.

7. CONVERSATION HELP: Write actual lines a normal human would say in a normal setting.
   Not gospel presentations. Not spiritual segues. Real sentences that move a relationship one step forward.

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

module.exports = async function handler(req, res) {
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
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
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
  const raw = completion.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    console.error('OpenAI returned empty or non-string content:', raw);
    return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });
  }
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
