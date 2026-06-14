# Fivefold Stewardship Assessment — Setup Instructions

## Supabase Setup

### 1. Run Migrations

In order:
```
supabase/migrations/20260614000000_assessment_schema.sql
supabase/migrations/20260614000001_assessment_seed_config.sql
supabase/migrations/20260614000002_assessment_seed_items.sql
supabase/migrations/20260614000003_assessment_scoring_rules.sql
```

### 2. Set Secrets

```bash
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL=assessment@covomultipliers.com
supabase secrets set SITE_ORIGIN=https://covomultipliers.com
supabase secrets set ADMIN_ASSESSMENT_SECRET=<strong-random-secret>
```

### 3. Deploy Edge Functions

```bash
supabase functions deploy assessment-start
supabase functions deploy assessment-items
supabase functions deploy assessment-save
supabase functions deploy assessment-submit
supabase functions deploy assessment-results
supabase functions deploy assessment-resume
supabase functions deploy assessment-admin
```

### 4. Update Supabase Project URL in HTML

Replace `https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1` in:
- `assessment/intake.html`
- `assessment/take.html`
- `assessment/results.html`
- `assessment/resume.html`
- `assessment/admin/index.html`

Or set it in a shared JS constant once the domain is confirmed.

## Admin Access

Visit `/assessment/admin/` and enter the value you set for `ADMIN_ASSESSMENT_SECRET`.

## Pilot Notes

- All analytics are labeled "Pilot Analytics" — this assessment is not psychometrically validated.
- Do not describe results as validated, definitive, or as identity/calling statements.
- Results describe stewardship patterns only — no APEST identity labels are used in result copy.
