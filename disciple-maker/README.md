# Disciple Maker Pathway Assessment

A diagnostic tool that identifies where someone is on their disciple-making journey and recommends their next step.

## What This Is

This is NOT:
- ❌ A personality test
- ❌ An APEST assessment
- ❌ A spiritual gifts inventory
- ❌ A Bible knowledge quiz

This IS:
- ✅ A coaching tool that diagnoses bottlenecks
- ✅ An 8-dimension radar chart showing current state
- ✅ Four pathway recommendations (Explorer, Practitioner, Multiplier, Catalyst)
- ✅ Personalized encouragement and next steps
- ✅ A funnel to WhatsApp community

## Design Philosophy

The assessment reflects CoVo Multipliers' DNA:

- **Apprenticeship over information** — Questions measure behavior, not knowledge
- **Practice over theory** — Focus on what people are doing, not what they know
- **Obedience over knowledge** — "Did you?" not "Do you know?"
- **Coaching over content** — Results are diagnostic, not prescriptive
- **Multiplication over accumulation** — Celebrates reproducing disciples
- **Ordinary believers living on mission** — Assumes everyone can make disciples
- **Temporary incompetence is expected** — "Even if you don't feel ready"

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

#### Explorer
- **Characteristics**: Inspired by vision + little practice + willing to learn
- **Bottleneck**: Needs confidence to take first steps
- **Next Step**: Monthly Lab + one Follow & Fish challenge

#### Practitioner
- **Characteristics**: Already taking action + needs consistency + wants accountability
- **Bottleneck**: Building weekly rhythms
- **Next Step**: WhatsApp community + weekly Follow & Fish + Monthly Labs

#### Multiplier
- **Characteristics**: Making disciples + wants sharpening + community
- **Bottleneck**: Developing and multiplying leaders
- **Next Step**: Online Simple Multiplier Church + Shoulder-to-shoulder coaching + Leadership cohort

#### Catalyst
- **Characteristics**: Multiplying leaders + helping others multiply + thinks beyond personal ministry
- **Bottleneck**: Scaling movement impact
- **Next Step**: CoVo Institute + Coaching emerging multipliers + Leadership cohort

## User Flow

1. **Substack article** (external)
   ↓
2. **CTA**: "Ready to stop reading and start practicing?"
   ↓
3. **`/disciple-maker/index.html`** — Assessment landing
   ↓
4. **`/disciple-maker/intake.html`** — Collect name/email
   ↓
5. **`/disciple-maker/take.html`** — Answer 50 questions (15–20 min)
   ↓
6. **`/disciple-maker/results.html`** — See radar chart + pathway
   ↓
7. **WhatsApp CTA** — Join community (everyone gets same CTA)
   ↓
8. **In WhatsApp**: Coaches see pathway, invite to coaching/church/labs

## Key Features

### Radar Chart Visualization
Shows 8 dimensions scored 1–5 with visual clarity on where someone is strong and where they need to grow.

### Pathway Identification
Algorithm identifies best-fit pathway based on pattern of scores, not total score. Two people with same average can be in different pathways based on which dimensions are high.

### Personalized Results
Each pathway gets:
- Validation (affirms where they are)
- Clarity (explains their stage)
- Direction (what's next)
- Encouragement (makes them feel capable)
- Next reps (specific actions this week)
- Unified CTA (join WhatsApp)

### Auto-Save & Resume
- Questions auto-save after each response
- Users can "Save & Exit" and resume later
- Resume link asks for email to find their session

### No Public Scaling
- Results accessible only via secure token
- No public results page or gallery
- Results not stored permanently (unless needed for coaching notes)

## Technical Stack

### Frontend
- Vanilla HTML + JavaScript (no framework)
- Responsive design
- Chart.js for radar visualization

### Backend
- Supabase PostgreSQL
- Supabase Edge Functions (TypeScript/Deno)
- Token-based security (SHA-256 hashes)

### Deployment
- Static files in `/disciple-maker/` directory
- Edge functions in `/supabase/functions/`
- Database schema via migrations

## Files

### HTML Pages
- `index.html` — Landing page
- `intake.html` — Intake form
- `take.html` — Assessment questions
- `results.html` — Personalized results
- `resume.html` — Resume assessment

### Configuration
- `config.js` — Supabase endpoint
- `questions.js` — Assessment questions & dimensions

### Edge Functions
- `disciple-maker-start` — Initialize session
- `disciple-maker-submit` — Submit responses
- `disciple-maker-results` — Retrieve results
- `disciple-maker-resume` — Resume session

### Database
- Migration: `20260626000000_disciple_maker_assessment.sql`

### Documentation
- `SETUP.md` — Deployment instructions
- `README.md` — This file

## Deployment

1. **Run database migration**
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**
   ```bash
   supabase functions deploy disciple-maker-{start,submit,results,resume}
   ```

3. **Push to production**
   ```bash
   git push origin claude/disciple-maker-pathway-assessment-629r5g
   ```

See `SETUP.md` for detailed instructions.

## Customization

### Update Questions
Edit `questions.js` to change questions, dimensions, or scale.

### Update Pathways
Edit `pathways` object in `results.html` to change:
- Conditions for each pathway
- Descriptions and messaging
- Strengths/growth areas
- Next reps actions
- WhatsApp invitation copy

### Update Styling
Global styles in `/styles.css` + inline styles in each HTML file.

### Update WhatsApp Link
Change WhatsApp CTA in `results.html` line where it says `Join the WhatsApp Community`.

## Testing Checklist

- [ ] Complete intake flow
- [ ] Answer all 50 questions
- [ ] Verify auto-save works
- [ ] Submit assessment
- [ ] See results page load
- [ ] Radar chart renders correctly
- [ ] All four pathways can be reached
- [ ] WhatsApp CTA works
- [ ] Resume flow works
- [ ] Mobile responsive

## Next Steps

1. Customize WhatsApp link in results page
2. Add tracking to Substack article
3. Set up monitoring for assessment submissions
4. Prepare coaches to interpret pathway data
5. Create follow-up email sequence post-assessment
6. Gather feedback from first cohort

## Support

See `SETUP.md` for troubleshooting and configuration help.

---

**Status**: Ready to deploy
**Last Updated**: June 26, 2026
