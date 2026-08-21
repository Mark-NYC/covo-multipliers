import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface LabEvent {
  slug: string;
  dbSlug: string;
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
    dbSlug: "aquila-and-priscilla-pattern-jul-2026",
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
    dbSlug: "4-questions-to-get-started-august-2026",
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
    dbSlug: "church-circle-september-2026",
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
  "disciple-making-rhythm": {
    slug: "disciple-making-rhythm",
    dbSlug: "disciple-making-rhythm-october-2026",
    title: "From Intention to Disciple-Making Traction",
    date: "2026-10-21",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/disciple-making-rhythm.html",
    description:
      "Move from good intentions to real traction in making disciples where you live, work, and play.\n\nBuild a simple, repeatable rhythm using CFC — commitment, focus, and consistency — and count the cost to actually start.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nMove from good intentions to real traction in making disciples where you live, work, and play. Build a simple, repeatable rhythm using CFC — commitment, focus, and consistency — and count the cost to actually start.",
  },
  "whats-blocking-your-disciple-making": {
    slug: "whats-blocking-your-disciple-making",
    // TODO: confirm this matches the real Supabase events.slug for the November
    // event (used only by send-lab-reminders for the Zoom-link lookup and the
    // alias below; the Add to Calendar button uses the LAB_SLUG key above).
    dbSlug: "whats-blocking-your-disciple-making-november-2026",
    title: "What's Holding Back Your Disciple-Making?",
    date: "2026-11-18",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/whats-blocking-your-disciple-making.html",
    description:
      "Use the Muddy Boots Church Planter Assessment to identify what is limiting your disciple-making and choose a practical next step.\n\nAssess four parts of a muddy boots church planter — Head, Heart, Hands, and Harvester — and leave with one next step you can take within seven days.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nUse the Muddy Boots Church Planter Assessment to examine your Head, Heart, Hands, and Harvester practice. You'll identify what may be limiting your disciple-making and choose a practical next step you can take within seven days.",
  },

  // ── 2027 spring/summer series (repeat of the 2026 May–August labs) ────────
  "from-lost-to-leader-2027": {
    slug: "from-lost-to-leader-2027",
    dbSlug: "from-lost-to-leader-may-2027",
    title: "From Lost to Leader",
    date: "2027-05-19",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/from-lost-to-leader-2027.html",
    description:
      "You want your life to matter for the Kingdom, not just your church attendance.\n\nGet practical help for building a life that makes disciples where you live, work, and play.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nYou want your life to matter for the Kingdom, not just your church attendance. Get practical help for building a life that makes disciples where you live, work, and play.",
  },
  "rhythms-of-a-covo-multiplier-2027": {
    slug: "rhythms-of-a-covo-multiplier-2027",
    dbSlug: "rhythms-of-a-covo-multiplier-jun-2027",
    title: "Rhythms of a Covo Multiplier",
    date: "2027-06-16",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/rhythms-of-a-covo-multiplier-2027.html",
    description:
      "Get introduced to the 5 rhythms of the 4 Fields pathway.\n\nA framework for where to go, how to start spiritual conversations, share the gospel, disciple, gather believers, and guide emerging leaders.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nGet introduced to the 5 rhythms of the 4 Fields pathway — a framework for where to go, how to start spiritual conversations, share the gospel, disciple, gather believers, and guide emerging leaders.",
  },
  "aquila-priscilla-pattern-2027": {
    slug: "aquila-priscilla-pattern-2027",
    dbSlug: "aquila-and-priscilla-pattern-jul-2027",
    title: "The Aquila and Priscilla Pattern",
    date: "2027-07-21",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/aquila-and-priscilla-pattern-2027.html",
    description:
      "Learn how ordinary work, hospitality, and relationships became a church-planting platform.\n\nSee a biblical pattern for multiplying disciples without separating ministry from normal life.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nLearn how ordinary work, hospitality, and relationships became a church-planting platform.\n\nSee a biblical pattern for multiplying disciples without separating ministry from normal life.",
  },
  "four-questions-2027": {
    slug: "four-questions-2027",
    dbSlug: "4-questions-to-get-started-august-2027",
    title: "4 Questions to Get Started Making Disciples",
    date: "2027-08-18",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/4-questions-2027.html",
    description:
      "Know who to reach, what to say, and how to help someone take the next step.\n\nWalk away with four simple questions you can use to start making disciples where you already live, work, and relate.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nKnow who to reach, what to say, and how to help someone take the next step.\n\nWalk away with four simple questions you can use to start making disciples where you already live, work, and relate.",
  },

  // ── December 2026 ─────────────────────────────────────────────────────────
  "start-spiritual-conversations": {
    slug: "start-spiritual-conversations",
    dbSlug: "start-spiritual-conversations-december-2026",
    title: "Start Spiritual Conversations Naturally",
    date: "2026-12-16",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/start-spiritual-conversations-naturally.html",
    description:
      "Learn how to start natural conversations with the people around you and let them grow into real gospel conversations that lead to open Bible discovery.\n\nWalk away with the Conversation Box tool and practical soft-skill conversation starters you can keep in your tool belt.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nLearn how to start natural conversations with the people around you and let them grow into real gospel conversations that lead to open Bible discovery. Walk away with the Conversation Box tool and practical soft-skill conversation starters you can keep in your tool belt.",
  },

  // ── January 2027 ──────────────────────────────────────────────────────────
  "find-your-field": {
    slug: "find-your-field",
    dbSlug: "find-your-field-january-2027",
    title: "Find Your Field",
    date: "2027-01-20",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/find-your-field-lab.html",
    description:
      "Discover where God has already placed you to make disciples.\n\nSee the harvest fields already in your life — passions, people, places, and profession — choose one field, and leave with a concrete next step to enter it.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nDiscover where God has already placed you to make disciples. See the harvest fields already in your life — passions, people, places, and profession — choose one field, and leave with a concrete next step to enter it.",
  },

  // ── February 2027 ─────────────────────────────────────────────────────────
  "always-have-a-story-ready": {
    slug: "always-have-a-story-ready",
    dbSlug: "always-have-a-story-ready-february-2027",
    title: "Always Have a Story of Hope Ready",
    date: "2027-02-17",
    startTime: "15:00",
    endTime: "15:45",
    timezone: "America/New_York",
    location: "Online",
    url: "https://www.covomultipliers.com/always-have-a-story-ready.html",
    description:
      "Learn a simple method for internalizing two short stories of Jesus so you can share them naturally when spiritual conversations open.",
    calendarDescription:
      "Online. Zoom link will be sent before the lab.\n\nLearn a simple method for internalizing Stories of Hope. You'll practice retelling two short stories of Jesus and choose the people or situations where you will share them.",
  },
};

