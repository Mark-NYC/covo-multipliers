# Disciple Maker Pathway Assessment

A diagnostic tool that identifies where someone is on their disciple-making journey and recommends their next step.

## What This Is

This is NOT:
- ❌ A personality test
- ❌ An APEST assessment  
- ❌ A spiritual gifts inventory
- ❌ A Bible knowledge quiz
- ❌ An approval gate for programs

This IS:
- ✅ A coaching tool that diagnoses bottlenecks
- ✅ An 8-dimension radar chart showing current state
- ✅ Four pathway recommendations (Explorer, Practitioner, Multiplier, Catalyst)
- ✅ Personalized encouragement and next steps
- ✅ A funnel to WhatsApp (the discernment space)

## The Core Model

**Assessment → Results → WhatsApp → Discernment → Programs**

Assessment does NOT approve people into Labs, Online Simple Multiplier Church, coaching, immersion, or Institute.

Assessment identifies where someone is and what their bottleneck is.

Then everyone joins the WhatsApp community where:
- They practice
- Coaches observe
- Real discernment happens
- When appropriate, people are invited toward specific programs

WhatsApp is not a destination. It's where the real coaching begins.

## Design Philosophy

The assessment reflects CoVo Multipliers' DNA:

- **Apprenticeship over information** — Questions measure behavior, not knowledge
- **Practice over theory** — Focus on what people are doing, not what they know
- **Obedience over knowledge** — "Did you?" not "Do you know?"
- **Coaching over content** — Results are diagnostic, not prescriptive
- **Multiplication over accumulation** — Celebrates reproducing disciples
- **Ordinary believers living on mission** — Assumes everyone can make disciples
- **Temporary incompetence is expected** — "Even if you don't feel ready"
- **Discernment happens in community** — Not through algorithms

## Assessment Structure

### 8 Dimensions (50 questions total)

1. **Vision** (6 q) — Do they believe in the mission?
2. **Obedience** (8 q) — Are they practicing?
3. **Consistency** (7 q) — Are they faithful week after week?
4. **Coachability** (8 q) — Will they let someone sharpen them?
5. **Everyday Mission** (7 q) — Do they know where God sent them?
6. **Multiplication** (6 q) — Are they helping others reproduce?
7. **Dependence on Holy Spirit** (6 q) — Are they Spirit-led?
8. **Hunger** (6 q) — Do they actually want this?

### 5-Point Likert Scale

1 = Strongly Disagree
2 = Disagree
3 = Neutral
4 = Agree
5 = Strongly Agree

### Four Pathways

Each pathway has different WhatsApp entry guidance (not different CTAs).

#### Explorer
- **Characteristics**: Inspired by vision + little practice + willing to learn
- **Bottleneck**: Needs confidence to take first steps
- **WhatsApp guidance**: Join and start with one small practice. Watch others practicing. Attend a Lab when ready.

#### Practitioner
- **Characteristics**: Already taking action + needs consistency + wants accountability
- **Bottleneck**: Building weekly rhythms
- **WhatsApp guidance**: Join and post Follow & Fish goals. Share weekly practice updates. Look for coaching and accountability.

#### Multiplier
- **Characteristics**: Making disciples + wants sharpening + wants community
- **Bottleneck**: Developing and multiplying leaders
- **WhatsApp guidance**: Join and share what you are already practicing. Help others take reps. Discern next steps toward Online Simple Multiplier Church, coaching, or immersion.

#### Catalyst
- **Characteristics**: Multiplying leaders + helping others multiply + thinks beyond personal ministry
- **Bottleneck**: Scaling movement impact
- **WhatsApp guidance**: Join and identify where you're multiplying disciples, leaders, or churches. Help sharpen the community. Discern fit for coaching, Institute, or leadership development.

## User Flow

1. **Substack article** (external)  → Assessment CTA
2. **Assessment** → 50 questions, radar chart, pathway ID
3. **Results page** → Radar chart + pathway + bottleneck diagnosis + next rep
4. **Single CTA**: Join the CoVo WhatsApp Community
5. **In WhatsApp** → Practice, conversation, Follow & Fish, coach observation
6. **Discernment** → Coaches invite to programs when appropriate

## Key Features

### Radar Chart Visualization
Shows 8 dimensions scored 1–5 with clear visual on strengths and growth areas.

### Bottleneck Diagnosis
Algorithm identifies best-fit pathway based on pattern of scores. Two people with same average can be in different pathways based on which dimensions are high.

