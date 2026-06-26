// Disciple Maker Pathway Assessment - Questions & Dimensions
// 5 dimensions × 4-5 questions each = 20 total questions
// Consolidated for speed, focus, and completion rate

const ASSESSMENT_QUESTIONS = {
  dimensions: [
    {
      key: "vision",
      name: "Vision",
      description: "Do you believe in the mission?",
      color: "#1b4d3e",
      questions: [
        {
          id: "v1",
          text: "I believe every follower of Jesus is called to make disciples.",
          type: "agreement"
        },
        {
          id: "v2",
          text: "I want my everyday life to become my primary mission field.",
          type: "agreement"
        },
        {
          id: "v4",
          text: "I care more about making disciples than simply attending church.",
          type: "agreement"
        },
        {
          id: "v5",
          text: "I believe multiplication is God's normal strategy for advancing His Kingdom.",
          type: "agreement"
        }
      ]
    },
    {
      key: "practice",
      name: "Practice",
      description: "Are you actually doing it?",
      color: "#2d6a4f",
      questions: [
        {
          id: "p1",
          text: "During the past month I intentionally moved at least one conversation toward spiritual things.",
          type: "agreement"
        },
        {
          id: "p2",
          text: "I have shared the gospel with someone in the past month.",
          type: "agreement"
        },
        {
          id: "p3",
          text: "I have invited someone to read Scripture with me.",
          type: "agreement"
        },
        {
          id: "p4",
          text: "I have helped someone take a next step in following Jesus.",
          type: "agreement"
        },
        {
          id: "p5",
          text: "I pray and depend on God's leading in my spiritual conversations.",
          type: "agreement"
        }
      ]
    },
    {
      key: "rhythm",
      name: "Rhythm",
      description: "Are you staying faithful week after week?",
      color: "#40916c",
      questions: [
        {
          id: "r1",
          text: "I consistently spend time with Jesus through prayer and Scripture.",
          type: "agreement"
        },
        {
          id: "r2",
          text: "I intentionally make time each week for disciple making.",
          type: "agreement"
        },
        {
          id: "r3",
          text: "I generally follow through on commitments I make.",
          type: "agreement"
        },
        {
          id: "r4",
          text: "I have weekly rhythms that help me stay spiritually healthy.",
          type: "agreement"
        }
      ]
    },
    {
      key: "coachability",
      name: "Coachability",
      description: "Will you let someone sharpen you?",
      color: "#52b788",
      questions: [
        {
          id: "c1",
          text: "I welcome honest feedback.",
          type: "agreement"
        },
        {
          id: "c2",
          text: "Temporary incompetence does not discourage me.",
          type: "agreement"
        },
        {
          id: "c3",
          text: "I would rather obey one lesson than learn ten new ones.",
          type: "agreement"
        },
        {
          id: "c4",
          text: "I enjoy practicing ministry alongside others.",
          type: "agreement"
        }
      ]
    },
    {
      key: "everyday_mission",
      name: "Everyday Mission",
      description: "Do you know where God sent you?",
      color: "#74c69d",
      questions: [
        {
          id: "em1",
          text: "I know the people God has placed around me who need Jesus.",
          type: "agreement"
        },
        {
          id: "em2",
          text: "I already have meaningful relationships with people who are far from God.",
          type: "agreement"
        },
        {
          id: "em3",
          text: "I can identify my primary mission field.",
          type: "agreement"
        }
      ]
    }
  ],

  scale: [
    { value: 1, label: "Strongly Disagree" },
    { value: 2, label: "Disagree" },
    { value: 3, label: "Neutral" },
    { value: 4, label: "Agree" },
    { value: 5, label: "Strongly Agree" }
  ],

  getAllQuestions() {
    return this.dimensions.flatMap(d =>
      d.questions.map(q => ({ ...q, dimension: d.key }))
    );
  },

  getDimensionById(key) {
    return this.dimensions.find(d => d.key === key);
  },

  getTotalQuestions() {
    return this.dimensions.reduce((sum, d) => sum + d.questions.length, 0);
  },

  getCoachingMessage(questionNumber) {
    if (questionNumber === 5) {
      return "Great start. Your honest answers will make this much more useful.";
    }
    if (questionNumber === 10) {
      return "You're halfway there. We're starting to see a clearer picture.";
    }
    if (questionNumber === 15) {
      return "Almost done. Just a few more questions to go.";
    }
    if (questionNumber === 18) {
      return "You're almost there. Your Disciple Maker Snapshot is almost ready.";
    }
    return null;
  }
};
