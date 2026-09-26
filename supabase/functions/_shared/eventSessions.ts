// supabase/functions/_shared/eventSessions.ts
//
// Multi-session events (e.g. a 3-day intensive) on top of the single-session
// lab infrastructure.
//
// The events table stores ONE event_date per event. For a normal lab that is
// the whole story. For a multi-session event, events.event_date is the start
// of the FIRST session (so seat counts, "upcoming" filters, registration and
// the week/24h/1h/10min reminders keep working unchanged), and the full
// session schedule lives here, keyed by events.slug.
//
// Consumers:
//   - register            → confirmation email lists every session
//   - send-lab-reminders  → per-session "starting in 1 hour" emails for
//                           sessions after the first, and the follow-up
//                           email timed off the LAST session's end
//   - lab-calendar        → .ics file with one VEVENT per session
//
// Session times are ISO-8601 UTC. December is EST (UTC-5).

export interface EventSession {
  label: string; // e.g. "Day 1 · Friday"
  start: string; // ISO UTC
  end: string; // ISO UTC
}

export interface MultiSessionEvent {
  dbSlug: string; // events.slug
  pageSlug: string; // lab-calendar key / event_slug in the registration POST
  noun: string; // "intensive" — replaces "lab" in email copy
  brand: string; // email header eyebrow
  pageUrl: string;
  sessions: EventSession[];
}

export const MULTI_SESSION_EVENTS: Record<string, MultiSessionEvent> = {
  "four-fields-intensive-december-2026": {
    dbSlug: "four-fields-intensive-december-2026",
    pageSlug: "four-fields-intensive",
    noun: "intensive",
    brand: "Covo Multipliers Training",
    pageUrl: "https://www.covomultipliers.com/four-fields-intensive.html",
    sessions: [
      // Fri Dec 4, 6:30–9:30 PM ET
      { label: "Day 1 · Friday", start: "2026-12-04T23:30:00Z", end: "2026-12-05T02:30:00Z" },
      // Sat Dec 5, 9:00 AM–4:00 PM ET
      { label: "Day 2 · Saturday", start: "2026-12-05T14:00:00Z", end: "2026-12-05T21:00:00Z" },
      // Sun Dec 6, 1:00–4:00 PM ET
      { label: "Day 3 · Sunday", start: "2026-12-06T18:00:00Z", end: "2026-12-06T21:00:00Z" },
    ],
  },
};

export function getMultiSessionEvent(dbSlug: string | null | undefined): MultiSessionEvent | null {
  if (!dbSlug) return null;
  return MULTI_SESSION_EVENTS[dbSlug] ?? null;
}

export function getMultiSessionEventByPageSlug(pageSlug: string | null | undefined): MultiSessionEvent | null {
  if (!pageSlug) return null;
  return Object.values(MULTI_SESSION_EVENTS).find((e) => e.pageSlug === pageSlug) ?? null;
}

// "Friday, December 4 · 6:30–9:30 PM EST"
export function formatSessionTime(session: EventSession): string {
  const tz = "America/New_York";
  const start = new Date(session.start);
  const end = new Date(session.end);
  const day = start.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: tz,
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const startT = time(start);
  const endT = time(end);
  const zone = end.toLocaleTimeString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop();
  // Drop the AM/PM on the start when both ends share it: "6:30–9:30 PM".
  const [sNum, sMer] = startT.split(" ");
  const [eNum, eMer] = endT.split(" ");
  const range = sMer === eMer ? `${sNum}–${eNum} ${eMer}` : `${startT}–${endT}`;
  return `${day} · ${range} ${zone}`;
}