### Personalized Results
Each pathway gets:
- Validation (affirms where they are)
- Clarity (explains their stage)
- Direction (what's next rep)
- Encouragement (makes them feel capable)
- Next reps (specific actions this week)
- WhatsApp guidance (what to expect when they join)

### Single CTA
Everyone gets the same call-to-action: Join the WhatsApp community.

### No Program Routing
Results page does NOT direct people to Labs, Online Church, coaching, immersion, or Institute.

### Auto-Save & Resume
- Questions auto-save after each response
- Users can "Save & Exit" and resume later
- Resume link asks for email to find their session

### Secure Token Access
- Results accessible only via secure token
- No public results page
- Results not stored permanently (stored in session, not in results table)

## Technical Stack

### Frontend
- Vanilla HTML + JavaScript (no framework)
- Responsive design
- Chart.js for radar visualization

### Backend
- Supabase PostgreSQL (dedicated tables)
- Supabase Edge Functions (TypeScript/Deno)
- Token-based security (SHA-256 hashes)

### Deployment
- Static files in `/disciple-maker/` directory
- Edge functions in `/supabase/functions/`
- Database schema via migrations (dedicated tables)

## Files

### HTML Pages
- `index.html` — Landing page
- `intake.html` — Intake form (name, email, optional org)
- `take.html` — Assessment questions
- `results.html` — Personalized results with radar chart
- `resume.html` — Resume assessment

### Configuration
- `config.js` — Supabase endpoint
- `questions.js` — Assessment questions & dimensions

### Edge Functions
- `disciple-maker-start` — Initialize session
- `disciple-maker-submit` — Submit responses, calculate pathway
- `disciple-maker-results` — Retrieve results
- `disciple-maker-resume` — Resume session

### Database
- Migration: `20260626000000_disciple_maker_assessment.sql`
- Dedicated tables: `disciple_maker_sessions`, `disciple_maker_responses`

### Documentation
- `README.md` — This file
- `SETUP.md` — Deployment instructions

## What Gets Saved

### In `disciple_maker_sessions`:
- email, first_name, organization
- session_token_hash (for resume)
- results_token_hash (for results access)
- pathway, strongest_dimension, lowest_dimension, bottleneck
- dimension_scores (JSON)
- status, created_at, completed_at

### In `disciple_maker_responses`:
- session_id, question_id, dimension, score, created_at

NO raw tokens are stored. Only SHA-256 hashes.

## Deployment

1. **Run database migration**
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**
   ```bash
   supabase functions deploy disciple-maker-start
   supabase functions deploy disciple-maker-submit
   supabase functions deploy disciple-maker-results
   supabase functions deploy disciple-maker-resume
   ```

3. **Update WhatsApp link**
   In `results.html`, update the WhatsApp CTA URL to your group invite.

4. **Test the flow**
   - Complete intake → assessment → results
   - Verify WhatsApp link works
   - Test resume flow

5. **Link from Substack**
   Add CTA to your article pointing to `/disciple-maker/`

See `SETUP.md` for detailed instructions.

## Customization

### Update Questions
Edit `questions.js` to change questions, dimensions, or scale.

### Update Pathways
Edit `pathways` object in `results.html` to change:
- Descriptions
- Strengths/growth areas
- Encouragement messages
- Next reps
- WhatsApp guidance

### Update Styling
Global styles in `/styles.css` + inline styles in each HTML file.

### Update WhatsApp Link
Change WhatsApp CTA in `results.html` to your group invite.

## Testing Checklist

- [ ] Complete intake flow
- [ ] Answer all 50 questions
- [ ] Verify auto-save works
- [ ] Submit assessment
- [ ] See results page load
- [ ] Radar chart renders
- [ ] All four pathways can be reached
- [ ] WhatsApp CTA has correct link
- [ ] Resume flow works
- [ ] Mobile responsive

## Important Principles

**Assessment is diagnostic, not prescriptive.**
It identifies where someone is and what's holding them back. It doesn't assign them to programs or levels.

**WhatsApp is the discernment space.**
Coaches see the pathway data, watch people practice, have conversations, and then invite people toward appropriate next steps.

**Everyone joins WhatsApp.**
There is no differentiated entry point. Everyone gets the same CTA. Differentiation happens inside WhatsApp based on coach observation.

**Results page respects the journey.**
No one is told "you're not ready." Every pathway gets encouragement and practical next steps.

---

**Status**: Ready to deploy (revised with dedicated tables & corrected model)
**Last Updated**: June 26, 2026
