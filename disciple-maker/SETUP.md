# Disciple Maker Pathway Assessment — Setup Instructions

## Overview

The Disciple Maker Pathway Assessment is a standalone assessment that identifies where someone is on their disciple-making journey.

**Core model**: 
- Assessment identifies pathway & bottleneck
- Labs & Immersions are public (explore anytime)
- WhatsApp is shared practice & discernment space
- Deeper programs (Online Church, Coaching, Institute) emerge from WhatsApp

Assessment does NOT approve people into programs. It provides diagnostic clarity so coaches can help people take their next step.

## Architecture

- **Frontend**: Static HTML + vanilla JavaScript (no framework)
- **Backend**: Supabase PostgreSQL + Edge Functions  
- **Database**: Dedicated tables (isolated from Fivefold assessment)
- **Assessment Type**: 8-dimension radar with pathway ID + bottleneck diagnosis
- **Pathways**: Explorer, Practitioner, Multiplier, Catalyst

## Files

### Frontend (HTML)
- `index.html` - Landing page
- `intake.html` - Collect name/email
- `take.html` - The assessment questions
- `results.html` - Show radar chart + pathway + bottleneck diagnosis
- `resume.html` - Resume an in-progress assessment

### Configuration
- `config.js` - Supabase Functions endpoint
- `questions.js` - Assessment questions & dimensions

### Backend (Supabase Edge Functions)
- `disciple-maker-start` - Initialize session
- `disciple-maker-submit` - Submit responses, calculate pathway
- `disciple-maker-results` - Retrieve results for display
- `disciple-maker-resume` - Resume in-progress assessment

### Database
- `20260626000000_disciple_maker_assessment.sql` - Creates dedicated tables

## Deployment Steps

### 1. Run Database Migration

The migration creates two dedicated tables completely isolated from the Fivefold assessment:

```sql
disciple_maker_sessions
  - id, email, first_name, organization
  - status (in_progress | completed)
  - session_token_hash, results_token_hash
  - dimension_scores, pathway, strongest_dimension, lowest_dimension, bottleneck
  - created_at, completed_at

disciple_maker_responses
  - id, session_id, question_id, dimension, score
  - created_at
```

Deploy:
```bash
supabase db push
```

**Safety**: These tables are completely separate from `assessment_sessions` and `assessment_responses`. Zero risk of breaking the Fivefold assessment.

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

Currently configured for: `https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1`

### 4. Update WhatsApp Link

In `results.html`, find the WhatsApp CTA and update with your group invite URL:

```html
<a href="/whatsapp.html" class="btn-gold">Join the WhatsApp Community</a>
```

Change `/whatsapp.html` to your actual WhatsApp group link.

### 5. Test Locally (Optional)

```bash
# Start local Supabase
supabase start

# Test at http://localhost:8000/disciple-maker/
```

### 6. Deploy to Production

Push the `/disciple-maker/` directory to your production server.

Update your Substack article to link to `/disciple-maker/`.

## How It Works

### Assessment Flow

1. **Landing** `index.html`
   - Explains the checkup
   - Clicks "Start the Checkup"

2. **Intake** `intake.html`
   - Collects: first_name, email, optional organization
   - Posts to `disciple-maker-start` function
   - Receives: session_id and session_token
   - Stores in sessionStorage
   - Redirects to `take.html`

3. **Taking Assessment** `take.html`
   - Shows 32 questions (8 dimensions × 4 questions each)
   - 5-point Likert scale (Strongly Disagree → Strongly Agree)
   - Single question per screen
   - Auto-saves after each response
   - Progress bar shows completion %
   - "Submit Checkup" button appears on last question

4. **Submit** `take.html`
   - Posts responses to `disciple-maker-submit` function
   - Function:
     - Stores responses in `disciple_maker_responses`
     - Calculates average score per dimension
     - Identifies pathway (Explorer, Practitioner, Multiplier, Catalyst)
     - Identifies strongest and lowest dimensions
     - Diagnoses bottleneck
     - Generates results_token
     - Stores all in `disciple_maker_sessions`
   - Redirects to `results.html?r=<token>`

5. **Results** `results.html`
   - Fetches results using `disciple-maker-results` function (token-secured)
   - Displays:
     - Radar chart (8 dimensions, 1-5 scale)
     - Pathway name + description
     - Strengths (3) + Growth Areas (3)
     - Encouragement message
     - Next reps for this week (3 actions)
     - Dimension score bars
   - Clarifying note: "Labs and Immersions are public opportunities you can explore anytime. WhatsApp is where we practice together and discern next steps. Deeper programs like Online Simple Multiplier Church, coaching, and our Institute emerge from WhatsApp participation."
   - **Single CTA**: "Join the CoVo WhatsApp Community"
   - Pathway-specific WhatsApp guidance (what to do when you join)

### Resume Flow

1. User clicks "Resume your checkup" on `index.html`
2. Enters email at `resume.html`
3. Posts to `disciple-maker-resume` function
4. Function finds most recent `in_progress` session
5. Generates new session_token
6. Redirects to `take.html`

