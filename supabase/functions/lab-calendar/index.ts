interface LabEvent {
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

const LAB_EVENTS: Record<string, LabEvent> = {
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

function getLabEvent(slug: string): LabEvent | null {
  return LAB_EVENTS[slug] ?? null;
}

const ALLOWED_ORIGINS = [
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function dtstamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z"
  );
}

function toIcsDateTime(date: string, time: string): string {
  // date: "2026-07-15", time: "15:00" → "20260715T150000"
  const datePart = date.replace(/-/g, "");
  const timePart = time.replace(":", "") + "00";
  return `${datePart}T${timePart}`;
}

Deno.serve(async (req: Request) => {
  console.log("lab-calendar request received", req.method, req.url);

  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("event");
  console.log("lab-calendar slug", slug);

  if (!slug) {
    console.log("lab-calendar event not found");
    return new Response(
      JSON.stringify({ success: false, error: "Lab event not found." }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }

  const event = getLabEvent(slug);
  console.log("lab-calendar event found", Boolean(event));

  if (!event) {
    console.log("lab-calendar event not found");
    return new Response(
      JSON.stringify({ success: false, error: "Lab event not found." }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }

  const uid = `${event.slug}-${event.date.replace(/-/g, "")}@covomultipliers.com`;
  const dtstart = toIcsDateTime(event.date, event.startTime);
  const dtend = toIcsDateTime(event.date, event.endTime);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CoVo Multipliers//Labs//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp()}`,
    `DTSTART;TZID=${event.timezone}:${dtstart}`,
    `DTEND;TZID=${event.timezone}:${dtend}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.calendarDescription)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `URL:${event.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  console.log("lab-calendar returning ICS", event.slug);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
      ...cors,
    },
  });
});