// Aliases: map Supabase events.slug values to the same entry as their lab-calendar key.
// Used by send-lab-reminders, which builds calendar URLs from events.slug.
LAB_EVENTS["aquila-and-priscilla-pattern-jul-2026"] = LAB_EVENTS["aquila-priscilla-pattern"];
LAB_EVENTS["4-questions-to-get-started-august-2026"] = LAB_EVENTS["four-questions"];
LAB_EVENTS["church-circle-september-2026"] = LAB_EVENTS["church-circle-lab"];
LAB_EVENTS["disciple-making-rhythm-october-2026"] = LAB_EVENTS["disciple-making-rhythm"];
// TODO: confirm the dbSlug matches Supabase events.slug before relying on this alias.
LAB_EVENTS["whats-blocking-your-disciple-making-november-2026"] = LAB_EVENTS["whats-blocking-your-disciple-making"];
// 2027 spring/summer series aliases.
LAB_EVENTS["from-lost-to-leader-may-2027"] = LAB_EVENTS["from-lost-to-leader-2027"];
LAB_EVENTS["rhythms-of-a-covo-multiplier-jun-2027"] = LAB_EVENTS["rhythms-of-a-covo-multiplier-2027"];
LAB_EVENTS["aquila-and-priscilla-pattern-jul-2027"] = LAB_EVENTS["aquila-priscilla-pattern-2027"];
LAB_EVENTS["4-questions-to-get-started-august-2027"] = LAB_EVENTS["four-questions-2027"];
// December 2026 alias.
LAB_EVENTS["start-spiritual-conversations-december-2026"] = LAB_EVENTS["start-spiritual-conversations"];
// January 2027 alias.
LAB_EVENTS["find-your-field-january-2027"] = LAB_EVENTS["find-your-field"];
// February 2027 alias.
LAB_EVENTS["always-have-a-story-ready-february-2027"] = LAB_EVENTS["always-have-a-story-ready"];

function getLabEvent(slug: string): LabEvent | null {
  return LAB_EVENTS[slug] ?? null;
}

// Look up the live Zoom join link for a lab from Supabase at request time.
// We deliberately do NOT hardcode Zoom links in this file so they never enter
// the git repository. Returns null on any failure so the calendar download
// always succeeds (it just falls back to the "sent before the lab" wording).
//
// NOTE: this endpoint is public and unauthenticated, so any Zoom link returned
// here is effectively public for that lab's slug. That is an accepted tradeoff:
// each lab uses a unique link, the meetings have Zoom Waiting Room enabled, and
// a leaked link can be rotated per-lab without affecting others.
async function getZoomLink(dbSlug: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return null;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("events")
      .select("zoom_link")
      .eq("slug", dbSlug)
      .eq("is_published", true)
      .single();

    if (error || !data) return null;
    const link = (data as { zoom_link: string | null }).zoom_link;
    return link && link.trim().length > 0 ? link.trim() : null;
  } catch (err) {
    console.error("lab-calendar getZoomLink failed", err);
    return null;
  }
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

  // Pull the live Zoom link from the DB. When present, the calendar event makes
  // it easy to join live (LOCATION: Zoom + link in DESCRIPTION, URL, CONFERENCE).
  // When absent, fall back to the existing "sent before the lab" wording.
  const zoomLink = await getZoomLink(event.dbSlug);
  console.log("lab-calendar zoom link present", Boolean(zoomLink));

  const location = zoomLink ? "Zoom" : event.location;
  const description = zoomLink
    ? `Join on Zoom: ${zoomLink}\n\n${event.description}`
    : event.calendarDescription;
  // URI-typed properties (URL, CONFERENCE) are not text-escaped, matching the
  // existing URL handling. When Zoom exists, point the event at the join link.
  const eventUrl = zoomLink ?? event.url;

  const lines = [
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
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `URL:${eventUrl}`,
  ];

  // Dedicated conferencing property (RFC 7986) for clients that surface a
  // "Join" button directly from the calendar event.
  if (zoomLink) {
    lines.push(`CONFERENCE;VALUE=URI;FEATURE=VIDEO;LABEL=Zoom:${zoomLink}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  const ics = lines.join("\r\n");

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
