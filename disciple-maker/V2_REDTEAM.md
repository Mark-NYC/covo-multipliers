# Disciple Maker V2 — Red Team / Kill Review

> A design review whose explicit goal is to prevent us from building the wrong thing.
> The six-gate model (Proximity → Initiation → Proclamation → Establishment → Release →
> Multiplication) was proposed in `V2_REDESIGN.md`. This document tries to destroy it.

## Verdict (read this first)

**The six-gate model fails this review as a *core architecture*. It survives only as a
demoted *prescription library*.**

Of the four hypotheses on the table:

- ❌ "Bottlenecks are sequential constraints, not parallel dimensions" — **probably false.**
- ❌ "The assessment should identify the *first blocked gate*" — **probably false and the
  most dangerous claim in the design.**
- ✅ "The Church Waffle should be the prescription library, not the diagnostic model" — **sound.**
- ✅ "obey.tools reinforces habits/coaching without replacing disciple-makers" — **sound.**

The two claims that fail are the two load-bearing walls. When they go, the building comes
down. The recommendation at the end is to replace the diagnostic *core* with an
**obedience-loop + apprenticeship-relationship** model, keep the six gates only as one
input to a *bottleneck library*, and let user **recognition** — not algorithmic inference
from proxy yes/nos — drive the diagnosis.

---

## 1. Hidden assumptions

The model smuggles in at least eleven assumptions, none of them stated:

1. **The pipeline assumption.** Disciple-making is a throughput system with a fixed order.
   (Theory of Constraints is a *factory* theory. We imported it onto a person.)
2. **The single-bottleneck assumption.** There is exactly one binding constraint at a time.
3. **The solo-pipeline assumption.** *One person* performs all six gates. (The body of
   Christ distributes them across people; the model has no concept of team.)
4. **The foundation assumption.** You can't fruitfully work a later gate until the earlier
   one flows. (i.e., growth is strictly bottom-up.)
5. **The forward-only assumption.** Water flows one direction; there are no feedback loops.
6. **The evangelism-funnel assumption.** "Disciple-making" = moving a *non-believer* from
   stranger to multiplier. (No place for discipling one's own children, re-discipling
   nominal Christians, or apprenticing an existing believer.)
7. **The behavior-reveals-constraint assumption.** Recent behavior (or its absence)
   reliably reveals the true bottleneck. (Absence of behavior is wildly overdetermined.)
8. **The self-knowledge assumption.** People can accurately self-report where they're
   stuck and *why* (heart vs skill). (Jeremiah 17:9 says the opposite; the real bottleneck
   is usually the blind spot.)