## Database Schema

### disciple_maker_sessions

```sql
id                    uuid PRIMARY KEY
email                 text NOT NULL (used for resume lookup)
first_name            text NOT NULL
organization          text (nullable)
status                text NOT NULL ('in_progress' | 'completed')
session_token_hash    text (SHA-256 hash, for resume security)
results_token_hash    text (SHA-256 hash, for results access security)
dimension_scores      jsonb ({ dimension_key: avg_score, ... })
pathway               text ('explorer' | 'practitioner' | 'multiplier' | 'catalyst')
strongest_dimension   text (dimension with highest score)
lowest_dimension      text (dimension with lowest score)
bottleneck            text (diagnosis of main constraint)
created_at            timestamptz
completed_at          timestamptz
```

### disciple_maker_responses

```sql
id            uuid PRIMARY KEY
session_id    uuid REFERENCES disciple_maker_sessions(id) ON DELETE CASCADE
question_id   text (e.g., "v1", "o2", "c3")
dimension     text (dimension_key for this question)
score         integer (1-5 Likert scale)
created_at    timestamptz
```

## Security

### Token-Based Access

Both tokens are 64-character hex strings (256 bits) generated by `crypto.getRandomValues()`:

1. **session_token** - Used to submit assessment
   - Stored as SHA-256 hash in `session_token_hash`
   - Token itself never stored plain
   - Prevents unauthorized submission to someone else's session

2. **results_token** - Used to view results
   - Stored as SHA-256 hash in `results_token_hash`
   - Token passed in URL (`results.html?r=<token>`)
   - Used to retrieve results via `disciple-maker-results` function

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
- Use consistent 1-5 Likert scale

### Changing Pathways

Edit `pathways` object in `results.html`:
- Modify `description` for each pathway
- Change `strengths`, `growthAreas`
- Update `encouragement` message
- Modify `nextReps` actions
- Update `whatsappGuidance` (what to expect in WhatsApp)

### Changing Pathway Logic

Edit scoring logic in `disciple-maker-submit` function:
- Modify `identifyPathway()` function conditions
- Adjust dimension thresholds

### Styling

Global styles in `/styles.css`. Assessment-specific styles in inline `<style>` tags in each HTML file.

## Testing

### Manual Test Checklist

- [ ] Start assessment at `/disciple-maker/`
- [ ] Complete intake form
- [ ] Answer all 32 questions
- [ ] Verify auto-save works (check browser console)
- [ ] Submit assessment
- [ ] View results page
- [ ] Verify radar chart renders
- [ ] Confirm WhatsApp CTA link works
- [ ] Click "Resume" link
- [ ] Verify can resume in-progress assessment
- [ ] Test on mobile

### Verifying Database

Check that data is being stored:

```sql
-- Check sessions
SELECT id, email, pathway, status FROM disciple_maker_sessions LIMIT 5;

-- Check responses
SELECT session_id, question_id, score FROM disciple_maker_responses LIMIT 10;
```

## Troubleshooting

### "Session not found" error

- Check that `config.js` has correct Supabase URL
- Verify edge functions are deployed: `supabase functions list`
- Check function logs: `supabase functions logs disciple-maker-start --follow`

### Radar chart not rendering

- Ensure Chart.js loads from CDN (check browser console)
- Verify `dimension_scores` are being calculated
- Check browser DevTools for JavaScript errors

### Results not loading

- Verify results_token is in URL (`results.html?r=...`)
- Check `disciple-maker-results` function logs
- Confirm SHA-256 hash comparison is working (tokens should match)

### CORS errors

- Check function CORS headers in edge functions
- Verify site uses exact domain (https://covomultipliers.com)
- Add domain to ALLOWED_ORIGINS if needed

### Sessions not persisting

- Check `disciple_maker_sessions` table exists: `supabase db inspect`
- Verify migration ran successfully: `supabase db pull`
- Check for database errors in Supabase dashboard

## Data Retention

- Sessions stored indefinitely (for coach reference)
- Responses stored indefinitely (for analytics)
- NO results table (results computed on-the-fly for security)
- Consider archiving old sessions after 6-12 months

## Next Steps

1. Test the full flow locally
2. Deploy to production
3. Update Substack article with CTA to `/disciple-maker/`
4. Share WhatsApp group link with team
5. Train coaches on interpreting pathway data
6. Monitor submissions and gather feedback
7. Iterate on questions/messaging based on user feedback

## Support

For issues with:
- **Edge Functions**: Check Supabase dashboard > Functions > Logs
- **Database**: Check Supabase dashboard > SQL Editor
- **Frontend**: Check browser DevTools > Console & Network

---

**Model**: Assessment → Results → WhatsApp (public Labs/Immersions anytime, deeper programs from WhatsApp)  
**Database**: Dedicated tables (safe, isolated)  
**Status**: Ready to deploy
