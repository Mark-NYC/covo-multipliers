# Disciple Maker — Version 2

## A first-principles redesign

> This document pretends the current assessment never existed. It challenges every
> assumption in V1. It is brutally honest on purpose. Where our current thinking is
> wrong, it says so and says why.

---

## 0. The one-sentence product

**Find the single thing most in the way of you making disciples who multiply, and
tell you the one thing to do about it this week — then make sure you actually do it.**

Everything below serves that sentence. Anything that doesn't serve it gets cut.

---

## 1. The brutally honest read on Version 1

V1 is a competent assessment. That is exactly the problem. We were asked to build a
diagnosis and we built a *scorecard*. Six specific failures:

**1. Agreement scales measure self-image, not reality.**
"I believe multiplication is God's normal strategy for advancing His Kingdom" —
Strongly Agree → Strongly Disagree. Every person who has ever read a disciple-making
book strongly agrees. The vision questions don't separate anyone. They measure whether
you've absorbed the vocabulary, plus how you feel about yourself today. That is noise,
and we put it first.

**2. Averaging hides the bottleneck.** A bottleneck is a *single binding constraint*.
V1 computes the average of ~4 questions per dimension and then picks the lowest average.
Averaging is the one operation guaranteed to smooth over the single thing that's stuck.
The lowest of five noisy averages is usually just the area where the person was most
honest or most humble — not the constraint.

**3. The dimensions are traits, not a chain.** Vision, Practice, Rhythm, Coachability,
Everyday Mission are *descriptions of a person*. A bottleneck does not live in a person.
It lives in a *flow* — the motion from "no lost people near me" → "conversations" →
"gospel" → "someone says yes" → "they start obeying" → "they disciple someone else."
The bottleneck is wherever that flow stops. You cannot find a stoppage by scoring five
personality attributes in parallel.

**4. "Lowest dimension = bottleneck" is the wrong math entirely.** Constraints are
*sequential*, not parallel. If someone has no relationships with people far from God,
their "multiplication mindset" score is irrelevant — there's nothing to multiply yet.
V1 will happily tell a person whose real problem is proximity that their bottleneck is,
say, coachability, because that average came out 0.3 lower. That's not a diagnosis.
It's a coin flip dressed as insight.

**5. Four overlapping outputs, zero decisions.** V1 emits `pathway` + `strongest` +
`lowest` + `bottleneck` + an 8-spoke radar chart. Five ways of saying "here is a lot
about you." A diagnosis is *one* thing. We hid the pathway labels from users (good
instinct) but kept computing four of them — which means we built the analytics the
*org* wanted, not the clarity the *user* needed.

**6. We built it twice.** There are two live implementations in this repo
(`/assessment/` and `/disciple-maker/`) with overlapping schemas and functions. That is
the physical fingerprint of a product that grew by accretion instead of decision.

**The core misdiagnosis:** we optimized for *completeness* (measure vision, rhythm,
coachability, mission, practice — cover the whole disciple) when the mission demands
*decisiveness* (find the one thing, name it, move). Completeness is a ministry-leader
instinct. Decisiveness is a product instinct. V2 is the switch from the first to the
second.

---

## 2. The fifteen questions, answered

**1. What is the true job of this product?**
To be a *doctor*, not a *lab report*. Symptoms in → one diagnosis → one prescription →
a follow-up visit. The job is obedience within seven days, not understanding within five
minutes.

**2. What should actually be diagnosed?**
The **first broken gate** in a person's disciple-making flow — the earliest point where
the water stops. And at that gate, *why* it's broken: a **heart** constraint (won't /
afraid / don't believe) or a **skill** constraint (don't know how / never been shown).
That's it. Location × cause.

**3. What should never be diagnosed?**
Identity ("you're a Level 2 disciple"), worth, spiritual maturity, personality, gifting
(APEST), Bible knowledge, or anything that ranks the person against other people. We
diagnose the *pipe*, never the person. If a result could produce shame instead of a next
action, it is out of scope by definition.

**4. Stages, bottlenecks, behaviors, habits, convictions, practices — or what?**
None of them as the *primary* unit. The primary unit is a **flow with gates**, and the
diagnosis is a **bottleneck** = (gate) × (heart or skill). Behaviors are the *evidence*
we read to locate the gate. Convictions and skills are the two *causes* at a gate.
Practices (the Church Waffle) are the *prescriptions* we hand out. Habits and lifestyle
are the *goal*. Stages are what we deliberately refuse to assign.

