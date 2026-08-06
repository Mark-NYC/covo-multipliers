# Disciple Maker Next Step — V2 (recognition-first)

The front door between **content** (Multiplying Disciples articles/podcasts) and
**apprenticeship** (CoVo Labs, community, coaching, immersions). Its one job:

> Help the right person recognize that knowledge and intention haven't yet become
> practiced disciple making, name the most relevant current barrier, and invite
> them into apprenticeship with practitioners.

It is **not** a scored assessment. No dimensions, no averages, no radar chart, no
maturity labels, no percentages. See `V2_ENTRY_POINT_PLAN.md` (design branch) for the
full rationale and audit.

## The model

A short, behavioral flow (~8 questions, one branch) asks about **recent, concrete
behavior** — not stated belief. The engine narrows to the **top two** candidate
"recognitions" and the person **confirms** which is true (recognition beats
algorithmic inference on thin data). One of six outcomes results:

| Outcome key | Recognition |
| --- | --- |
| `learning_not_practicing` | Learned more than practiced |
| `intending_not_acting` | Intends, but it never hits the week |
| `no_relational_field` | No one nearby yet to practice with |
| `started_but_stalled` | Started, hit a wall, slowed down |
| `practicing_alone` | Doing the work, but alone |
| `reproducing_widen` | Becoming a lifestyle — ready to widen |

Each outcome yields **one** thing: a recognition headline, a "what this is not"
line, **one** 7-day step (one person · one action · one time), a human-loop moment
(name someone + send an editable text/WhatsApp/share), and one apprenticeship CTA.

## Flow

`index.html` → `intake.html` (name/email/consent → `disciple-maker-start`) →
`take.html` (the flow) → `disciple-maker-v2-submit` → `results.html?r=<token>`.
A day-1 email nudge (`disciple-maker-v2-followup`) asks "did you take your step?"

> **Rollout note:** V2 ships as **new, versioned endpoints** (`-v2-*`); the V1
> functions are left untouched for an additive, reversible launch. See `RELEASE.md`
> for the safety proof, sequence, and rollback.

## Files

- `index.html` — recognition-first landing (no pathway/profile cards)
- `intake.html` — name + email + consent (unchanged plumbing)
- `questions.js` — the behavioral flow + `scoreOutcomes`/`candidateOutcomes` routing
- `take.html` — calm question engine (mixed formats, one branch, recognition-confirm; no gamification)
- `results.html` — one-screen recognition result + human loop + CTAs
- `resume.html` — resume by email
- `config.js` — Supabase functions base URL

## Edge functions

- `disciple-maker-start` — create session, capture attribution, mint token *(shared, unchanged)*
- `disciple-maker-resume` — resume by email *(shared, unchanged)*
- `disciple-maker-v2-submit` — store answers + confirmed outcome, mint results token, email
- `disciple-maker-v2-results` — return first name + recognition outcome + step (or `legacy:true`)
- `disciple-maker-v2-event` — best-effort funnel telemetry → `disciple_maker_events`
- `disciple-maker-v2-followup` — day-1 "did you take your step?" nudge (V2 rows only)

V1 `disciple-maker-submit`/`-results`/`-cfc-followup`/`-cfc-diagnostic` remain deployed
and untouched during launch (rollback safety); retire them in a later cleanup PR.

## Data

`disciple_maker_sessions` gains `recognition_outcome`, `barrier_summary`,
`seven_day_step`, `note`, and engagement booleans (`step_accepted`,
`human_connection_used`, `share_action_used`, `covo_cta_clicked`),
`assessment_version`. Answers live in `diagnostic_answers` (jsonb). Legacy V1
columns (`dimension_scores`, `pathway`, `strongest_dimension`, `lowest_dimension`)
are retained for historical rows but no longer written. New `disciple_maker_events`
table powers the admin funnel.

## Analytics

GA4 custom events *(tool: `disciple_maker_next_step`)* + server persistence:
`started`, `question_answered`, `recognition_confirmed`, `completed`,
`results_viewed`, `step_accepted`, `human_named`, `share_opened`, `cta_clicked`.

## Replaced in V2 (not deleted at launch)

The V2 frontend supersedes the radar chart + Chart.js, the 20 agreement-scale
questions / 5 dimensions / averaged scoring, and the lowest-dimension bottleneck
logic. The four landing cards return as **non-selectable marketing archetypes**
(recognition only — not scored, not routed, not shown after the assessment). The
V1 result surfaces (`cfc-profile.html`, `disciple-maker-cfc-diagnostic`) are kept
dormant for rollback and removed in a later cleanup PR.

## Not touched

`/assessment/` is the separate **Fivefold Stewardship Assessment** — a different
product on its own tables/functions. It is intentionally left alone.

## Canonical route

`/disciple-maker/` is canonical. `cfc-profile.html` was retired (add a 301 if it
had inbound links).
