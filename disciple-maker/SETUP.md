# Disciple Maker Pathway Assessment — Setup Instructions

## Overview

The Disciple Maker Pathway Assessment is a standalone assessment that identifies where someone is on their disciple-making journey and recommends their next step. It uses the same Supabase backend as the Fivefold Stewardship Assessment but is fully independent.

## Architecture

- **Frontend**: Static HTML + vanilla JavaScript (no framework)
- **Backend**: Supabase PostgreSQL + Edge Functions
- **Assessment Type**: 8-dimension radar chart with pathway identification
- **Pathways**: Explorer, Practitioner, Multiplier, Catalyst

## Files

### Frontend (HTML)
- `index.html` - Landing page
- `intake.html` - Collect name/email
- `take.html` - The assessment questions
- `results.html` - Show radar chart + personalized results
- `resume.html` - Resume an in-progress assessment

### Configuration
- `config.js` - Supabase Functions endpoint
- `questions.js` - Assessment questions & dimensions

### Backend (Supabase Edge Functions)
- `disciple-maker-start` - Initialize session
- `disciple-maker-submit` - Submit responses
- `disciple-maker-results` - Retrieve results
- `disciple-maker-resume` - Resume in-progress assessment

## Deployment Steps

### 1. Run Database Migration

Apply the migration that adds disciple-maker support to assessment_sessions:

```bash
supabase db push
```

The migration adds:
- `assessment_type` column (distinguishes fivefold vs disciple-maker)
- `results_token_hash` and `completed_at` columns
- `question_id` column to assessment_responses
- Necessary indexes

### 2. Deploy Edge Functions

```bash
supabase functions deploy disciple-maker-start
supabase functions deploy disciple-maker-submit
supabase functions deploy disciple-maker-results
supabase functions deploy disciple-maker-resume
```

### 3. Verify Configuration

Check that `config.js` has the correct Supabase URL:

```javascript
window.DISCIPLE_MAKER_CONFIG = {
  SUPABASE_FUNCTIONS: "https://YOUR_PROJECT.supabase.co/functions/v1"
};
```

Currently set to: `https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1`

### 4. Test Locally (Optional)

```bash
# Start a local Supabase instance
supabase start

# Test the assessment at http://localhost:8000/disciple-maker/
```

### 5. Deploy to Production

Push the `/disciple-maker/` directory to your production server at `/disciple-maker/`.

Update any links in your Substack or blog to point to `/disciple-maker/`.

## How It Works

### Assessment Flow

1. **User lands on** `/disciple-maker/index.html`
   - Sees overview of the assessment
   - Clicks "Start the Checkup"

2. **Intake** `intake.html`
   - Collects: first_name, email, optional church/org
   - Posts to `disciple-maker-start` function
   - Receives: session_id and resume_token
   - Stores in sessionStorage
   - Redirects to `take.html`

3. **Taking Assessment** `take.html`
   - Shows 50 questions (8 dimensions × 6-8 questions each)
   - 5-point Likert scale (Strongly Disagree → Strongly Agree)
   - Single question per screen
   - Auto-saves after each response
   - Progress bar shows completion
   - "Submit Checkup" appears on last question

4. **Submit** `take.html` → `results.html`
   - Posts responses to `disciple-maker-submit`
   - Receives results_token
   - Redirects to `results.html?r=<token>`

5. **Results** `results.html`
   - Fetches results using `disciple-maker-results` function
   - Displays radar chart (8 dimensions)
   - Identifies pathway: Explorer, Practitioner, Multiplier, or Catalyst
   - Shows personalized:
     - Strengths (3)
     - Growth areas (3)
     - Encouragement message
     - Next reps for this week (3 actions)
   - CTA: Join the WhatsApp community

### Resume Flow

1. User clicks "Resume your checkup" on `index.html`
2. Enters their email at `resume.html`
3. Posts to `disciple-maker-resume` function
4. Function finds most recent in_progress session
5. Generates new resume token
6. Redirects to `take.html`

## Database Schema

### assessment_sessions (extended)

```sql
-- New columns:
assessment_type           text -- 'fivefold' or 'disciple_maker'
results_token_hash        text -- SHA-256 hash for secure results access
completed_at              timestamptz -- When assessment was completed
version_id                uuid -- Now nullable (only for fivefold)
```

