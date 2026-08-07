# Disciple Maker Next Step — V2 Entry-Point Build Plan

> Phase-1 deliverable. Audit + full plan **before** touching production, per the delivery
> process. Nothing in `/disciple-maker/` or Supabase changes until this is approved and the
> `claude/disciple-maker-v2-entry-point` branch is opened. Grounded in the actual repo, not
> the brief.

---

## 1. Audit of the existing implementation

### 1a. What actually exists (read from code)

**Public product — `/disciple-maker/`** (the thing we're rebuilding):
| File | Role | V2 disposition |
| --- | --- | --- |
| `index.html` | Landing. Hero + **four public profile cards** ("The Awakening / Idealist / Practitioner / Leader") + *"Find out which one you actually are."* | Rewrite — remove maturity labels |
| `intake.html` | First name + email + consent → `disciple-maker-start` → sets `sessionStorage`, redirects to `take.html` | Reuse nearly as-is |
| `questions.js` | 5 dimensions × 20 **agreement-scale** Likert questions | **Delete / replace** |
| `take.html` | Renders the 20 Likert questions, auto-saves to `sessionStorage`, submits to `disciple-maker-submit` | Rewrite question engine; keep shell/progress/resume plumbing |
| `results.html` (45 KB) | **Chart.js radar** + "What We're Seeing" + "Growth Edge" + "Next Step" + WhatsApp Field Room CTA. Renders `pathway`-driven profiles client-side | **Rewrite** — delete radar + Chart.js |
| `cfc-profile.html` (29 KB) | A **second** results surface: "CFC Profile" (Commitment/Focus/Consistency bars) + a follow-up diagnostic modal | **Delete / consolidate** |
| `resume.html` | Email → `disciple-maker-resume` | Reuse |
| `config.js` | Supabase functions base URL | Reuse |

**Edge functions (Supabase, `mryjrvinzbxebzvxtggi`):**
| Function | Role | V2 disposition |
| --- | --- | --- |
| `disciple-maker-start` | Creates `disciple_maker_sessions` row, captures first-touch UTM attribution, mints session token | **Reuse as-is** |
| `disciple-maker-submit` | Scores 5 dims, averages, picks `strongest`/`lowest`, `identifyPathway()`, `diagnoseBottleneck()`, emails "identity" (The Leader…) + WhatsApp | **Rewrite** the scoring→recognition core; keep session/token/email plumbing |
| `disciple-maker-results` | Returns `dimension_scores, pathway, strongest/lowest, bottleneck` by results-token hash | Extend return shape |
| `disciple-maker-resume` | Resume by email | Reuse |
| `disciple-maker-cfc-diagnostic` | Backs the `cfc-profile.html` follow-up modal | **Delete / consolidate** |
| `disciple-maker-cfc-followup` | Sends the day-1 "CFC identity" email | **Repurpose** to a day-3 "did you take your step?" nudge |

**Data model** — `disciple_maker_sessions`, `disciple_maker_responses` (score int 1–5),
plus added columns `diagnostic_answers jsonb` (already exists, GIN-indexed),
`cfc_followup_sent_at`, and first-touch UTM columns.

**Admin — `admin/disciple-maker.html`** ("Next Step Finder Admin"): a **pathway breakdown**
grid (Awakening/Idealist/Practitioner/Leader counts) + dimension bars. Repoint to outcomes.

**Analytics today:** GA4 `G-DXGLXDTF9V` pageviews only. **Zero custom events** across
`/disciple-maker/` and `/assessment/`. This is the largest *under-build* — the funnel is
effectively invisible past pageviews.

### 1b. The corrected duplication story

- **`/assessment/` is a different product** — the **Fivefold Stewardship Assessment**
  (Ephesians 4 APEST), separate tables/functions, 20–25 min. The DB migration itself says
  the disciple-maker schema is *"completely isolated from the Fivefold Stewardship
  Assessment."* **Do not consolidate or delete it.** The brief's "duplicate assessment
  paths" premise is mistaken for this pair.
- **The real duplication is internal to `/disciple-maker/`:** three overlapping
  interpretation surfaces for one assessment — `results.html` (radar) + `cfc-profile.html`
  (CFC identity + a second diagnostic) + the day-1 CFC identity email. *This* is the
  "too much interpretation, not enough clarity" problem. V2 collapses it to **one** result.

### 1c. What V1 gets wrong (confirmed in code, not assumed)

- Agreement-scale self-image questions ("I believe every follower…", `type: "agreement"`).
- Averages that hide constraints (`dimScores.reduce(a+b)/n`).
- Radar chart as the primary result (`Chart.js` `type: 'radar'`).
- Pathway labels that are **public**, not hidden (index cards, email "identity", admin).
- Lowest-dimension bottleneck (`diagnoseBottleneck(scores, pathway)`).
- Multiple overlapping result surfaces (results + cfc-profile + email).

### 1d. Visual system to match exactly (extracted)

- **Green** `#1b4d3e` (primary), `#10281f` (deep), `#2d6a4f`/`#40916c`/`#74c69d` (steps).
- **Gold** `#d4af37` / `#dcb55a` / `#9f7a2f` (accent); **orange** `#bd5a22` (`.btn-accent`).
- **Neutrals** `#fafaf8`/`#f8faf9` bg, `#ffffff` cards, `#1a1a1a`/`#555` text.
- **Type:** system stack (`-apple-system,…`). H1 `clamp(32px,9vw,48px)` 800.
- **Cards:** white, `1px solid #e2eae6`/`rgba(27,77,62,.1)`, radius 12–20px, soft shadow.
- **Buttons:** `.btn`+`.btn-primary` (green) / `.cta-primary` (green gradient, full-width,
  `→` affix). **Container 680px, mobile-first.** Breakpoints 900/600/480/380. Restrained
  fade/slide animations only. Header = sticky brand bar; footer = `.site-footer`.

**V2 reuses `styles.css` + the existing `.dm-*` inline patterns. No new visual system.**

---

## 2. Proposed V2 question flow (~8 core + 1 recognition-confirm + 1 optional)

Recognition-first. Every question is **recent, concrete behavior** in a bounded window, in
formats fit to the question (recency / frequency / yes-no / choice / recognition). No
agreement Likert. Plain, un-churchy language. Branching is minimal and only skips
irrelevant questions.

| # | Question (working copy) | Format | Reads |
| --- | --- | --- | --- |
| 1 | "When did you last intentionally take a conversation toward Jesus with someone who isn't a committed follower?" — This week · This month · A few months ago · Longer / not sure I have | recency | practice recency |
| 2 | "Can you name specific people in your life right now who aren't yet following Jesus?" — Yes, several · One or two · Not really · My life is mostly around Christians | choice | relational field / oikos |
| 3 | "Have you practiced a disciple-making tool (your story, a gospel picture, a discovery Bible conversation) with a real person **outside** a class or training?" — Yes, recently · Once or twice · I've learned tools but not used them · I don't have one I'd reach for | choice | learning vs practicing |
| 4 | "Think of the last person who seemed spiritually open. What happened next?" — We kept meeting · I meant to follow up but didn't · I wasn't sure what to do next · There hasn't been someone | choice | follow-through / the "how" gap |
| 5 | "Which is closest to true right now?" — I'm learning/listening more than I'm practicing · About even · I'm practicing more than I'm consuming | recognition | consumption vs practice |
| 6 | "Does disciple-making have a real place in your week — a time, a rhythm, or a person you meet?" — Yes, consistently · Sometimes · No, it's whenever it happens | frequency | lifestyle / rhythm |
| 7 | *(shown only if Q1/Q3/Q4 indicate they've started)* "Have you tried, hit a wall or awkwardness, and quietly slowed down or stopped?" — Yes, that's me · A little · No | recognition | discouragement / valley |
| 8 | "Right now, is there a practitioner — someone actually doing this — helping you take your next step?" — Yes · Informally · No, I'm figuring it out alone | yes/no | **apprenticeship (the pivot)** |
| 9 | **Recognition confirm:** show the **top two** candidate outcome statements from answers → "Which sounds more like where you actually are?" | choice | user picks the final outcome |
| 10 | *(optional)* "In one sentence — what do you think is actually getting in the way?" | short text | qualitative; seeds the human message |

**Why a recognition-confirm (Q9) instead of a bigger algorithm:** it honors "avoid fake
precision." Answers narrow to two candidates; the **person** chooses. That is both more
accurate on thin data and the source of the "you saw me" moment — and it's trivially
testable/revisable. No elaborate decision engine.

---

## 3. Proposed recognition outcomes (refined from the brief's 8 → 6)

Collapsed because several of the brief's candidates are the same prescription: *Practicing
without consistency*, *Taking action but needing contextual coaching*, and *Ready for a
community of practice* all resolve to **"you're practicing but alone."**

| Outcome | Recognition (headline idea) | Routed from | 7-day step (one person · one action · one time) | CoVo next step |
| --- | --- | --- | --- | --- |
| **Consuming more than practicing** | "You've learned more than you've practiced." | Q1 old, Q3 learned-not-used, Q5 "learning more" | "Pick one tool and one person; use it once before Sunday — badly is fine." | Practice with other disciple makers (Lab) |
| **Intending without acting** | "The intention is real; it just hasn't made it into your week." | field exists (Q2) but Q6 no rhythm, Q1 old | "Put one 30-min disciple-making block on the calendar this week and tell someone it's there." | Practice with other disciple makers (Lab) |
| **No clear relational field** | "There's no one nearby yet to practice with." | Q2 "mostly Christians"/"not really" | "Name 5 people not yet following Jesus you already see weekly; share the list with a practitioner." | Learn the how alongside practitioners |
| **Started but stalled** | "You started, hit a wall, and quietly slowed down." | Q7 "yes that's me" | "Tell one practitioner exactly where you got stuck and ask them to help you take the next rep." | Stop trying to figure this out alone |
| **Practicing but alone** | "You're doing the work — mostly by yourself." | Q1 recent + Q3/Q4 active, but Q8 alone / Q6 inconsistent | "Bring one real situation to a room of practitioners this week and ask for one piece of coaching." | Join the next Multiplying Lab |
| **Reproducing — ready to widen** | "This is becoming a lifestyle. The next step isn't more input." | active + has practitioner + follow-up | "Invite one person you're discipling to try leading the next step while you watch." | Come practice *and* help others (Lab / immersion) |

Honest routing rule: the last outcome exists so the tool **doesn't** manipulate everyone
into CoVo — it tells the already-practicing person the truth and invites them to widen or
help. That person is the one who recommends the tool.

---

## 4. Result-page wireframe (plain text)

One mobile screen before supporting detail. 680px, calm, no radar, no score, no confetti.

```
┌───────────────────────────────────────────────┐
│  CoVo Multipliers                    (brand)   │
├───────────────────────────────────────────────┤
│                                                │
│  [1] RECOGNITION HEADLINE                      │
│      "You've learned more than                 │
│       you've practiced."                       │
│                                                │
│  [2] 2–3 sentences, non-shaming                │
│      "Your answers suggest you understand      │
│       disciple making and genuinely want to    │
│       act — but practice hasn't become a       │
│       stable part of your life yet. That's     │
│       not a commitment problem. It usually     │
│       means you need real reps, feedback,      │
│       and people nearby doing it too."         │
│                                                │
│  [3] WHAT THIS IS NOT  (the "you saw me")      │
│      "This isn't another framework to learn,   │
│       and it doesn't mean you're behind.       │
│       More information won't move you now —     │
│       practice will."                          │
│  ───────────────────────────────────────────   │
│  [4] THIS WEEK  (one person · one action ·     │
│      one time)                                 │
│      "Pick one person and one simple tool,     │
│       and use it once before Sunday.           │
│       Doing it badly still counts."            │
│                                                │
│  [5] WHO WILL KNOW YOU COMMITTED?              │
│      [ name field ]                            │
│      → prefilled, editable message:            │
│      "Hey ___, I just worked through a         │
│       disciple-making next-step tool. It       │
│       helped me see I've learned more than     │
│       I've practiced. I want one real step     │
│       this week — would you ask me about it?"  │
│      [ Send text ]  [ Share ]                  │
│                                                │
│  [6] PRIMARY CTA                               │
│      [ Practice With Other Disciple Makers → ] │
│      (uses live next-Lab data when available)  │
│      secondary: Use a Simple Tool First →      │
│      (obey.tools)                              │
│                                                │
└───────────────────────────────────────────────┘
      Supporting detail below the fold (optional):
      • why this step • what a Lab actually is •
        resume/return link
```

Copy is generated from the outcome (six variants), not dozens of fake profiles.

---

## 5. Data-model changes

Reuse the existing tables; **do not** reuse the scoring columns. One additive, safe
migration (no drops — old columns stay for historical rows).

```sql
-- 202XXXXXXXX_disciple_maker_v2_recognition.sql
alter table public.disciple_maker_sessions
  add column if not exists recognition_outcome text,     -- e.g. 'consuming_more_than_practicing'
  add column if not exists barrier_summary     text,     -- short human sentence shown to user
  add column if not exists seven_day_step      text,     -- the prescribed action text
  add column if not exists step_accepted       boolean default false,
  add column if not exists human_connection_used boolean default false,
  add column if not exists share_action_used   boolean default false,
  add column if not exists covo_cta_clicked    boolean default false,
  add column if not exists assessment_version  text default 'v2';
-- V2 answers live in the existing diagnostic_answers jsonb (question_id -> answer).
-- disciple_maker_responses (score int 1-5) is left for legacy rows only.
```

Optional lightweight event log for the funnel (recommended; else GA-only):
```sql
create table if not exists public.disciple_maker_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references disciple_maker_sessions(id) on delete cascade,
  event text not null,          -- 'landing_viewed','started','question_answered','completed',
                                --  'step_accepted','human_named','share_opened','cta_clicked','abandoned'
  detail jsonb,
  created_at timestamptz not null default now()
);
```

New answer formats aren't 1–5, so they go in `diagnostic_answers` (jsonb) — not the Likert
`responses` table. Deprecated (kept, unused by V2): `dimension_scores`, `pathway`,
`strongest_dimension`, `lowest_dimension`.

---

## 6. Reuse / deletion plan

**Reuse the plumbing (not the product logic):**
- `disciple-maker-start` (sessions, attribution, tokens) — unchanged.
- `disciple-maker-resume` — unchanged. Session/results token security — unchanged.
- `disciple-maker-submit` — keep session/token/email/attribution scaffolding; **replace**
  `scoreResponses`/`identifyPathway`/`diagnoseBottleneck` with `deriveOutcome(answers)`.
- `disciple-maker-results` — extend return shape (outcome, barrier_summary, step).
- `styles.css`, `.dm-*` patterns, header/footer, `utm-tracking.js`, Resend email, WhatsApp
  (`/whatsapp`, `/join-whatsapp`) and Lab links, `intake.html`, `resume.html`.

**Delete / replace (document each in the PR):**
- `questions.js` (20 Likert) → new behavioral question set.
- Radar chart UI **+ the Chart.js CDN `<script>`** in `results.html`.
- `identifyPathway` / `diagnoseBottleneck` / lowest-dimension logic in `submit`.
- Public pathway labels: the four profile cards + "which one are you" in `index.html`;
  "identity"/"The Leader" naming in the results email; pathway grid in the admin page.
- `cfc-profile.html` + `disciple-maker-cfc-diagnostic` (redundant second result surface).
- The 45 KB of client-side pathway/observation copy in `results.html`.
- Any copy implying the tool disciples the user (e.g. results self-help framing).

**Repurpose:** `disciple-maker-cfc-followup` (day-1 identity email) → a **day-3 obedience
nudge**: "Did you take your one step? Who did you tell?" — reinforcing practice, not identity.

**Leave untouched:** `/assessment/` (Fivefold Stewardship — separate product).

**Canonical route recommendation:** keep **`/disciple-maker/`** canonical (index already
links there; email + WhatsApp CTAs point there; no competing public disciple-maker path
exists). `/assessment/` stays as the separate Fivefold product. No redirects needed beyond
retiring `cfc-profile.html` (301 → `results.html` if it has inbound links — TBD in §8).

---

## 7. Exact files I intend to modify (on `claude/disciple-maker-v2-entry-point`)

**Rewrite:**
- `disciple-maker/index.html` — remove maturity cards; recognition-framed landing.
- `disciple-maker/questions.js` — new behavioral flow + outcome-routing helper.
- `disciple-maker/take.html` — new question renderer (mixed formats, branch on Q7,
  recognition-confirm Q9, optional text Q10); keep progress/auto-save/resume shell.
- `disciple-maker/results.html` — new one-screen result; delete radar + Chart.js; add
  human-loop (name + SMS/WhatsApp/Share) + apprenticeship CTA (live Lab data).
- `supabase/functions/disciple-maker-submit/index.ts` — `deriveOutcome()`; new email.
- `supabase/functions/disciple-maker-results/index.ts` — extended return shape.
- `admin/disciple-maker.html` — outcomes + funnel (drop pathway grid & dimension bars).

**Add:**
- `supabase/migrations/202XXXXXXXX_disciple_maker_v2_recognition.sql` (§5).
- `supabase/functions/disciple-maker-event/index.ts` *(optional, if we persist events)*.

**Delete (with PR rationale):**
- `disciple-maker/cfc-profile.html`, `supabase/functions/disciple-maker-cfc-diagnostic/`.

**Update in place:** `disciple-maker/README.md` (V2 model), `SETUP.md` (deploy list).

**Untouched:** everything under `/assessment/`, all other site pages, `vercel.json`
(unless a `cfc-profile` redirect is needed).

---

## 8. Risks & unresolved decisions (need your calls)

1. **`/assessment/` is not a duplicate.** Confirm we leave the Fivefold Stewardship product
   entirely alone. *(My strong recommendation: yes.)*
2. **Recognition outcomes & question copy** — this is the part you said to refine before
   building. Are the **6 outcomes** (§3) and the **8+2 questions** (§2) the right set to
   build the first testable version around? Any you want cut, renamed, or added?
3. **Canonical path** — keep `/disciple-maker/` canonical? *(Recommended.)* Does
   `cfc-profile.html` have inbound links (email/ads) that need a 301 before deletion?
4. **Day-1 email** — repurpose the CFC follow-up into a day-3 "did you do your step?" nudge,
   or drop it for now? *(Recommended: repurpose — it's the obedience loop.)*
5. **obey.tools deep links** — the "Use a Simple Tool First" secondary CTA: link to
   `https://obey.tools` generally, or to specific tools (Conversation Box, Three Circles,
   Commands of Christ, 4 Questions)? Need the exact tool URLs if you want deep links.
6. **Primary Lab CTA target** — the live "Practice With Other Disciple Makers" button:
   point to the homepage `#labs` list, `find-your-field`, or the next specific event via
   the `public-labs` feed? Preference?
7. **Event persistence** — GA4 custom events only, or GA4 **plus** the
   `disciple_maker_events` table for the admin funnel? *(Recommended: both; the admin funnel
   is blind today.)*
8. **Admin migration** — safe to retire the pathway/dimension admin view and replace with
   an outcomes + funnel view, keeping historical rows readable? *(Recommended: yes.)*
9. **Message links across OS** — iOS vs Android differ on `sms:` body syntax
   (`sms:&body=` vs `sms:?body=`). Plan: detect platform, plus a WhatsApp `wa.me/?text=`
   and a Web Share API fallback. Confirm SMS is wanted vs WhatsApp-only.

---

### Recommended next action
Approve §2 and §3 (or mark edits), answer the open calls in §8, and I'll open
`claude/disciple-maker-v2-entry-point`, implement, test every branch + mobile widths +
resume + expired links + analytics + message links, and open a PR with before/after
screenshots and a deletion/reuse summary. **No production files change until then.**
