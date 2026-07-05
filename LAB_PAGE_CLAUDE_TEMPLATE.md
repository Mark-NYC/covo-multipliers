# Covo Multipliers Lab Landing Page Builder

Use this file whenever creating a new Covo Multipliers Lab landing page.

The goal is not merely to describe the lab. The page must help the right person recognize their problem, feel the cost of staying stuck, see a believable path forward, and register.

Build for clarity, trust, action, and easy sharing. Do not use hype, fake urgency, vague ministry language, invented proof, or manipulative fear.

---

> ⚠️ **SLUG CONSISTENCY WARNING**
>
> Every new lab requires three things to match exactly:
>
> 1. The `event_slug` value in the page's registration POST body
> 2. The key in `LAB_EVENTS` inside `supabase/functions/lab-calendar/index.ts`
> 3. The slug used to build the calendar download URL
>
> If any of these three do not match, the Add to Calendar button will fail silently or not appear at all. Confirm all three before publishing.

---

## 1. How to Use This Template

1. Copy the **Lab Brief** below.
2. Fill in every field you know.
3. Give Claude this file, the completed brief, and the two strongest current lab pages in the repository as visual and technical references.
4. Ask Claude to generate one complete replacement HTML file.
5. Claude must inspect the existing repository before writing code so it preserves the current Covo Multipliers visual system, shared styles, Supabase setup, and image paths.

Recommended command:

> Read `LAB_PAGE_CLAUDE_TEMPLATE.md`, inspect the existing Covo Multipliers lab pages and shared CSS, then build the new lab page from the completed brief below. Return a complete replacement HTML file, not fragments.

---

# 2. Lab Brief

Copy and complete this block for every new lab.

```text
LAB_TITLE:
[Public title shown on the page and in emails]

LAB_SLUG:
[Lowercase, letters/numbers/hyphens only. Must match LAB_EVENTS key and registration POST body exactly.]
[Examples: aquila-priscilla-pattern, four-questions, church-circle-lab]

LAB_PAGE_URL:
[Full public URL of this page, e.g. https://www.covomultipliers.com/practicing-church.html]

EVENT_ID:
[UUID from the Supabase events table. Copy it exactly.]

DATE:
[YYYY-MM-DD]

START_TIME:
[HH:MM in 24-hour format, e.g. 15:00]

END_TIME:
[HH:MM in 24-hour format, e.g. 15:45]

TIMEZONE:
[Default: America/New_York]

PAGE FILE NAME:
[example: practicing-church.html]

MONTH / EVENT LABEL:
[example: September Covo Multipliers Lab]

FORMAT:
[example: Free 45-minute live lab]

SEAT LIMIT:
[Use the actual event limit. Never invent scarcity.]

SHORT_DESCRIPTION:
[One to two sentences. Used in meta description and social sharing.]

LONG_DESCRIPTION:
[2–4 sentences. Used in the body of the page.]

CALENDAR_DESCRIPTION:
[Plain text shown in the calendar event body.
Always begin with: Online. Zoom link will be sent before the lab.
Then add the lab description. No HTML. No Zoom link yet.]

THANK_YOU_MESSAGE:
[What appears after successful registration, e.g. "You're registered! Check your inbox for a confirmation email."]

SEATS_LEFT / SCARCITY LINE:
[example: "Only 40 seats. First come, first served." — use real number only.]

PRIMARY AUDIENCE:
[Who is this specifically for? Avoid "everyone."]

SECONDARY AUDIENCE:
[Optional]

CURRENT PAIN:
[What are they experiencing right now? Use concrete language.]

VISIBLE SYMPTOMS:
- [What they keep doing]
- [What keeps failing]
- [What they feel confused, frustrated, or stuck about]

ROOT PROBLEM:
[What is actually causing the pain?]

COST OF INACTION:
[What will likely still be true next month or next season if nothing changes?]

DESIRED FUTURE:
[What becomes possible after they learn and practice this?]

CORE PROMISE:
[What useful result can they reasonably gain in 45 minutes?]

UNIQUE MECHANISM OR PATTERN:
[The biblical pattern, framework, questions, rhythm, tool, or pathway taught in the lab]

FRAMEWORK PARTS:
1. [Part one]
2. [Part two]
3. [Part three]
4. [Part four, if applicable]

CONCRETE TAKEAWAYS:
- [A map, list, script, plan, rhythm, question, tool, or next step]
- [...]
- [...]

ONE-WEEK ACTION:
[What can they actually do during the week after the lab?]

IDENTITY SHIFT:
[How should they see themselves or their ordinary life differently?]

TESTIMONIAL:
[Use a real quote only. Include name or safe attribution. Leave blank if none exists.]

OTHER PROOF:
[Real attendance number, subscriber number, field result, facilitator experience, or none]

TOP OBJECTIONS:
1. [example: I am too busy]
2. [example: I am not a pastor]
3. [example: I am too new]
4. [example: I have tried training before]

FACILITATORS:
[Names and one-sentence credibility statement]

PRIMARY CTA:
[Default: Save My Seat]

BOTTOM CTA IMAGE:
[Existing image path, or "none"]

META DESCRIPTION:
[140–160 characters, specific and useful]
```

