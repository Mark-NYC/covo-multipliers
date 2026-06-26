// Disciple Maker Pathway Assessment - Questions & Dimensions
// 8 dimensions × 4 questions each = 32 total questions

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
      key: "obedience",
      name: "Obedience",
      description: "Are you practicing?",
      color: "#2d6a4f",
      questions: [
        {
          id: "o2",
          text: "During the past month I intentionally moved at least one conversation toward spiritual things.",
          type: "agreement"
        },
        {
          id: "o3",
          text: "I have shared the gospel with someone in the past month.",
          type: "agreement"
        },
        {
          id: "o4",
          text: "I have invited someone to read Scripture with me.",
          type: "agreement"
        },
        {
          id: "o6",
          text: "I have helped someone take a next step in following Jesus.",
          type: "agreement"
        }
      ]
    },
    {
      key: "consistency",
      name: "Consistency",
      description: "Are you faithful week after week?",
      color: "#40916c",
      questions: [
        {
          id: "c1",
          text: "I consistently spend time with Jesus through prayer and Scripture.",
          type: "agreement"
        },
        {
          id: "c2",
          text: "I intentionally make time each week for disciple making.",
          type: "agreement"
        },
        {
          id: "c4",
          text: "I generally follow through on commitments I make.",
          type: "agreement"
        },
        {
          id: "c5",
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
          id: "cb2",
          text: "I welcome honest feedback.",
          type: "agreement"
        },
        {
          id: "cb3",
          text: "Temporary incompetence does not discourage me.",
          type: "agreement"
        },
        {
          id: "cb4",
          text: "I would rather obey one lesson than learn ten new ones.",
          type: "agreement"
        },
        {
          id: "cb5",
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
          text: "I know where I could begin meeting with someone around Scripture.",
          type: "agreement"
        },
        {
          id: "em4",
          text: "I can identify my primary mission field.",
          type: "agreement"
        }
      ]
    },
    {
      key: "multiplication",
      name: "Multiplication",
      description: "Are you helping others reproduce?",
      color: "#95d5b2",
      questions: [
        {
          id: "m1",
          text: "I expect the people I disciple to eventually disciple others.",
          type: "agreement"
        },
        {
          id: "m2",
          text: "I intentionally look for faithful people to invest in.",
          type: "agreement"
        },
        {
          id: "m4",
          text: "I enjoy developing leaders more than being the primary leader.",
          type: "agreement"
        },
        {
          id: "m5",
          text: "I believe simple, reproducible practices are more valuable than impressive programs.",
          type: "agreement"
        }
      ]
    },
    {
      key: "holy_spirit",
      name: "Dependence on Holy Spirit",
      description: "Are you Spirit-led?",
      color: "#a8dadc",
      questions: [
        {
          id: "hs1",
          text: "I regularly ask God to guide my conversations.",
          type: "agreement"
        },
        {
          id: "hs3",
          text: "I listen for the Spirit's leading throughout my week.",
          type: "agreement"
        },
        {
          id: "hs4",
          text: "I pray before stepping into disciple-making opportunities.",
          type: "agreement"
        },
        {
          id: "hs5",
          text: "I depend on God more than my own ability.",
          type: "agreement"
        }
      ]
    },
    {
      key: "hunger",
      name: "Hunger",
      description: "Do you actually want this?",
      color: "#f4a261",
      questions: [
        {
          id: "h2",
          text: "I want to see people follow Jesus more than I want to stay comfortable.",
          type: "agreement"
        },
        {
          id: "h3",
          text: "I make room in my schedule for disciple making.",
          type: "agreement"
        },
        {
          id: "h4",
          text: "I'm willing to rearrange my life around Jesus' mission.",
          type: "agreement"
        },
        {
          id: "h5",
          text: "I actively look for opportunities to obey what I'm learning.",
          type: "agreement"
        }
      ]
    }
  ],

  // Likert scale definition
  scale: [
    { value: 1, label: "Strongly Disagree" },
    { value: 2, label: "Disagree" },
    { value: 3, label: "Neutral" },
    { value: 4, label: "Agree" },
    { value: 5, label: "Strongly Agree" }
  ],

  // Helper functions
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
  }
};