**5. What is the underlying ontology?**
A directed pipeline of six gates that a reproducing disciple's life moves water through,
crossed with a two-value cause axis. Formally: `bottleneck = firstBrokenGate(flow) ×
{heart | skill}`. Six gates × two causes = **twelve root bottlenecks**, into which all
150+ observed bottlenecks collapse. (Section 4.)

**6. How many diagnostic categories should exist?**
Six gates. Not eight, not twelve. Six is the fewest that still tells a complete story
of multiplication and still lets us always point to a *first* break. The Church Waffle's
twelve practices are *not* categories — see Q on Church Waffle below.

**7. How do the categories relate?**
Sequentially and causally, like a pipeline — not as spokes on a wheel. Gate *n* only
matters once gate *n−1* is flowing. This ordering is the entire diagnostic engine: we
walk the flow and stop at the first "no." A radar chart says all spokes are equal and
independent. They are neither. **Kill the radar chart.**

**8. What should the results page communicate?**
One sentence naming the bottleneck, one sentence naming what it is *not* (proof we
understood), one concrete step for this week, and one human to do it with. Four
sentences, one screen, one CTA. Nothing to admire, everything to obey.

**9. What happens in the first seven days?**
A loop, not a leaflet. Day 0: one step + one name. Day 1: one nudge ("did you? Y / N /
stuck"). Midweek: if stuck, a *human* is looped in (not more content). Day 7: "did it
happen?" → yes unlocks the next gate; no triggers re-diagnosis, never shame. The
assessment is the door into this loop; the loop is the product.

**10. How does it strengthen coaching without replacing it?**
The tool coaches the disciple-maker's *attention*; the disciple-maker coaches the
*person*. Technology remembers, nudges, and surfaces the right micro-tool at the right
gate — the boring, scaling parts. It hands off to a human at exactly the three moments
that must be human: the "yes," the "stuck," and the "release." It never generates the
relationship, the courage, or the accountability. (Section 9.)

**11. How does obey.tools fit?**
As the **prescription pharmacy and the coach's dashboard**, not the diagnostician. The
diagnostic (this product) writes the prescription; obey.tools dispenses the concrete
obedience tool (Commands of Christ, gospel-sharing tool, etc.) and gives the human coach
a live view of their people's flow. (Section 10.)

**12. What would Steve Jobs insist on?**
Delete the radar chart. Delete three of the four outputs. Delete the second
implementation. One diagnosis. One step. Adaptive length (the stuck person answers three
questions, not twenty). The magic moment is *recognition* — "this understood exactly
where I was stuck" — and recognition comes from *ruling things out*, not from covering
everything. Say what the bottleneck is **not**. Ship the loop, not the report.

**13. Where are we overcomplicating?**
Twenty questions where an adaptive ~8 would do. Eight radar spokes. Four pathway labels.
Two parallel codebases. A "score" at all. Every one of these is a thing to *admire*
instead of a thing to *obey*.

**14. Where are we still thinking like ministry leaders instead of product designers?**
Three tells: (a) We measure the *whole disciple* for theological completeness instead of
finding the *one decisive cut*. (b) We built a radar chart — an artifact to present in a
meeting. (c) We kept computing four "pathways" for internal analytics while telling
ourselves the product is for the user's obedience. Building for the org's dashboard is
leader thinking. Building for one person's next seven days is product thinking.

**15. What makes practitioners say "this understood exactly where I was stuck"?**
Specificity plus *elimination*. Not "grow in these three areas." Instead: *"You're not
stuck on courage — you're actually brave. You're stuck because there's no one in your
week to be brave with."* Naming what they're **not** stuck on is what proves the tool
saw them. That sentence is what gets forwarded to another disciple-maker.

---

## 3. Product philosophy (the non-negotiables, restated as engineering constraints)

| Principle | What it forbids in the build |
| --- | --- |
| Diagnose bottlenecks, not people | No stage labels, no identity, no score shown to the user. |
| Prescribe one next step, never many | Results page ships exactly one step. A list of three is a bug. |
| Optimize for obedience within 7 days | Every prescription is doable by one ordinary person in one week, alone or with one other. |
| Tech strengthens, never replaces | Every automated moment must end in a human hand-off or a human habit. |
| Human apprenticeship is sacred | The tool never plays the coach, the friend, or the Holy Spirit. |
| Simplicity reproduces | If a 10-year-old disciple couldn't pass the step on to someone else, it's too complex. |
| Reduce friction | Fewer questions, fewer choices, fewer clicks, one CTA. |
| Habits → lifestyle → generations | The unit of success is *the loop running again next week*, not the assessment completing. |

---

## 4. The diagnostic model

### 4.1 The Flow — six gates

Water (a person moving toward becoming a multiplying disciple-maker) flows through six
gates, in order. The name of each gate is a behavior, not a virtue.

```
①  PROXIMITY      Are far-from-God people actually in your everyday life?
        │             symptoms: lives around Christians · knows no lost people · no shared life
        ▼
②  INITIATION     Do you start spiritual conversations?
        │             symptoms: afraid to start · waits for the "perfect" moment · stays surface
        ▼
③  PROCLAMATION   Can you simply share the gospel and invite a response?
        │             symptoms: doesn't know how · over-complicates · never actually asks
        ▼
④  ESTABLISHMENT  When someone responds, do you help them start obeying Jesus, and follow up?
        │             symptoms: never follows up · doesn't know what to do after "yes" ·
        │             gives information instead of obedience
        ▼
⑤  RELEASE        Do you hand responsibility to them, instead of doing it for them?
        │             symptoms: doesn't release · stays the hero · disciples stay dependent
        ▼
⑥  MULTIPLICATION Do you expect and coach the next generations (disciples who make disciples)?
                      symptoms: doesn't expect multiplication · stops at addition · no 3rd/4th gen
```

Two convictions govern the model:

- **The bottleneck is the *first* gate that isn't reliably flowing.** Not the lowest
  score — the *first* "no." Everything downstream is moot until it's fixed. This is the
  Theory of Constraints applied to the Great Commission, and it is the single biggest
  break from V1.
- **Prayer/Holy-Spirit dependence and coachability are not gates.** They aren't points
  in the flow; they are the *water pressure* behind the whole pipe. We read them as
  modifiers on the prescription (a prayerless person gets a prayer-shaped step; an
  uncoachable person gets a step that involves letting one person in), never as their
  own diagnosis. V1 made Coachability a peer of Practice. It isn't.

### 4.2 The second axis — why the gate is broken

At the broken gate, there are only two root causes:

- **HEART** — *won't / afraid / doesn't believe it's theirs to do.* The step is a
  courage/conviction step, usually relational and small.
- **SKILL** — *doesn't know how / has never been shown.* The step is an apprenticeship
  rep: watch one, do one with someone.

The prescription is completely different for each, which is *why* this axis exists. Same
gate, opposite medicine.

### 4.3 The twelve root bottlenecks

This is the answer to "our 150 bottlenecks probably collapse into a smaller number."
They collapse into **twelve** — one per cell — and every observed bottleneck is a
*symptom* that maps to exactly one cell.

| Gate | Heart root bottleneck | Skill root bottleneck |
| --- | --- | --- |
| ① Proximity | "My life is walled off from lost people and I'm comfortable there." | "I want to be near lost people but don't know how to build real relationships with them." |
| ② Initiation | "I'm afraid to bring Jesus up." | "I don't know how to turn an ordinary conversation spiritual." |
| ③ Proclamation | "I freeze / don't think it's my place to share." | "I can't explain the gospel simply or ask for a response." |
| ④ Establishment | "I don't follow up — I hope the church will." | "Someone said yes and I have no idea what to do next." |
| ⑤ Release | "I like being needed; letting go feels like losing control." | "I don't know how to hand off so they can actually carry it." |
| ⑥ Multiplication | "I'm content with addition; I don't really expect generations." | "I don't know how to coach a disciple to make disciples." |

The existing 150+ are the *symptom vocabulary* underneath these twelve. "Gives
information instead of obedience" → ④-Skill. "Lives around Christians" → ①-Heart.
"Doesn't expect multiplication" → ⑥-Heart. Keeping the 150 is valuable — as the library
that makes our language land ("this understood exactly where I was stuck") — but they
were never twelve *diagnoses*. They were twelve diagnoses wearing 150 costumes.

---

## 5. The decision tree

The engine walks the flow and stops at the first break. Median completion is **~7–9
questions**, because a person stuck at gate ② never gets asked about multiplication.

```
START
  │
  ▼
GATE ①  "In a normal week, do people who are far from God share real life with you
        — not just cross your path, but conversations, meals, actual relationship?"
        ├─ NO / RARELY ──▶ break at ①. Ask the ①-cause probe. → DIAGNOSE(①, heart|skill)
        └─ YES ──▼
GATE ②  "In the last 30 days, did you intentionally move at least one conversation
        toward Jesus?"
        ├─ NO ──▶ break at ②. Ask the ②-cause probe. → DIAGNOSE(②, heart|skill)
        └─ YES ──▼
GATE ③  "When someone's open, have you actually shared the gospel and invited a
        response in the last 90 days?"
        ├─ NO / CAN'T REMEMBER ──▶ break at ③. Ask probe. → DIAGNOSE(③, heart|skill)
        └─ YES ──▼
GATE ④  "For the last person who showed interest or said yes — did you help them take a
        concrete next step of obedience and follow up within a week?"
        ├─ NO ──▶ break at ④. Ask probe. → DIAGNOSE(④, heart|skill)
        └─ YES ──▼
GATE ⑤  "Is there someone you've discipled who now leads/initiates without you doing it
        for them?"
        ├─ NO ──▶ break at ⑤. Ask probe. → DIAGNOSE(⑤, heart|skill)
        └─ YES ──▼
GATE ⑥  "Has someone *you* discipled gone on to disciple someone else (a spiritual
        grandchild you can name)?"
        ├─ NO ──▶ break at ⑥. Ask probe. → DIAGNOSE(⑥, heart|skill)
        └─ YES ──▶ NO CURRENT BOTTLENECK. Prescription = coach another multiplier /
                    widen the field. (This person recommends the tool to others.)
```

**The cause probe** (asked only at the broken gate) is one forced-choice question that
splits heart from skill. For gate ②, e.g.:

> "What's the truer reason it isn't happening?"
> - ◻ *I get nervous or it feels awkward to bring Jesus up.* → **heart**
> - ◻ *I don't know how to steer an ordinary conversation there.* → **skill**
> - ◻ *Honestly, I'm not around people I'd have that conversation with.* → **re-routes to ①**

The third option matters: it lets an honest person correct a gate we thought was flowing.
The tree is forgiving, not rigid.

**Two guards against false positives:**
- *Recency defeats social desirability.* We never ask "do you share the gospel?" (belief).
  We ask "when did you last actually do it — this week / this month / this year / can't
  remember?" A "this year / can't remember" is a break even if they'd have agreed with the
  values question.
- *One honesty calibration up front,* not scored, just framing: "This only works if you
  answer about what's actually happening, not what you wish were happening. There are no
  wrong answers — a clear 'no' is the most useful thing you can give us." This buys back
  most of the over-claiming that Likert agreement scales invite.

---

## 6. Question strategy

Five rules. Each one is a direct repudiation of a V1 habit.

1. **Behavior, never belief.** Every question is about an observable act in a bounded
   window ("in the last 30 days…"). We deleted every "I believe / I want / I care"
   question. Belief questions correlate with vocabulary and mood, not obedience.
2. **Recency, not agreement.** Where we need intensity, we ask *when did it last happen*,
   not *how strongly do you agree*. Recency is a fact; agreement is a self-image.
3. **Adaptive and short.** Ask in flow order, drill only at the break. The person is done
   the moment we've found the first "no" and its cause. Nobody answers about gate ⑥ to
   learn they're stuck at gate ①.
4. **Forced, honest choices.** Yes / Rarely / No and single-select cause probes — not
   1–5 sliders. A slider lets everyone hide at 3–4. A binary makes the diagnosis possible.
5. **Plain, concrete, un-churchy language.** "Do people far from God share real life with
   you?" beats "I can identify my primary mission field." The words are the diagnosis
   working; if the question uses insider language, the answer measures fluency in our
   dialect, not their life.

Total surface area: **6 gate questions + 1 cause probe + 1 honesty framer**, adaptive, so
a typical run is under two minutes. V1's 20 questions in 4–5 minutes was already a
concession; V2 makes it shorter *and* sharper by refusing to ask questions whose answers
can't change the diagnosis.

---

## 7. The recommendation engine

`recommend(gate, cause, modifiers) → one 7-day step + one human + optionally one tool`

- **gate × cause** selects a *family* of steps from the prescription library (Section 10)
  — one cell of the 6×2 matrix.
- **modifiers** (low prayer-dependence, low coachability, no coach yet, introvert self-
  report, brand-new believer) tune *which* step in the family and *how it's framed* —
  never the diagnosis.
- The engine returns **exactly one** step. If it's tempted to return two, it returns the
  *earlier-gate, lower-friction* one. Prescribing two steps is the failure mode we are
  most guarding against, because it is the failure mode ministry people fall into most.

**Every step must pass four tests or it doesn't ship:**
1. **Doable in 7 days** by one ordinary person.
2. **Obedience, not information** — a thing you *do*, not a thing you *learn*. (No "read
   this article." Maybe "watch this 90-second tool, then do it once.")
3. **Reproducible** — simple enough that the person could immediately show someone else.
4. **Ends in a human or a habit** — names a person to do it with, or seeds a repeatable
   rhythm.

**Worked example.** Diagnosis: ② Initiation, heart (afraid to bring Jesus up), modifier:
has a coach.
> *This week: pick one person you already like, and before Friday ask them a single
> question — "Has faith ever been a real part of your life?" You don't have to say
> anything after. Just ask, and listen. Text [coach name] the person's first name today
> so they can check in Thursday.*

One person. One question. One deadline. One human. No gospel presentation demanded (that's
gate ③ — not their bottleneck yet). That restraint — prescribing *only* the next gate — is
the engine's whole discipline.

---

## 8. The results page

Kill the radar chart. Kill the score. Kill the three-observation / three-rep list. The
entire page is four sentences and one button, on one screen, no scroll.

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   Your biggest bottleneck right now:                         │
│                                                              │
│   ▸ There's no one far from God in your everyday             │
│     week to disciple yet.                                    │
│                                                              │
│   And here's the good news about what it's NOT:              │
│   You're not lacking courage or conviction — you'd           │
│   share if someone were there. The gap is proximity,         │
│   and that's the most fixable thing on the list.             │
│                                                              │
│   ─────────────────────────────────────────────             │
│                                                              │
│   Your one step this week:                                   │
│   Pick one place in your normal routine — a gym, a           │
│   coffee shop, a neighbor's porch — and go back to the       │
│   same place, same time, three times before Sunday.          │
│   Learn one person's name. That's the whole assignment.      │
│                                                              │
│   Do it with:  Ray (your coach)  ·  we'll check in Thursday  │
│                                                              │
│         [ I'm in — remind me →  ]                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The four load-bearing sentences, in order:
1. **The diagnosis** — one bottleneck, named as a *situation*, not a verdict on the person.
2. **The elimination** — what it's *not*. This is the "you saw me" moment. Non-optional.
3. **The step** — one obedience, this week, small enough to actually happen.
4. **The human** — a name and a check-in time. Not a WhatsApp group of 400 — *a person*.

One CTA. It doesn't say "join the community" (that's the org's goal); it says "I'm in —
remind me" (the user's goal). Joining anything is a consequence, never the ask.

What we deliberately *don't* show: the gate number, the word "heart/skill," any of the
other five gates, any score, any label. The machinery stays backstage. The user gets
recognition and a move.

---

## 9. The coaching workflow (the 7-day loop)

The assessment is the front door. The **loop** is the house. This is where obedience
actually happens and where "tools only matter if they become habits" gets built.

```
DAY 0  Diagnosis + one step + one human.  Coach is notified: "New disciple, stuck at ②-heart,
       step = ask-one-question. Check in Thursday."
DAY 1  One nudge to the disciple: "Your step this week: ask one person the faith question.
       Reply Y (did it) / N (haven't yet) / STUCK."
DAY 3-4 If STUCK or silent → the *coach* is pinged (not the bot). Human reaches out. The
       tool's job here is to make sure the human doesn't forget, not to do the caring.
DAY 7  "Did it happen?"
        ├─ YES → celebrate (human, specific) + the flow advances: re-run the tree from the
        │        next gate, prescribe the next step. The disciple *moves*.
        └─ NO  → never shame. Re-diagnose: was the step too big? wrong cause (we said skill,
                 it was heart)? wrong gate? Adjust and re-prescribe smaller. A "no" is data,
                 not a failure.
```

The two rules that keep tech in its lane:

- **The tool coaches attention; the human coaches the person.** Automation handles memory,
  timing, and surfacing the right micro-tool. It never sends the encouragement — that's the
  coach's, and it must feel like a person, because it is one.
- **Three moments are always human, never automated:** the *"yes"* (someone comes to
  faith), the *"stuck"* (a disciple can't move), and the *"release"* (handing responsibility
  on). These are the sacred apprenticeship moments. The tool's highest function is to *route
  a human to them at the right time* — and then get out of the way.

This is also the honest answer to retention: V1 was a one-shot assessment with a WhatsApp
link. V2 is a loop that has a reason to run again next Monday. The metric of success is not
"assessments completed." It's **"loops that ran a second time"** — because a second loop is
the first evidence that a tool became a habit.

---

## 10. obey.tools integration

obey.tools is **not** the diagnostician and **not** the coach. It is two things:

**A) The prescription pharmacy.** The recommendation engine (Section 7) writes a
prescription; obey.tools dispenses the concrete obedience tool for it. This is exactly
where the **Church Waffle / 12 Commands of Christ** belong — and it settles the question
the brief asked directly:

> **The Church Waffle is not the diagnostic model. It is the prescription library and the
> shared operating system of obedience.**
>
> The twelve practices make *terrible* diagnostic categories — they overlap, they're
> outcomes not constraints, and they don't form a flow you can find a "first break" in.
> But they are the *ideal* menu of concrete obediences to prescribe *from*, and the shared
> definition of "what a healthy disciple and a healthy simple church actually do."
> Diagnose with the Flow (Section 4). Prescribe with the Waffle (via obey.tools). Clean
> separation: **the Flow finds the break; the Waffle fixes it.**

Mapping (illustrative): a ③-Skill diagnosis dispenses the gospel-sharing tool; a ④-Skill
diagnosis dispenses the Commands of Christ walkthrough ("what to do after yes"); a ⑥ diagnosis
dispenses the multiplication/coaching tool. The disciple always leaves with *one* tool for
*one* step — never the whole waffle at once. (Simplicity reproduces.)

**B) The coach's dashboard — the thing that makes practitioners recommend it.** obey.tools
shows a coach their people as a living board:

```
  Person        Gate now     Last step        7-day result   Needs you?
  ─────────────────────────────────────────────────────────────────────
  Maria         ② heart      ask 1 question   ✓ did it        advance ▸
  James         ④ skill      Commands walk    ⏳ silent        ⚠ ping him
  Aisha         ① heart      go back 3x       ✗ didn't        ⚠ re-diagnose
  Devon         ⑥            coach a multiplier ✓             celebrate
```

This is the feature that turns one coach into a coach of many *without* diluting the
apprenticeship — because it points their limited human attention at exactly the person and
moment that needs it. That is "technology coaches disciple-makers; disciple-makers coach
people," made literal.

**The hard line:** obey.tools may remember, remind, surface, and route. It may **never**
generate the relationship, the accountability, the celebration, or the courage. The day it
tries to *be* the coach is the day it violates the mission. Every automated touch must
dead-end in a human or a habit.

---

## 11. Product roadmap

**V2.0 — The decisive diagnosis (MVP).** Ship the six-gate adaptive tree + first-break
logic + the four-sentence results page. *Delete* the radar chart, the four pathway labels,
the score, and the second (`/assessment/`) implementation. Reuse the existing Supabase
tables/functions — swap the scoring for the tree, swap the results page for the four
sentences, keep intake/resume/token infra. Success metric: % of takers who say "this named
the right thing" (one-tap thumbs on the results page).

**V2.1 — The prescription + the loop.** Add the heart/skill cause probe, the prescription
library keyed to the 6×2 matrix and to obey.tools, and the **Day-1/Day-7 nudge loop**. This
is the release that turns an assessment into a habit. Success metric: **7-day step
completion rate**, and **second-loop rate**.

**V2.2 — The coach's dashboard.** Ship the obey.tools coaching board (people × gate ×
last-step-status × needs-you). This is the growth engine: it's what makes a practitioner
say "you have to try this with your people." Success metric: coaches actively working a
board weekly; disciples-per-active-coach.

**V3 — Generations.** Longitudinal view of the flow *moving over months*, and the
multiplication view: a coach (and a disciple) can see spiritual grandchildren and
great-grandchildren appear. The product's telos is generations of disciple-makers; V3 is
where the product can finally *show* one. Success metric: named 3rd- and 4th-generation
disciples in the system.

Sequencing logic: **diagnose right first (2.0), make obedience happen (2.1), make it
spread through coaches (2.2), then prove multiplication over time (3.0).** Each release is
independently useful; none of them is a rewrite of the last.

---

## 12. What we are deleting, on purpose

A redesign is defined by its subtractions. V2 deletes:

- the radar chart · the 1–5 Likert scale · all "I believe / I want" questions ·
  the four pathway labels · the `strongest`/`lowest`/`bottleneck`/`pathway` quadruple
  output · the score · fixed 20-question length · the parallel `/assessment/` build ·
  and the "join the community" CTA as the primary ask.

What replaces all of it is four sentences and a loop.

---

*The measure of V2 is not whether it's a better assessment. It's whether a practitioner
finishes it, thinks "that's exactly where I'm stuck," does one thing that week, and then
texts the link to another disciple-maker with three words: "This gets it."*