### assessment_responses (extended)

```sql
-- New columns:
question_id               text -- Question ID from questions.js (for disciple-maker)
score                     numeric -- Response score 1-5 (for disciple-maker)
```

## Pathway Determination

The assessment calculates average scores across 8 dimensions:

1. **Vision** - Do they believe in the mission?
2. **Obedience** - Are they practicing?
3. **Consistency** - Are they faithful?
4. **Coachability** - Will they let someone sharpen them?
5. **Everyday Mission** - Do they know where God sent them?
6. **Multiplication** - Are they helping others reproduce?
7. **Dependence on Holy Spirit** - Are they Spirit-led?
8. **Hunger** - Do they actually want this?

### Pathway Rules

- **Explorer**: High vision + low obedience + high coachability
- **Practitioner**: High obedience + low consistency + high coachability
- **Multiplier**: High obedience + high consistency + high multiplication
- **Catalyst**: Everything high (or falls through to highest dimension)

Each pathway receives different messaging but the same CTA: Join the WhatsApp community.

## Security

### Token-Based Access

Results are accessed using a secure token pattern:

1. `resume_token` - Used to resume in-progress assessment
   - Stored as SHA-256 hash in database
   - Token itself never stored plain
   - Prevents unauthorized access to someone else's session

2. `results_token` - Used to view results
   - Stored as SHA-256 hash in database
   - Token passed in URL (`results.html?r=<token>`)
   - Used to retrieve results via `disciple-maker-results` function

Both tokens are 64-character hex strings (256 bits) generated by `crypto.getRandomValues()`.

### CORS

Only these origins are allowed:
- https://covomultipliers.com
- https://www.covomultipliers.com

Update in edge functions if you need additional origins.

## Customization

### Changing Questions

Edit `questions.js`:
- Add/remove questions from any dimension
- Keep dimensions balanced (6-8 questions each)
- Use consistent scale (1-5 Likert)

### Changing Pathway Logic

Edit the `pathways` object in `results.html`:
- Modify `condition()` function for each pathway
- Change `description`, `strengths`, `growthAreas`, `encouragement`
- Update `nextReps` actions
- Modify WhatsApp messaging

### Styling

Global styles are in `/styles.css`. Assessment-specific styles are in inline `<style>` tags in each HTML file.

## Testing

### Manual Test Checklist

- [ ] Start assessment at `/disciple-maker/`
- [ ] Complete intake form
- [ ] Answer all 50 questions
- [ ] Submit assessment
- [ ] View results page
- [ ] Verify radar chart renders
- [ ] Click WhatsApp CTA
- [ ] Click "Resume" link
- [ ] Verify can resume in-progress assessment
- [ ] Check email in browser console for any errors

### Load Testing

The Edge Functions have built-in rate limiting. If testing with many users:

```bash
# Monitor function logs
supabase functions logs disciple-maker-start --follow
```

## Troubleshooting

### "Session not found" error

- Check that `config.js` has the correct Supabase URL
- Verify edge functions are deployed
- Check function logs: `supabase functions logs disciple-maker-start`

### Radar chart not rendering

- Ensure Chart.js is loading: check browser console
- Verify scores are being calculated correctly
- Check browser DevTools for JavaScript errors

### Results not loading

- Verify results_token is being passed in URL
- Check function logs for `disciple-maker-results`
- Confirm SHA-256 hash comparison is working

### CORS errors

- Check function CORS headers
- Verify site is using exact domain (https://covomultipliers.com)
- Add domain to ALLOWED_ORIGINS in edge functions if needed

## Next Steps

1. Link to `/disciple-maker/` from your Substack article
2. Add WhatsApp group invitation link to the results page
3. Monitor analytics to see which pathways people are landing in
4. Iterate on questions based on user feedback
5. Consider adding optional demographic questions (age, region, role)
6. Set up email notifications when new assessments are submitted

## Support

For issues with:
- **Edge Functions**: Check Supabase dashboard > Functions > Logs
- **Database**: Check Supabase dashboard > SQL Editor
- **Frontend**: Check browser DevTools > Console
