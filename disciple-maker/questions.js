// Disciple Maker Next Step — V2 (recognition-first)
// =============================================================================
// A short, behavioral flow that helps someone RECOGNIZE why disciple making
// has not yet become their lifestyle, then routes them toward apprenticeship.
//
// This is NOT a scored assessment. There are no dimensions, no averages, no
// radar chart, no maturity labels. Questions ask about recent, concrete
// behavior. The engine narrows to two candidate "recognitions" and the person
// chooses which one is true (recognition beats inference on thin data).
//
// Shared by:
//   - take.html      (renders questions, runs the flow)
//   - results.html   (renders outcome copy)
//   - disciple-maker-submit (edge fn mirrors OUTCOME keys + routing for email)
// =============================================================================

const NEXT_STEP = {
  // ---------------------------------------------------------------------------
  // QUESTIONS
  // Formats: 'choice' (single select). Each option carries the answer `value`.
  // `showIf(a)` lets a question be skipped when it isn't relevant.
  // The final two steps (recognition-confirm + optional note) are handled
  // specially by take.html — they are not in this list.
  // ---------------------------------------------------------------------------
  questions: [
    {
      id: "q1_recency",
      eyebrow: "Recent practice",
      text: "When did you last intentionally take a conversation toward Jesus with someone who isn't a committed follower?",
      options: [
        { value: "this_week", label: "This week" },
        { value: "this_month", label: "In the last month" },
        { value: "months", label: "A few months ago" },
        { value: "longer", label: "Longer ago — or I'm not sure I ever have" },
      ],
    },
    {
      id: "q2_field",
      eyebrow: "Your everyday field",
      text: "Can you name specific people in your life right now who aren't yet following Jesus?",
      options: [
        { value: "several", label: "Yes — several come to mind" },
        { value: "one_two", label: "One or two" },
        { value: "not_really", label: "Not really" },
        { value: "around_christians", label: "My life is mostly around other Christians" },
      ],
    },
    {
      id: "q3_tool",
      eyebrow: "Practice, not theory",
      text: "Have you practiced a disciple-making tool — your story, a gospel picture, a discovery Bible conversation — with a real person outside of a class or training?",
      options: [
        { value: "recently", label: "Yes, recently" },
        { value: "once_twice", label: "Once or twice" },
        { value: "learned_not_used", label: "I've learned tools but haven't used them" },
        { value: "none", label: "I don't have a tool I'd reach for" },
      ],
    },
    {
      id: "q4_followup",
      eyebrow: "Following up",
      text: "Think of the last person who seemed spiritually open. What happened next?",
      options: [
        { value: "kept_meeting", label: "I followed up and we kept meeting" },
        { value: "meant_to", label: "I meant to follow up but didn't" },
        { value: "didnt_know", label: "I wasn't sure what to do next" },
        { value: "no_one", label: "There hasn't really been someone" },
      ],
    },
    {
      id: "q5_consume",
      eyebrow: "An honest read",
      text: "Which is closest to true for you right now?",
      options: [
        { value: "learning_more", label: "I'm learning and listening more than I'm actually practicing" },
        { value: "even", label: "I'm practicing about as much as I'm learning" },
        { value: "practicing_more", label: "I'm practicing more than I'm consuming" },
      ],
    },
    {
      id: "q6_rhythm",
      eyebrow: "A place in your week",
      text: "Does disciple making have a real place in your week — a time, a rhythm, or a person you meet?",
      options: [
        { value: "consistently", label: "Yes, consistently" },
        { value: "sometimes", label: "Sometimes" },
        { value: "whenever", label: "No — it's whenever it happens to happen" },
      ],
    },
    {
      id: "q7_stalled",
      eyebrow: "Being honest about walls",
      text: "Have you tried to make disciples, hit a wall or an awkward moment, and quietly slowed down or stopped?",
      // Only ask people who show some evidence of having started.
      showIf: (a) =>
        ["this_week", "this_month"].includes(a.q1_recency) ||
        ["recently", "once_twice"].includes(a.q3_tool) ||
        ["kept_meeting", "meant_to"].includes(a.q4_followup),
      options: [
        { value: "yes", label: "Yes — that's honestly me" },
        { value: "little", label: "A little" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "q8_practitioner",
      eyebrow: "Who's with you",
      text: "Right now, is there a practitioner — someone actually doing this — helping you take your next step?",
      options: [
        { value: "yes", label: "Yes, I have that" },
        { value: "informal", label: "Sort of — informally" },
        { value: "alone", label: "No, I'm figuring it out on my own" },
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // OUTCOMES — six recognitions. Each is a mirror, not a label.
  // `statement` is the first-person line shown in the recognition-confirm step.
  // Rich result copy (headline, what-this-is-not, message, CTA) lives in
  // results.html keyed by these same ids. The edge function keeps a parallel
  // map for the email (barrier_summary + seven_day_step).
  // ---------------------------------------------------------------------------
  outcomes: {
    learning_not_practicing: {
      statement: "I've learned more about disciple making than I've actually practiced.",
    },
    intending_not_acting: {
      statement: "I really intend to do this, but it hasn't made it into my actual week.",
    },
    no_relational_field: {
      statement: "There isn't really anyone near me right now to practice this with.",
    },
    started_but_stalled: {
      statement: "I started, hit a wall, and quietly slowed down.",
    },
    practicing_alone: {
      statement: "I'm actually doing this — but mostly by myself.",
    },
    reproducing_widen: {
      statement: "This is becoming a lifestyle; I'm ready to help others do it too.",
    },
  },

  // ---------------------------------------------------------------------------
  // ROUTING — score each outcome from the answers, return them ranked.
  // No single "first blocked gate", no fake precision: we surface the TOP TWO
  // as candidates and let the person confirm which is true.
  // Returns: [{ key, score }, ...] sorted desc (only score > 0).
  // ---------------------------------------------------------------------------
  scoreOutcomes(a) {
    const s = {
      learning_not_practicing: 0,
      intending_not_acting: 0,
      no_relational_field: 0,
      started_but_stalled: 0,
      practicing_alone: 0,
      reproducing_widen: 0,
    };

    const hasField = ["several", "one_two"].includes(a.q2_field);
    const noField = ["not_really", "around_christians"].includes(a.q2_field);
    const practicingSignals =
      ["this_week", "this_month"].includes(a.q1_recency) ||
      ["recently", "once_twice"].includes(a.q3_tool) ||
      a.q4_followup === "kept_meeting";

    // No relational field — the most foundational gap.
    if (noField) s.no_relational_field += 3;
    if (a.q4_followup === "no_one") s.no_relational_field += 1;
    if (a.q1_recency === "longer" && noField) s.no_relational_field += 1;

    // Learning without practicing.
    if (a.q3_tool === "learned_not_used") s.learning_not_practicing += 2;
    if (a.q5_consume === "learning_more") s.learning_not_practicing += 2;
    if (["months", "longer"].includes(a.q1_recency) && a.q3_tool !== "recently")
      s.learning_not_practicing += 1;

    // Intending without acting — has people, wants to, but no rhythm/action.
    if (hasField && a.q6_rhythm === "whenever") s.intending_not_acting += 2;
    if (hasField && ["months", "longer"].includes(a.q1_recency) && !practicingSignals)
      s.intending_not_acting += 2;
    if (a.q4_followup === "meant_to") s.intending_not_acting += 1;

    // Started but stalled.
    if (a.q7_stalled === "yes") s.started_but_stalled += 3;
    if (a.q7_stalled === "little") s.started_but_stalled += 1;
    if (a.q4_followup === "didnt_know" && practicingSignals) s.started_but_stalled += 1;

    // Practicing but alone.
    if (practicingSignals && ["alone", "informal"].includes(a.q8_practitioner))
      s.practicing_alone += 2;
    if (practicingSignals && a.q6_rhythm === "sometimes") s.practicing_alone += 1;
    if (a.q4_followup === "kept_meeting" && a.q8_practitioner === "alone")
      s.practicing_alone += 1;

    // Reproducing — ready to widen.
    if (
      practicingSignals &&
      a.q8_practitioner === "yes" &&
      a.q4_followup === "kept_meeting" &&
      a.q6_rhythm === "consistently"
    )
      s.reproducing_widen += 4;

    const ranked = Object.entries(s)
      .map(([key, score]) => ({ key, score }))
      .filter((o) => o.score > 0)
      .sort((x, y) => y.score - x.score || this._priority(x.key) - this._priority(y.key));

    // Guarantee at least one candidate.
    if (ranked.length === 0) ranked.push({ key: "learning_not_practicing", score: 1 });
    return ranked;
  },

  // Tie-break order (most foundational first).
  _priority(key) {
    return [
      "no_relational_field",
      "learning_not_practicing",
      "intending_not_acting",
      "started_but_stalled",
      "practicing_alone",
      "reproducing_widen",
    ].indexOf(key);
  },

  // Top two candidate outcome keys for the recognition-confirm step.
  candidateOutcomes(a) {
    const ranked = this.scoreOutcomes(a);
    const keys = ranked.map((o) => o.key);
    if (keys.length === 1) {
      // Add a sensible second so the person always has a real choice.
      const fallback = ["intending_not_acting", "learning_not_practicing", "practicing_alone"].find(
        (k) => k !== keys[0],
      );
      keys.push(fallback);
    }
    return keys.slice(0, 2);
  },

  // Which questions apply to a given answer set (respects showIf).
  activeQuestions(a) {
    return this.questions.filter((q) => (q.showIf ? q.showIf(a) : true));
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = NEXT_STEP; // for node-based unit tests
}