---

# 3. Copy Strategy

## The page must answer these six questions quickly

1. **Is this for someone like me?**
2. **Does this solve a problem I actually feel?**
3. **What will I be able to do afterward?**
4. **Why is this approach believable and different?**
5. **Why should I act now instead of later?**
6. **What exactly happens when I register?**

If the page does not answer all six, rewrite it.

---

## Hero rules

The hero must lead with the participant's tension or desired future, not the internal title of the training.

Good hero patterns:

- "Want to [desired action] but don't know [specific missing step]?"
- "What if your [ordinary context] became your [Kingdom outcome]?"
- "You care about [good desire]. So why does [painful result] still feel so hard?"
- "Stop [painful pattern]. Start [concrete better pattern]."

The hero description must make a specific promise:

> In 45 minutes, you'll learn [named mechanism] so you can [practical result] without [common burden or false assumption].

Hero requirements:

- One short event label
- One strong headline
- One clear promise
- One trust line such as `Live · Practical · Free · Small group`
- Dynamic event date and real seats remaining
- Registration form visible above the fold on desktop
- No abstract church jargon
- No more than one main idea

Do not use the lab title as the main headline unless it clearly names the participant's result.

---

## Problem section rules

Name the pain plainly. Show that the problem is not lack of care or character if that is true.

Use this structure:

1. **Good intention:** what they genuinely want
2. **Friction:** what keeps getting in the way
3. **Resulting pain:** what keeps happening
4. **Root issue:** what is actually missing

Example formula:

> A lot of believers care about [desire]. But [specific friction]. So they keep [painful pattern]. The problem is not [false diagnosis]. They need [actual missing thing].

Use one strong problem headline. Examples:

- "Good Intentions Don't Multiply Disciples"
- "Most Training Assumes You Have Extra Margin"
- "Knowing More Is Not the Same as Knowing What to Do Next"
- "You Don't Need More Inspiration. You Need a Repeatable Starting Point."

Do not insult the audience. Do not overstate the pain.

---

## Stakes section rules

Every page must include a clear, honest **cost of inaction** section.

Suggested eyebrow:

> If nothing changes

Suggested headline formula:

> Next Month Will Probably Look a Lot Like This Month

The stakes must show continuation, not catastrophe.

Name 2–4 likely consequences:

- They stay busy but unclear
- Conversations remain casual
- Good intentions never become a weekly rhythm
- People depend on the leader instead of learning to obey
- Training stays theoretical
- Their work, home, or relationships remain disconnected from mission
- They keep waiting for more time, confidence, or permission

Then pivot toward agency:

> This lab will not fix everything in 45 minutes. It will help you stop drifting and take one clear, repeatable step.

Rules:

- No shame
- No threats
- No fake spiritual pressure
- No pretending the lab guarantees multiplication
- Make the pain specific enough that the right person says, "That's me"

---

## Solution / mechanism section rules

Teach the shape of the solution without giving away the whole lab.

Use a named mechanism:

- A biblical pattern
- Four questions
- A pathway
- A weekly rhythm
- A map
- A simple practice
- A repeatable conversation framework

Show 3–5 parts in visual cards.

Each card should contain:

- A one- or two-word label
- A one-sentence explanation
- A concrete action or implication

The mechanism must feel simple enough to remember and useful enough to try.

Avoid generic labels such as "Learn," "Grow," "Connect," and "Transform" unless they are made concrete.

---

## Outcome section rules

Use the eyebrow:

> What you'll walk away with

The headline should describe the change, not the curriculum.

Good patterns:

- "You'll Leave With a Concrete Obedience Plan"
- "You'll Leave With a Simple Pattern for Your Real Life"
- "You'll Know Who to Pursue and What to Do Next"
- "You'll Have a Repeatable Way to Help Someone Start"

