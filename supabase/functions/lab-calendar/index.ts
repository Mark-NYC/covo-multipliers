import { getLabEvent } from "../_shared/labEvents.ts";

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
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("event");

  if (!slug) {
    return new Response(
      JSON.stringify({ success: false, error: "Lab event not found." }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...cors },
      }
    );
  }

  const event = getLabEvent(slug);

  if (!event) {
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
