'use strict';

const OpenAI = require('openai');

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  'https://covomultipliers.com',
  'https://www.covomultipliers.com',
  'https://mark-nyc.github.io',
];

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are helping a disciple-maker decide the next best moves with one real person.

You are not writing a full plan.
You are only generating short, practical next steps for one relationship.

VOICE:
- Direct
- Normal human language
- Specific
- No fluff
- No churchy jargon
- No corporate language
- No vague encouragement

GOAL:
Given the person's current conversation stage, the next stage, the barrier, and the setting, generate 3 to 4 concrete next steps that feel natural in real life.

RULES:
1. Return ONLY valid JSON.
2. The JSON must have exactly this shape:
{
  "steps": ["string", "string", "string"]
}
3. Each step must be short. Aim for 8 to 18 words.
4. Each step must be concrete and actionable.
5. Use the setting and barrier to make the steps realistic.
6. Do not repeat the same step reworded.
7. Do not give generic advice like "pray more" or "be intentional."
8. Do not sound robotic, preachy, or polished.
9. If a text message or sentence would help, make it sound like a real person would say it.
10. Focus on movement to the next stage, not long-term discipleship strategy.

STAGE INTENT:
- Casual to Meaningful: help them get past small talk and into real life conversation.
- Meaningful to Spiritual: help them bring up faith naturally without forcing it.
- Spiritual to Discovery: help them invite a real response or next step.
- Discovery and beyond: help them build momentum, obedience, and consistency.

Return only JSON.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanSteps(steps) {
  if (!Array.isArray(steps)) return [];

  return steps
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!isObject(req.body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object.' });
  }

  const {
    person,
    stage,
    nextStage,
    lane,
    laneFramework,
    setting,
    oikosType,
    barrier,
    notes,
  } = req.body;

  if (!person || !stage || !barrier) {
    return res.status(400).json({
      error: 'person, stage, and barrier are required.',
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set.');
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not configured on the server.',
    });
  }

  const openai = new OpenAI({ apiKey });

  const userPrompt = `Generate next steps for this relationship.

Person: ${person}
Current stage: ${stage}
Next stage: ${nextStage || 'deeper investment'}
Lane: ${lane || 'general'}
Framework lane: ${laneFramework || ''}
Setting: ${setting || ''}
Oikos type: ${oikosType || ''}
Barrier: ${barrier || ''}
Notes: ${notes || ''}

Return 3 to 4 short next steps as JSON.`;

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
    });
  } catch (err) {
    console.error('OpenAI API error:', err);
    return res.status(502).json({
      error: 'Failed to reach the AI service. Please try again.',
    });
  }

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== 'string') {
    console.error('OpenAI returned empty or non-string content:', raw);
    return res.status(500).json({
      error: 'AI returned an empty response. Please try again.',
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse OpenAI response as JSON:', raw);
    return res.status(500).json({
      error: 'AI returned a malformed response. Please try again.',
    });
  }

  const steps = cleanSteps(parsed.steps);

  if (!steps.length) {
    console.error('AI returned no usable steps:', parsed);
    return res.status(500).json({
      error: 'AI response was incomplete. Please try again.',
    });
  }

  return res.status(200).json({ steps });
};