List 4–5 concrete takeaways.

Strong takeaway nouns:

- list
- map
- script
- question
- rhythm
- plan
- invitation
- next step
- weekly practice
- person or household
- conversation starter

Weak takeaways:

- inspiration
- awareness
- insight
- empowerment
- deeper understanding

At least one takeaway must be something they can do within seven days.

---

## Social proof rules

Use proof close to the problem or before the main framework.

Acceptable proof:

- A real participant quote
- A real field story
- A real number
- A real facilitator practice
- A specific result with honest limits

Never invent a testimonial, participant number, result, or endorsement.

If no testimonial exists, use a brief credibility block explaining why the facilitators teach this from lived practice.

Specific proof beats large proof.

---

## Audience-fit section

Use the eyebrow:

> Is this for you?

List 3–5 specific groups or situations.

Examples:

- Covocational leaders balancing work, family, and mission
- Disciple-makers stuck at good intentions
- Church leaders trying to activate ordinary believers
- New believers who need a simple first step
- Entrepreneurs who want work to serve Kingdom purposes

The reader should be able to self-select quickly.

Do not make the audience so broad that the section says nothing.

---

## FAQ rules

Answer the four objections most likely to block registration.

Usually include:

1. What is this method or pattern?
2. Is this for ordinary believers or only leaders?
3. Do I need prior experience?
4. What does it cost?
5. Who leads it?
6. Is it live?
7. Will there be a replay? Only answer if known.

Keep answers short, honest, and practical.

Do not use the FAQ to repeat marketing copy.

---

## Final CTA rules

The final CTA must combine:

1. The pain they can stop tolerating
2. The concrete next step
3. The event facts
4. One button

Strong headline patterns:

- "Stop Treating Mission Like Something Extra"
- "Help People Move From Intention to Action"
- "Stop Winging It. Start With One Repeatable Step."
- "Don't Let Another Month Pass Without a Clear Starting Point."

Body formula:

> Join the [month] lab and leave with [concrete result] you can use [timeframe/context].

Keep the button copy consistent across the page:

> Save My Seat

Add the actual date, duration, cost, and seat limitation under the button.

Use an existing relevant image when it increases emotional clarity. Do not add decorative stock imagery that feels generic.

---

# 4. Conversion and Shareability Rules

"Viral" does not mean loud. It means the page is clear enough that someone immediately knows who should receive the link.

Build for forwarding:

- The headline should name a recognizable tension
- The promise should fit in one sentence
- The page title and meta description should make sense when shared
- One phrase should be memorable enough to quote
- The page should feel useful even before registration
- The identity language should be invitational, not tribal pressure

Prefer:

- "for covocational leaders balancing work, family, and mission"
- "for ordinary believers who want a clear starting point"

Avoid:

- "for serious Christians only"
- "join the movement before it's too late"
- vague insider labels without explanation

---

# 5. Urgency Rules

Use three honest forms of urgency:

## Event urgency

- Real date and time
- Real seat limit
- Dynamic seats remaining from Supabase
- Registration closes when full or when the event begins

## Relevance urgency

Show why this matters in their present season:

- their current conversations
- their current relationships
- their current team
- their current work and home rhythms

## Cost-of-delay urgency

Show what likely continues if they do nothing.

Never use:

- Fake countdowns
- Invented deadlines
- Fake seat numbers
- "Only X seats left" unless Supabase says so
- Catastrophic or guilt-based language

The seat pill should be the main scarcity signal. A countdown may be used only when it adds real value and should not visually overpower the promise.

---

# 6. Required Page Structure

Build the page in this order unless there is a strong reason to change it:

1. Site header
2. Outcome-first hero
3. Registration card
4. Problem section
5. Cost-of-inaction stakes section
6. Testimonial or credibility proof
7. Named framework or biblical pattern
8. Concrete takeaways
9. Audience-fit section
10. FAQ
11. Social proof strip
12. Final high-stakes CTA
13. Footer

Keep the page focused. Do not add unrelated ministries, navigation menus, articles, or multiple competing calls to action.

---

# 7. Visual Direction

Match the existing Covo Multipliers site.

Use:

- Deep green, muted gold, white, and soft neutral backgrounds
- Bold, direct headings
- Rounded cards
- Clean spacing
- Light texture in the hero
- Strong contrast
- Minimal visual clutter
- One main CTA color
- Mobile-first responsive behavior