9. **The heart/skill dichotomy.** Every cause reduces to won't vs can't. (No cell for
   season, suffering, sin, spiritual bondage, calling/role, wisdom, or God's timing.)
10. **The multiplication-is-terminal assumption.** Multiplication is a gate you *reach
    last*, not a DNA you can carry from day one.
11. **The person-is-the-problem assumption.** The bottleneck is *inside the individual*
    (heart or skill) — never the absence of a community, a coach, a person of peace, or a
    sovereign move of God.

Assumptions 8, 9, and 11 are the quiet killers, because they're the ones the org will
never notice are wrong — the product will keep producing confident diagnoses that feel
precise and are systematically blind.

---

## 2. Which assumptions are probably false

- **Strict sequentiality (1, 4, 5): probably false.** People grow in several gates at once,
  out of order, and working a *later* gate routinely pulls earlier ones forward.
- **Single bottleneck (2): probably false in the common case.** Most stuck people are
  blocked in a *cluster* (e.g., no proximity *and* no follow-up skill). Fixing the
  "first" one unblocks nothing because the next is also blocked.
- **Solo pipeline (3): false as stated.** The New Testament unit is a body with
  distributed gifts, not six competencies in one person.
- **Evangelism funnel (6): too narrow to be true.** A large fraction of real
  disciple-making is with the already-near (children, spouses, lukewarm believers).
- **Self-knowledge of heart-vs-skill (8, 9): false.** Self-report cannot reliably separate
  "I'm afraid" from "I don't know how" — people rationalize fear as ignorance and vice
  versa. The 12-cell precision is *false precision*.
- **Person-is-the-problem (11): often false.** The constraint is frequently external
  (no coach, hard soil, no open door) or vertical (prayerlessness, unrepented sin).

The two *sound* assumptions: that distinguishable bottlenecks exist and deserve different
prescriptions (yes), and that the Church Waffle is a prescription set not a diagnostic set
(yes). Keep those.

---

## 3. Where it breaks in real situations

- **When there are two simultaneous constraints,** "first blocked gate" prescribes a step
  that changes nothing, and the person obeys it, sees no fruit, and concludes the tool (or
  worse, the mission) doesn't work.
- **When the gate is blocked by circumstance, not capacity** (grief, a move, a newborn,
  burnout, illness), the tool reads a seasoned multiplier as a beginner and prescribes a
  beginner step. This is the most insulting failure and the fastest way to lose a mature
  practitioner's trust.
- **When the person's field isn't "far-from-God strangers"** (parents discipling kids,
  pastors re-discipling members), Gate ① mis-fires immediately and sends them to a coffee
  shop to find strangers — actively bad counsel.
- **When the true bottleneck is vertical** (no abiding, no prayer, unrepented sin), the
  model has literally no gate for it and prescribes a horizontal technique for a vertical
  problem.
- **When multiplication is structurally impossible** (prison, hospice, hostile field),
  the model flags a "bottleneck" that is actually faithfulness in a hard place.
- **When the person can't see their own stuck point** (the majority case), the adaptive
  tree just launders their blind spot into an authoritative-sounding diagnosis.

---

## 4. Twelve practitioners whose journey does not fit

1. **The gifted evangelist who never disciples.** Flies through ①–③, stalls at ④. Model
   says "get better at follow-up." Reality: their move is to *partner* with an establisher,
   not to stop evangelizing while they self-improve at their weakness. The model punishes
   a gift and starves the movement's front end.
2. **The stay-at-home mom discipling four kids.** Her mission field is children being
   raised in faith — not "far-from-God" strangers. She's doing rich ④/⑤ work with people
   she never evangelized. Gate ① mis-fires and tells her to go find strangers. Wrong on
   contact.
3. **The prison chaplain / hospice worker.** Overflowing proximity and proclamation; ⑤/⑥
   are impossible by design (people leave, transfer, die). Model brands faithful ministry
   as a permanent bottleneck.
4. **The three-week-old convert** who immediately leads two family members to Christ. Pure
   Gate ⑥ dynamics with zero Gate ③ skill. The sequence runs *backward*; the model can't
   perceive it because it assumes ⑥ comes last.
5. **The seasoned multiplier in a dry quarter.** 3rd/4th-gen disciples exist, but a move
   and a health scare mean no conversations in 90 days. Model reads "blocked at ②," hands a
   veteran the "ask one person a faith question" beginner step. Trust gone.
6. **The cross-cultural missionary in hard soil.** A decade of faithful presence and
   proclamation, few or no yeses. The "block" is God's timing and soil, not a gate in them.
   Model diagnoses them as permanently stuck at ③.
7. **The believer whose real block is secret sin / bondage.** Evangelism stalled because an
   addiction has drained spiritual authority. Heart/skill has no cell for repentance and
   deliverance; the model prescribes conversation tips for a sanctification problem.
8. **The one-on-one establisher who hates cold starts.** Weak at ② (initiating strangers),
   world-class at ④ with people others bring. Model stops them at ② forever and never lets
   the gift downstream operate. It diagnoses a *role*, not a *deficiency*, as a deficiency.
9. **The pastor re-activating nominal members.** His people are "established" attenders who
   were never truly discipled. The flow must run *backward* — back to obedience (④) and
   then out to mission (①). The pipeline has no reverse gear.
10. **The youth-group teenager** mid-apprenticeship across all six at once, driven by a
    weekly group rhythm. There is no single "first blocked gate"; the growth engine is the
    relationship and cadence, which the diagnosis can't see.
11. **The workplace leader with an ethics question.** Deep proximity, but won't "target"
    coworkers because of integrity in a professional setting. The block is *wisdom*, not
    heart-fear or skill-gap. No cell for it.
12. **The household / oikos conversion.** One person of peace opens a whole network;
    multiplication runs through the household, not the discipler's personal progression.
    The unit of multiplication isn't the individual's pipe.

Twelve counterexamples, and they aren't edge cases — they're some of the *most common*
shapes of real disciple-making.

---

## 5. Where Jesus contradicts the framework

- **He gave apprenticeship (⑤) first, not fifth.** "He appointed twelve that they might be
  *with him*" (Mark 3:14) preceded any competence. Being-with came before skill.
- **He handed multiplication (⑥) to the untrained.** He sent the Twelve, then the
  seventy-two, to proclaim and heal (Luke 9–10) while they were still faithless and
  arguing about greatness. ⑥ before ④.
- **The Samaritan woman** (John 4) evangelized her whole town within the hour — ⑥ with zero
  ③ training and zero ④ establishment.
- **The Gerasene demoniac** (Mark 5): Jesus *refused* to let him follow (no
  apprenticeship, no release process) and sent him straight to proclaim to the Decapolis.
  Gates ②–⑤ skipped entirely, on purpose.
- **The whole gospel of John locates the bottleneck vertically, not horizontally.**
  "Abide in me… apart from me you can do nothing" (John 15). Fruit comes from *abiding*,
  not from unblocking a funnel. The six-gate model has no gate for the one thing Jesus
  called the source.

---

## 6. Where Acts contradicts it

- **Pentecost:** 3,000 in a day (Acts 2). No proximity pipeline — a sovereign, event-driven
  harvest. The model has no category for a move of God.
- **The Spirit removes the bottleneck, repeatedly, from the outside.** Philip teleported to
  the Ethiopian (Acts 8); God prepping both Cornelius and Peter (Acts 10); the Macedonian
  call (Acts 16). The constraint is lifted by God, not fixed by the disciple.
- **Persecution, not development, drove multiplication.** "Those who were scattered went
  about preaching" (Acts 8:1–4). Release/multiplication came through crisis, not a
  developmental progression.
- **Paul planted and left fast,** appointing elders quickly (Acts 14:23) and trusting the
  Spirit — almost no personal "Gate ④" hand-holding.
- **Apollos** (Acts 18) was already powerfully proclaiming publicly *before* Priscilla and
  Aquila established his doctrine. Gates out of order again.

---

## 7. Where modern movements contradict it

- **CPM/DMM "begin with the end in mind":** multiplication DNA is built into the *first*
  conversation, not reached last. The six-gate ordering is contrary to CPM orthodoxy.
- **Person of Peace (Luke 10; Watson/Trousdale):** you don't broadly build proximity; you
  *search for the one prepared open door* and go through their network. It's a search, not
  a personal pipeline.
- **MAWL (Model–Assist–Watch–Leave):** a *discipler's posture* toward a learner across all
  skills at once — a coaching cadence, not a diagnosis of the disciple's own capability
  sequence.
- **T4T (Training for Trainers):** trains people to train from meeting one; reproduction is
  the *rhythm*, not a milestone you graduate to.
- **All of them diagnose reproduction/obedience *rate* and often *groups/streams*,** not
  "which of an individual's six gates is blocked."

---

## 8. Where it is too linear

- Real growth is a **spiral**, not a line: you revisit proximity, proclamation, and release
  at deeper levels repeatedly. The model treats a return to an "earlier" gate as regression.
- **Feedback loops are real and the model bans them:** releasing someone (⑤) makes you a
  better proclaimer (③); expecting multiplication (⑥) changes how you do proximity (①) from
  day one. The arrows go both ways; the pipeline only has one direction.
- **It has no vertical axis.** The entire funnel is horizontal (me → others). Abiding,
  prayer, repentance, Spirit-dependence — demoting these to "water pressure" was the
  redesign's single worst move, because for a large share of people the *vertical* is the
  bottleneck, and it's orthogonal to all six gates.

---

## 9. Where it is over-engineered

- **12 cells × prescription library × modifiers × 7-day loop × coach dashboard** is a large
  machine built on a diagnosis that hasn't been validated to be real.
- **Heart-vs-skill is false precision.** The input (a handful of self-reported yes/nos)
  cannot support a 12-way classification, and people can't reliably introspect the cause.
  We'd be reporting two-significant-figure confidence on one-significant-figure data.
- **"First no wins" is brittle:** one mis-read question hard-locks the entire diagnosis to
  the wrong gate, and the adaptive tree then *stops asking* the questions that would have
  corrected it.

---

## 10. Where it is under-engineered

- **No vertical/interior dimension** (abiding, repentance, dependence).
- **No season/suffering/circumstance handling** — can't tell a beginner from a burned-out
  veteran.
- **No calling/role/gifting model** — assumes everyone must personally do all six.
- **No team/body unit** — can't say "partner with an establisher."
- **No community/relationship diagnosis** — can't detect the most common real bottleneck:
  *you have no one discipling you and no one you're discipling.*
- **No sovereignty/timing category** — treats faithful fruitlessness as a defect.
- **No blind-spot correction** — the majority case (people can't see their own stuck point)
  is exactly where a self-report tree is weakest, and there's no mechanism for it.

---

## 11. What Steve Jobs would criticize

- **"You built a funnel and called it a person."** It's an engineer's factory model imposed
  on a spiritual, relational reality. Jobs shipped products shaped like how humans actually
  are, not how systems theory says they should be.
- **False sophistication.** Twelve cells imply an accuracy the input can't deliver. Jobs
  killed features that *looked* smart but couldn't be *felt* as true.
- **It serves the org's need to categorize, not the user's felt need.** The felt need isn't
  "which gate" — it's "I feel stuck/guilty and don't know what to do next." Solve *that*.
- **You're scaling before you've proven the core.** Building the loop and the dashboard
  around an unvalidated diagnosis is scaling a possible hallucination. Prove the diagnosis
  is real with 50 real practitioners and a coach's blind agreement rate *before* one line
  of the machine gets built.
- **The real question he'd ask:** *"Is the assessment even the product, or is it theater in
  front of the thing that actually works — a person?"* If the coaching relationship is what
  changes people, the honest product might be *the fastest path to that relationship*, and
  the diagnostic is set dressing.

---

## 12. If forced to throw the six-gate model away

Replace it with the **Obedience Loop**, the smallest true unit of disciple-making, drawn
straight from Jesus' own definition ("teaching them to *observe* all I commanded," Matt
28:20; "the one who hears and *does*," Matt 7; James 1:22; 2 Tim 2:2):

```
        HEAR ───────▶ OBEY ───────▶ PASS ON
         ▲                              │
         └──────────────────────────────┘
   (Am I taking in what      (Did I do the last     (Did I help one other
    Jesus is saying?)         thing He showed me?)    person do the same?)
```

The only diagnosis: **is your obedience loop running, and if not, where did it stall —
Hearing, Obeying, or Passing on?** Three states, universal:

- **Not hearing** → no intake of the Word/prayer/discovery. (The vertical bottleneck the
  six gates couldn't see.)
- **Hearing, not obeying** → the James 1 "hearer only." Information instead of obedience.
- **Obeying, not passing on** → private discipleship, no reproduction. (This, not "reach
  Gate ⑥ someday," is where multiplication actually dies.)

Why this is stronger:

- **Universal.** It fits the mom, the missionary, the convict, the new convert, the pastor,
  the teenager, the household — *every* counterexample in §4, none of which the six gates
  survived.
- **Scriptural and reproducible.** It's the engine already inside Discovery Bible Study and
  DMM. A child can run it: *"What did Jesus say? Did you do it? Who did you tell?"*
- **Honest about the vertical.** "Hearing" restores abiding/prayer to the center instead of
  demoting it to "pressure."
- **No false sequence.** A loop is genuinely cyclical, which disciple-making genuinely is.

The six gates don't vanish — they get **demoted to a symptom library** that helps a person
name *what specifically* they're not obeying or passing on ("I don't know what to do after
someone says yes"). That was always the six-gate model's one real asset. We keep the asset
and throw away the architecture.

*(Red-teaming my own replacement, honestly: the Obedience Loop can be too abstract, and it
assumes a person is already "hearing" — it serves the pre-proximity seeker less well. The
answer is not to force it into a sequence, but to pair it with recognition — see §14.)*

---

## 13. Six-gate vs three other architectures

| Architecture | Diagnosis unit | Accuracy risk | Simplicity | Fatal flaw |
| --- | --- | --- | --- | --- |
| **Six-gate sequential** | First blocked gate in one person | High false-precision; blind to vertical, season, role, community | Medium (adaptive tree) | Strict order + solo pipeline are probably false |
| **Church Waffle practices (self-rate the 12)** | Which practices are weak | Descriptive, not diagnostic — 12 overlapping scores, no "one thing" | Low (too many outputs) | Can't produce a single decisive constraint; it's V1's radar chart with 12 spokes |
| **MAWL / apprenticeship position** | *Where are you in the coaching cycle, with whom?* Do you have someone above and below you? | Low false-precision; measures the thing that actually predicts multiplication (relationship) | High | Assumes a coach exists; weaker at telling a lone person their *next content step* |
| **Obedience Loop (Hear→Obey→Pass on)** | Where the loop stalls | Low; three honest states | Very high (a child can run it) | Abstract; underserves the person with no proximity yet |

Two architectures clearly beat the six gates: **MAWL/relationship** and the **Obedience
Loop**. Both because they diagnose the *actual predictors* of multiplying disciples —
*being in an apprenticeship* and *running an obey-and-reproduce loop* — rather than a
person's position in an invented funnel. The Church Waffle-as-diagnosis is the *worst* of
the four (it's V1's mistake with more spokes), which is exactly why it belongs on the
prescription side, confirming that one V2 hypothesis.

---

## 14. Most accurate diagnosis that stays simple enough for ordinary Christians

**A two-move design, and the second move is the humbling one:**

**Move 1 — Relationship check (2 questions).** *Is someone discipling you? Are you
discipling anyone?* This single cut sorts nearly everyone and points at the most common
real bottleneck (no apprenticeship in either direction) that all the fancier models miss.

**Move 2 — Recognition, not inference.** Instead of an algorithm inferring the bottleneck
from proxy yes/nos (where the six gates go wrong), **show the person the handful of common
bottlenecks in vivid plain language and ask, "Which of these is most you, right now?"**

Ordinary Christians are *better at recognizing* their own bottleneck when handed good
language than an algorithm is at *inferring* it from thin data. Recognition is also what
actually produces the "this understood exactly where I'm stuck" moment — and it does so
more cheaply, more accurately, and without false precision. The six-gate + heart/skill tree
is an elaborate machine to *guess* what the person could more reliably *recognize*.

So: **Obedience Loop as the frame, relationship check as the first cut, a short recognition
list (seeded from the demoted bottleneck library) as the diagnosis, one prescription from
the Church Waffle, one human, seven days.**

---

## 15. If I had to bet the company

**I'd bet on the Obedience Loop as the diagnostic core, delivered through recognition, with
the apprenticeship-relationship check as the first cut — not the six gates.**

Reasoning, plainly:

1. **It's the only model that survived §4–§7.** Every counterexample, every part of Jesus'
   ministry, Acts, and modern movements that broke the six gates is *native* to an
   obedience loop.
2. **It measures the true predictors of multiplication** (a running obey-and-reproduce
   loop, inside a real relationship) rather than a person's slot in a manufactured funnel.
3. **It is simple enough to reproduce** — the non-negotiable the mission itself demands.
   The six-gate machine is not; it needs the org to run it. The loop, a ten-year-old can run.
4. **It fails safe.** When it's wrong, it still points you to obey the last thing Jesus said
   and tell someone — advice that is never harmful. When the six-gate model is wrong (mature
   person read as beginner, mom sent to find strangers, vertical problem given a horizontal
   fix), the advice is actively bad and costs trust.

**What I would *not* throw away from the six-gate work:** the insight that distinguishable
bottlenecks exist and deserve *different prescriptions*, and the 150-strong symptom
vocabulary. Those become the recognition list and the prescription-matching layer. The
architecture goes; the library stays.

**The bet in one line:** *Don't build a machine that guesses which of six gates is blocked.
Build the shortest path to a person + a running obedience loop, and let the disciple
recognize their own stuck point in language good enough to make them say "you get it."*
