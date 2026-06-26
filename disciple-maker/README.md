# Disciple Maker Pathway Assessment

A diagnostic tool that identifies where someone is on their disciple-making journey and recommends their next step.

## What This Is

This is NOT:
- ❌ A personality test
- ❌ An APEST assessment  
- ❌ A spiritual gifts inventory
- ❌ A Bible knowledge quiz
- ❌ An approval gate for programs
- ❌ A way to assign identity or stage labels

This IS:
- ✅ A coaching tool that diagnoses where you are
- ✅ An 8-dimension radar chart showing current state
- ✅ Concrete observations about your practice
- ✅ Specific growth edges to pursue
- ✅ Actionable next steps for this week
- ✅ A pathway to community practice (WhatsApp)

## The Core Model

**Assessment → Coaching Conversation → Next Step → WhatsApp Community**

The assessment asks one question: **What is your next step?**

It is NOT asking: "Who are you?" or "What stage are you at?"

Results page shows:
- Your current snapshot (radar chart + 8 dimensions)
- Three concrete observations based on your responses
- Your biggest growth edge (1-2 areas to accelerate)
- Your next rep this week (3 actionable practices)
- Encouragement rooted in apprenticeship, not achievement

There are NO pathway labels shown to users. No categories. No stages.

Everyone joins the same WhatsApp community where:
- People practice together
- Coaches observe real behavior
- Stories and encouragement are shared
- Deeper programs emerge from participation

**Three tiers:**
1. **Public** — Labs, Immersions (explore anytime)
2. **Shared practice** — WhatsApp (everyone joins here)
3. **Discerned** — Online Church, Coaching, Institute (from WhatsApp participation)

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

### 8 Dimensions (32 questions total, 4 per dimension)

1. **Vision** (4 q) — Do they believe in the mission?
2. **Obedience** (4 q) — Are they practicing?
3. **Consistency** (4 q) — Are they faithful week after week?
4. **Coachability** (4 q) — Will they let someone sharpen them?
5. **Everyday Mission** (4 q) — Do they know where God sent them?
6. **Multiplication** (4 q) — Are they helping others reproduce?
7. **Dependence on Holy Spirit** (4 q) — Are they Spirit-led?
8. **Hunger** (4 q) — Do they actually want this?

### 5-Point Likert Scale

1 = Strongly Disagree
2 = Disagree
3 = Neutral
4 = Agree
5 = Strongly Agree

### Internal Pathway Logic (Not Shown to Users)

The assessment still calculates four internal pathways for analytics and coaching notes:

- **Explorer**: Vision + limited practice + willing to learn → Next step: Build confidence through first practices
- **Practitioner**: Active practice + low consistency + coachable → Next step: Build weekly rhythms
- **Multiplier**: Making disciples + consistent + multiplication mindset → Next step: Develop emerging leaders
- **Catalyst**: Multiplying leaders + systemic thinking + scaling → Next step: Help multipliers scale

**Critical:** These labels never appear on the results page. Users see observations and growth edges instead. Coaches use pathways internally for understanding patterns, but users experience coaching conversation, not categorization.

## User Flow

1. **Substack article** (external)  → Assessment CTA
2. **Assessment** → 32 questions, radar chart, pathway ID
3. **Results page** → Radar chart + pathway + bottleneck diagnosis + next rep
4. **Single CTA**: Join the CoVo WhatsApp Community
5. **In WhatsApp** → Practice, conversation, Follow & Fish, coach observation
6. **Discernment** → Coaches invite to programs when appropriate

## Key Features

### Radar Chart Visualization
Shows 8 dimensions scored 1–5 with clear visual of current state.

### Coaching Conversation Structure
Results page follows coaching flow:
1. **Where You Are Right Now** — Radar chart + dimension summary
2. **What We're Seeing** — Three observations based on responses
3. **Your Biggest Growth Edge** — One or two areas to accelerate
4. **Your Next Rep This Week** — Three actionable practices
5. **Encouragement** — Reframes via apprenticeship, not achievement

### Observations vs. Labels
Instead of assigning a stage ("You're a Catalyst"), the assessment:
- Makes concrete observations ("You're already multiplying leaders")
- Identifies growth edges ("Help emerging multipliers scale")
- Recommends specific practices ("Coach one person this week")
- Encourages humility ("Growth happens through practice")

### Single CTA, Same for Everyone
Everyone gets identical invitation to WhatsApp community. No pathway-specific guidance. No program routing.

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
- [ ] Answer all 32 questions
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