The page should feel:

- grounded
- practical
- premium but not corporate
- field-tested
- warm
- direct
- credible

It should not feel:

- like a conference sales funnel
- like a church bulletin
- like generic SaaS
- overproduced
- loud
- manipulative

Use `styles.css` for shared site styles. Add page-specific CSS inline only when needed.

Do not change global CSS unless explicitly requested.

---

# 8. Registration Form Requirements

The registration card must contain only:

- Full name
- Email address
- Optional marketing opt-in checkbox
- Submit button
- Inline error message

Use this exact optional checkbox language:

> Send me occasional emails about future Covo labs, tools, and live training. Unsubscribe anytime.

Requirements:

- Checkbox must be unchecked by default
- Registration must work whether checked or unchecked
- Confirmation and event reminders are transactional and must not depend on marketing consent
- Disable all form controls while submitting
- Restore controls if submission fails
- Replace the card with a clear success state after registration
- Escape user-provided values before injecting them into HTML

## Required POST body

Post to:

```
https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/register
```

The request body must include **all of the following fields**:

```js
{
  event_id: EVENT_ID,        // UUID from Supabase events table
  event_slug: LAB_SLUG,      // e.g. "aquila-priscilla-pattern" — must match LAB_EVENTS key
  name,
  email,
  marketing_opt_in,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  landing_page,
  referrer,
  latest_touch_at,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_utm_content,
  first_utm_term,
  first_landing_page,
  first_referrer,
  first_touch_at
}
```

UTM fields come from `window.CovoAttribution.get()`. Use `Object.assign` to merge them:

```js
body: JSON.stringify(Object.assign({
    event_id: eventId,
    event_slug: 'LAB_SLUG',
    name,
    email,
    marketing_opt_in: marketingOptIn,
}, window.CovoAttribution ? window.CovoAttribution.get() : {})),
```

> ⚠️ **If `event_slug` is missing from the POST body, the confirmation email will still send, but the Add to Calendar button will not appear.**

Never put a Supabase service-role key in browser code.

---

# 9. Supabase Event Contract

Load the event from:

```
/rest/v1/events_with_availability
```

Filter by the supplied `EVENT_SLUG`.

Use the current public Supabase anon key already present in the existing lab pages. Do not invent or rotate credentials.

The page must dynamically display:

- Event title where appropriate
- Event date in America/New_York
- Seats remaining
- Full-event state
- Event-not-found state

The seat count must come from the database.

When the event is full:

- Replace the registration form with a full notice
- Link back to `/#upcoming-labs`
- Do not leave an active submit button

Keep these constants easy to find near the top of the script:

```js
const SUPABASE_URL          = 'https://mryjrvinzbxebzvxtggi.supabase.co';
const SUPABASE_ANON_KEY     = '...'; // copy from existing lab pages
const REGISTER_FUNCTION_URL = 'https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/register';
const EVENT_SLUG            = 'LAB_SLUG'; // used to load event from DB — not the same as event_slug in POST body, but must be consistent
```

---

# 10. Calendar Integration Checklist

Every new lab requires a matching entry in the `lab-calendar` Edge Function.

## Step 1 — Update `supabase/functions/lab-calendar/index.ts`

Open the file and add a new entry to the inlined `LAB_EVENTS` object:

```ts
"your-lab-slug": {
  slug: "your-lab-slug",
  title: "Your Lab Title",
  date: "2026-MM-DD",
  startTime: "15:00",
  endTime: "15:45",
  timezone: "America/New_York",
  location: "Online",
  url: "https://www.covomultipliers.com/your-lab-page.html",
  calendarDescription:
    "Online. Zoom link will be sent before the lab.\n\nYour lab description here.",
},
```

Rules for `calendarDescription`:

- Always begin with: `Online. Zoom link will be sent before the lab.`
- Follow with a blank line (`\n\n`), then the lab description
- Plain text only — no HTML
- Do not include a Zoom link

## Step 2 — Verify the calendar URL

Test this URL in a browser. It must return a downloadable `.ics` file:

```
https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar?event=your-lab-slug
```

If it returns a 404, the slug in `LAB_EVENTS` does not match the query string.

## Step 3 — Verify the Add to Calendar button in the confirmation email

Submit a test registration with the correct `event_slug`. Open the confirmation email. The Add to Calendar button must appear and link to the correct calendar URL.

## Step 4 — Update the WordPress next-lab widget

