export interface LabEvent {
  slug: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  url: string;
  description: string;
  calendarDescription: string;
}

export const LAB_EVENTS: Record<string, LabEvent> = {
  "aquila-priscilla-pattern": {
    slug: "aquila-priscilla-pattern",
    title: "The Aquila and Priscilla Pattern",
    date: "2026-07-15",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/aquila-and-priscilla-pattern.html",
    description:
      "Learn how ordinary work, hospitality, and relationships became a church-planting platform.\n\nSee a biblical pattern for multiplying disciples without separating ministry from normal life.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nLearn how ordinary work, hospitality, and relationships became a church-planting platform.\n\nSee a biblical pattern for multiplying disciples without separating ministry from normal life.",
  },
  "four-questions": {
    slug: "four-questions",
    title: "4 Questions to Get Started Making Disciples",
    date: "2026-08-19",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/4-questions.html",
    description:
      "Know who to reach, what to say, and how to help someone take the next step.\n\nWalk away with four simple questions you can use to start making disciples where you already live, work, and relate.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nKnow who to reach, what to say, and how to help someone take the next step.\n\nWalk away with four simple questions you can use to start making disciples where you already live, work, and relate.",
  },
  "church-circle-lab": {
    slug: "church-circle-lab",
    title: "The Church Circle",
    date: "2026-09-16",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/church-circle-lab.html",
    description:
      "A simple biblical map for practicing and multiplying church from Acts 2.\n\nLearn the Church Circle and the Two-Church Vision Cast: be in a church where you get trained, and start a church where you do what you learn.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nA simple biblical map for practicing and multiplying church from Acts 2.\n\nLearn the Church Circle and the Two-Church Vision Cast: be in a church where you get trained, and start a church where you do what you learn.",
  },
};

export function getLabEvent(slug: string): LabEvent | null {
  return LAB_EVENTS[slug] ?? null;
}