`embeds/next-lab-widget.html` is a self-contained snippet pasted into a Custom HTML block on WordPress posts. It pulls seat counts and the next lab date live from Supabase, but its CTA headline, subheadline, and destination URL come from a hardcoded `LAB_CONTENT` map inside that file — they will not appear until you add them.

Add a new entry to `LAB_CONTENT` keyed by the same slug:

```js
'your-lab-slug': {
  url: 'https://www.covomultipliers.com/your-lab-page.html',
  headline: 'Copy this verbatim (or lightly condensed) from the page\'s .event-title hero copy.',
  sub: 'Copy this from the page\'s .event-description — the concrete 45-minute promise.'
},
```

Rules:

- `headline` and `sub` must come from the actual hero copy already written on the lab page — do not invent new marketing copy here.
- If a slug is missing from `LAB_CONTENT`, the widget still works (it falls back to the plain database `title`/`description`), so this step is not launch-blocking, but the CTA will read as generic instead of tailored until it's done.
- After editing, re-paste the updated snippet into any WordPress "reusable block" or Custom HTML blocks that use it so the change goes live everywhere at once.

## Optional — Add to Calendar link on the page itself

After successful registration, you may show a secondary calendar link on the page (in the success state):

```html
<a href="https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar?event=LAB_SLUG">
  Add to Calendar
</a>
```

This is supplemental. The primary Add to Calendar button lives in the confirmation email and depends on `event_slug` being sent to the register function.

---

# 11. Accessibility and Quality Rules

The finished page must:

- Be valid standalone HTML
- Include a useful `<title>`
- Include a specific meta description
- Use semantic headings
- Use labels connected to every form field
- Use `aria-live` for form errors
- Use accessible FAQ buttons with `aria-expanded`
- Support keyboard navigation
- Use visible focus states
- Escape database and user strings inserted through `innerHTML`
- Work on desktop and mobile
- Avoid horizontal scrolling
- Preserve readable contrast
- Use meaningful image alt text
- Avoid layout shifts where practical

Do not add dependencies unless the existing project already uses them.

Do not use React, a build step, or a framework for a standalone lab page.

---

# 12. Claude Build Instructions

When building a new page, follow this sequence:

1. Inspect the repository.
2. Find the two strongest current Covo Multipliers lab pages.
3. Inspect `styles.css`.
4. Read `supabase/functions/lab-calendar/index.ts` and confirm the new slug exists in `LAB_EVENTS`. If it does not, add it before building the page.
5. Read the completed Lab Brief.
6. Identify the audience, pain, desired future, mechanism, proof, stakes, and objections.
7. Draft the conversion argument before writing HTML.
8. Build one complete standalone HTML page.
9. Keep the existing visual system and technical conventions.
10. Verify every variable, event slug, date, image path, and form field.
11. Return the full replacement HTML, not patches or snippets.

Do not ask for information already available in the repository or brief.

If a critical fact is missing, use a clearly marked placeholder such as:

```text
[NEEDS REAL TESTIMONIAL]
[NEEDS EVENT DATE]
[NEEDS IMAGE PATH]
[NEEDS EVENT_ID FROM SUPABASE]
```

Never invent a fact to fill a gap.

---

# 13. Output Rules for Claude

Return:

1. A short summary of the conversion angle
2. The complete HTML file
3. A short verification list containing:
   - `LAB_SLUG` value used in the POST body
   - `EVENT_ID` present and correct
   - `event_slug` present in the registration POST body
   - Slug confirmed in `lab-calendar` `LAB_EVENTS`
   - Calendar URL tested
   - Date/time source
   - Form endpoint
   - Marketing opt-in present and unchecked by default
   - Mobile styles present
   - Full-event state present
   - Event-not-found state present
   - UTM fields passed via `CovoAttribution`

Do not return partial code.

Do not say "insert this section" or "replace this function."

Do not truncate the HTML.

Do not rewrite unrelated site files.

---

# 14. Before Publishing — Final Checklist

Complete every item before the page goes live.

- [ ] Event row exists in the Supabase `events` table
- [ ] `EVENT_ID` UUID copied from Supabase into the page exactly
- [ ] `LAB_SLUG` chosen: lowercase, letters/numbers/hyphens only
- [ ] `event_slug: 'LAB_SLUG'` present in the registration POST body
- [ ] Same slug added to `LAB_EVENTS` in `supabase/functions/lab-calendar/index.ts`
- [ ] `lab-calendar` function deployed after adding the new slug
- [ ] Calendar URL returns a valid `.ics` file: `…/lab-calendar?event=LAB_SLUG`
- [ ] Test registration submitted
- [ ] Confirmation email received
- [ ] Confirmation email contains Add to Calendar button
- [ ] Add to Calendar button links to the correct calendar URL
- [ ] `.ics` file contains correct title, date, start time, end time, page URL
- [ ] `.ics` file does not contain a Zoom link
- [ ] UTM fields still passed in the POST body
- [ ] Marketing consent copy still appears correctly
- [ ] Page works on mobile
- [ ] Seats remaining load dynamically from Supabase
- [ ] Full-event state tested
- [ ] Event-not-found state tested
- [ ] Slug + tailored headline/sub added to `LAB_CONTENT` in `embeds/next-lab-widget.html`

---

# 15. Final Copy Test

Before finishing, check every line against these questions:

## Hero

- Does the headline name a felt problem or desired future?
- Does the subhead promise a concrete result in 45 minutes?
- Can the right participant recognize themselves in five seconds?

## Problem

- Is the pain specific?
- Is the root problem believable?
- Does the copy respect the reader?

## Stakes

- Does the page say what likely continues if nothing changes?
- Is the urgency honest?
- Does it avoid shame and fake fear?

## Mechanism

- Is there a named pattern or framework?
- Can someone remember its parts?
- Does it feel practical rather than theoretical?

## Outcomes

- Are the takeaways tangible?
- Can at least one be used within seven days?
- Are they benefits rather than curriculum topics?

## Proof

- Is every claim real?
- Is the testimonial real?
- Are numbers current and defensible?

## Registration

- Is the form short?
- Is the opt-in optional and unchecked?
- Does the page submit `marketing_opt_in`?
- Does the page submit `event_slug`?
- Does the page work without opt-in?
- Are UTM fields included via `CovoAttribution`?

## CTA

- Is there one primary action?
- Is the button language consistent?
- Does the final CTA reconnect the pain, promise, and date?

## Technical

- Is `LAB_SLUG` exact and consistent across all three locations?
- Does the page use the current registration Edge Function URL?
- Does it read dynamic availability from Supabase?
- Does it handle errors and full events?
- Does it work on mobile?
- Is the slug present in `lab-calendar` `LAB_EVENTS`?

If any answer is no, fix it before returning the page.

---

# 16. Fast Copy Skeleton

Use this only as a starting point. Rewrite every bracketed line for the actual lab.

```text
EVENT LABEL
[Month] Covo Multipliers Lab

HERO HEADLINE
Want to [desired action] but don't know [specific missing step]?

HERO PROMISE
In 45 minutes, you'll learn [named mechanism] so you can [practical result] without [common burden].

TRUST LINE
Live · Practical · Free · Small group

PROBLEM EYEBROW
The real problem

PROBLEM HEADLINE
[Good intention] Doesn't Automatically [Desired Result]

PROBLEM BODY
A lot of [audience] care about [desire]. But [friction]. So they keep [painful pattern]. The problem is not [false diagnosis]. They need [actual missing thing].

STAKES EYEBROW
If nothing changes

STAKES HEADLINE
Next Month Will Probably Look a Lot Like This Month

STAKES BODY
You may stay [pain one], keep [pain two], and still feel unsure how to [desired action]. This lab will not fix everything in 45 minutes. It will help you stop drifting and take one clear, repeatable step.

MECHANISM EYEBROW
The pattern

MECHANISM HEADLINE
[Name of Pattern or Framework]

FRAMEWORK CARDS
[Part 1] — [one-sentence practical explanation]
[Part 2] — [one-sentence practical explanation]
[Part 3] — [one-sentence practical explanation]
[Part 4] — [one-sentence practical explanation]

OUTCOMES EYEBROW
What you'll walk away with

OUTCOMES HEADLINE
You'll Leave With [Concrete Result]

TAKEAWAYS
- A [specific tool]
- A [specific list or map]
- One [specific conversation or action]
- A [weekly rhythm or plan]
- A pattern you can pass on

AUDIENCE EYEBROW
Is this for you?

AUDIENCE HEADLINE
Who This Lab Is For

FINAL CTA HEADLINE
Stop [Painful Pattern]. Start With [Concrete Better Step].

FINAL CTA BODY
Join the [month] lab and leave with [specific result] you can use [timeframe/context].

BUTTON
Save My Seat
```
