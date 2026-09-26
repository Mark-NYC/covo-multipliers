// supabase/functions/send-lab-reminders/index.ts
//
// Covo Multipliers — Generic Lab Reminder Edge Function
//
// POST /functions/v1/send-lab-reminders[?dry_run=true]
// Headers: x-admin-secret: <REMINDER_ADMIN_SECRET>
// Body (optional): see modes below
//
// ── Modes ────────────────────────────────────────────────────────────────────
//
// Production (default):
//   No extra body fields required.
//   Finds all upcoming published events and all active registrations whose
//   relevant reminder timestamp is null and whose event falls inside the due
//   window. Sends HTML email via Resend. Stamps the column only after Resend
//   returns a message ID.
//
// Dry run:
//   URL: ?dry_run=true
//   No emails sent. No database writes. Returns the recipients who would
//   receive each reminder type if the function ran in production mode now.
//
// Forced test mode:
//   Body must include all three fields:
//     { "test_email": string, "test_type": "week"|"24h"|"1h", "event_slug": string }
//   Ignores reminder timing windows entirely.
//   Queries the events table for one published event matching event_slug.
//   Sends exactly one real email to test_email using that event and reminder type.
//   Never queries registrations. Never stamps any reminder column.
//   Returns: { mode, test_email, test_type, event_slug, event_title, resend_id }
//
//   test_email by itself is invalid — it requires both test_type and event_slug.
//
// Force send (real send, ignores timing window):
//   Body: { "force_send": true, "event_slug": string, "reminder_type": "week"|"24h"|"1h"|"10min"|"followup" }
//   Sends the real reminder email to every active registrant of the given
//   published event who has not already received that reminder type
//   (same recipient/stamping logic as production — safe to retry).
//   Combine with ?dry_run=true to preview recipients without sending.
//
// ── Reminder windows (events.event_date) ─────────────────────────────────────
//   week (5-day) → [now+4d,   now+5d)  — stamps reminder_week_sent_at
//   24h          → [now+23h,  now+24h) — stamps reminder_24h_sent_at
//   1h           → [now+10m,  now+1h)  — stamps reminder_1h_sent_at
//   10min        → [now,      now+10m) — stamps reminder_10min_sent_at
//
// NOTE: the 1h window starts at now+10m so it does not overlap the 10-minute
// window; this requires the scheduler to run at least every ~5 minutes for the
// 1h and 10min reminders to fire reliably.
//
// ── Multi-session events (e.g. the Four Fields Intensive) ────────────────────
//   Schedule lives in _shared/eventSessions.ts. events.event_date = session 1
//   start, so the four windows above cover session 1 as usual. Additionally:
//   session      → "starting in 1 hour" for each LATER session, same
//                  [now+10m, now+1h) window against that session's start.
//                  Tracked in registration_session_reminders.
//   followup     → timed off the LAST session's end: [end+15m, end+75m).
//                  (The generic followup never fires for these events.)
//   Force send / forced test accept reminder_type/test_type "session" with
//   a numeric "session_index" (1 = Day 2, 2 = Day 3).
//
// ── Required secrets (supabase secrets set KEY=value) ────────────────────────
//   REMINDER_ADMIN_SECRET    — value compared against x-admin-secret header
//   RESEND_API_KEY           — from resend.com dashboard
//   RESEND_FROM_EMAIL        — verified sender address, e.g. labs@covomultipliers.com
//
// ── Auto-injected by Supabase (do not set manually) ──────────────────────────
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type EventSession,
  formatSessionTime,
  getMultiSessionEvent,
  MULTI_SESSION_EVENTS,
  type MultiSessionEvent,
} from "../_shared/eventSessions.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;
const CALENDAR_BASE = "https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar";

// Optional per-event prep instructions, keyed by event slug. When a lab needs
// attendees to block extra time or bring materials, add a note here and it is
// surfaced as a "Come prepared" callout in the pre-lab reminder emails
// (week / 24h / 1h). Events with no entry render no callout — this keeps the
// event's public marketing `description` clean and leaves other labs unchanged.
const EVENT_PREP_NOTES: Record<string, string> = {
  "4-questions-to-get-started-august-2026":
    "Heads up — this lab runs a little longer than usual, closer to an hour. Come ready to take part: bring a piece of paper, your Bible, and a pen or pencil.",
  "four-fields-intensive-december-2026":
    "This is a live, three-session training — block all three sessions on your calendar now. Come ready to take part: camera on if you can, with your Bible, a notebook, and a pen.",
};

type ReminderType = "week" | "24h" | "1h" | "10min" | "followup";

const REMINDER_COLUMNS: Record<ReminderType, string> = {
  week: "reminder_week_sent_at",
  "24h": "reminder_24h_sent_at",
  "1h": "reminder_1h_sent_at",
  "10min": "reminder_10min_sent_at",
  followup: "followup_sent_at",
};

interface LabEvent {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_date: string;
  zoom_link: string | null;
}

interface OriginAttribution {
  first_utm_source: string | null;
  first_utm_medium: string | null;
  first_utm_campaign: string | null;
}

interface Recipient {
  registration_id: string;
  name: string;
  email: string;
  event: LabEvent;
  origin: OriginAttribution;
}

const NO_ORIGIN: OriginAttribution = { first_utm_source: null, first_utm_medium: null, first_utm_campaign: null };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed." });
  }

  // --- Auth ---
  const adminSecret = Deno.env.get("REMINDER_ADMIN_SECRET");
  const providedSecret = req.headers.get("x-admin-secret");

  if (!adminSecret || providedSecret !== adminSecret) {
    console.warn("[reminders] unauthorized — missing or invalid x-admin-secret");
    return jsonResp(401, { error: "Unauthorized." });
  }

  // --- Dry run flag ---
  const url = new URL(req.url);
  const isDryRun = url.searchParams.get("dry_run") === "true";

  // --- Parse body ---
  let body: Record<string, unknown> = {};
  try {
    body = await req.json().catch(() => ({})) as Record<string, unknown>;
  } catch {
    // no body is fine
  }

  const rawTestEmail  = typeof body.test_email  === "string" ? body.test_email.trim()  : null;
  const rawTestType   = typeof body.test_type   === "string" ? body.test_type.trim()   : null;
  const rawEventSlug  = typeof body.event_slug  === "string" ? body.event_slug.trim()  : null;

  // --- Force send mode: real send to real registrants, ignoring the timing window ---
  const rawForceSend    = body.force_send === true;
  const rawReminderType = typeof body.reminder_type === "string" ? body.reminder_type.trim() : null;
  const rawSessionIndex = typeof body.session_index === "number" ? body.session_index : null;
  const isForceSend = Boolean(rawForceSend && !rawTestEmail);

  if (isForceSend && rawReminderType === "session") {
    if (!rawEventSlug) {
      return jsonResp(400, { error: "event_slug is required when force_send is true." });
    }
    const ms = getMultiSessionEvent(rawEventSlug);
    if (!ms || rawSessionIndex === null || !Number.isInteger(rawSessionIndex) ||
        rawSessionIndex < 1 || rawSessionIndex >= ms.sessions.length) {
      return jsonResp(400, {
        error: "session reminders need a multi-session event_slug and a session_index from 1 to (sessions - 1).",
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";
    if (!resendApiKey && !isDryRun) {
      return jsonResp(500, { error: "RESEND_API_KEY is not configured." });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, title, slug, description, event_date, zoom_link")
      .eq("slug", rawEventSlug)
      .eq("is_published", true)
      .single();

    if (eventErr || !eventRow) {
      return jsonResp(404, { error: `Published event with slug "${rawEventSlug}" not found.` });
    }

    const event = eventRow as LabEvent;
    const result = await sendSessionReminderBatch(supabase, resendApiKey, fromEmail, event, ms, rawSessionIndex, isDryRun);

    return jsonResp(200, {
      mode: "force_send",
      dry_run: isDryRun,
      event_slug: event.slug,
      event_title: event.title,
      reminder_type: "session",
      session_index: rawSessionIndex,
      result,
    });
  }

  if (isForceSend) {
    if (!rawEventSlug) {
      return jsonResp(400, { error: "event_slug is required when force_send is true." });
    }
    if (
      rawReminderType !== "week" && rawReminderType !== "24h" &&
      rawReminderType !== "1h" && rawReminderType !== "10min" && rawReminderType !== "followup"
    ) {
      return jsonResp(400, {
        error: 'reminder_type must be "week", "24h", "1h", "10min", or "followup".',
      });
    }

    const type = rawReminderType as ReminderType;
    const column = REMINDER_COLUMNS[type];

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

    if (!resendApiKey && !isDryRun) {
      return jsonResp(500, { error: "RESEND_API_KEY is not configured." });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, title, slug, description, event_date, zoom_link")
      .eq("slug", rawEventSlug!)
      .eq("is_published", true)
      .single();

    if (eventErr || !eventRow) {
      return jsonResp(404, {
        error: `Published event with slug "${rawEventSlug}" not found.`,
      });
    }

    const event = eventRow as LabEvent;

    console.log(`[reminders] force send: type=${type} event="${event.title}" dry_run=${isDryRun}`);

    const result = await sendReminderBatch(supabase, resendApiKey, fromEmail, type, column, [event], isDryRun);

    return jsonResp(200, {
      mode: "force_send",
      dry_run: isDryRun,
      event_slug: event.slug,
      event_title: event.title,
      reminder_type: type,
      result,
    });
  }

  // --- Forced test mode: all three params present ---
  const isForcedTest = Boolean(rawTestEmail && rawTestType && rawEventSlug);

  if (isForcedTest) {
    if (!isEmail(rawTestEmail!)) {
      return jsonResp(400, { error: "test_email must be a valid email address." });
    }
    if (rawTestType !== "week" && rawTestType !== "24h" && rawTestType !== "1h" && rawTestType !== "10min" && rawTestType !== "followup" && rawTestType !== "session") {
      return jsonResp(400, { error: "test_type must be \"week\", \"24h\", \"1h\", \"10min\", \"followup\", or \"session\"." });
    }
    if (isDryRun) {
      return jsonResp(400, { error: "dry_run and forced test mode cannot both be set." });
    }

    const testEmailAddr = rawTestEmail!.toLowerCase();
    const isSessionTest = rawTestType === "session";
    const testType      = rawTestType as ReminderType;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail    = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

    if (!resendApiKey) {
      return jsonResp(500, { error: "RESEND_API_KEY is not configured." });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: eventRow, error: eventErr } = await supabase
      .from("events")
      .select("id, title, slug, description, event_date, zoom_link")
      .eq("slug", rawEventSlug!)
      .eq("is_published", true)
      .single();

    if (eventErr || !eventRow) {
      return jsonResp(404, {
        error: `Published event with slug "${rawEventSlug}" not found.`,
      });
    }

    const event = eventRow as LabEvent;

    let subject: string;
    let html: string;
    if (isSessionTest) {
      const ms = getMultiSessionEvent(event.slug);
      if (!ms || rawSessionIndex === null || !Number.isInteger(rawSessionIndex) ||
          rawSessionIndex < 1 || rawSessionIndex >= ms.sessions.length) {
        return jsonResp(400, {
          error: "session test needs a multi-session event_slug and a session_index from 1 to (sessions - 1).",
        });
      }
      const session = ms.sessions[rawSessionIndex];
      subject = buildSessionSubject(session, event.title);
      html = buildSessionEmail("there", event, ms, session);
    } else {
      subject = buildSubject(testType, event.title, event.slug);
      html = buildEmailHtml(testType, "there", event, NO_ORIGIN);
    }

    console.log(
      `[reminders] forced test: type=${rawTestType} event="${event.title}" to=${testEmailAddr}`,
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${fromEmail}>`,
        to: [testEmailAddr],
        subject,
        html,
      }),
    });

    const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (!res.ok) {
      console.error("[reminders] forced test Resend error:", JSON.stringify(resBody));
      return jsonResp(502, { error: "Resend rejected the email.", detail: resBody });
    }

    console.log(`[reminders] forced test sent, msg_id=${resBody.id ?? "unknown"}`);

    return jsonResp(200, {
      mode: "forced_test",
      test_email: testEmailAddr,
      test_type: rawTestType,
      event_slug: event.slug,
      event_title: event.title,
      resend_id: resBody.id ?? null,
    });
  }

  // Any forced test field requires all forced test fields.
  const hasAnyTestField = Boolean(rawTestEmail || rawTestType || rawEventSlug);

  if (hasAnyTestField && !isForcedTest) {
    return jsonResp(400, {
      error: "test_email, test_type, and event_slug are required together for forced test mode.",
    });
  }

  // --- Env vars ---
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!resendApiKey && !isDryRun) {
    console.error("[reminders] RESEND_API_KEY is not set");
    return jsonResp(500, { error: "RESEND_API_KEY is not configured." });
  }

  // --- Supabase admin client ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- Compute time windows ---
  const now = new Date();

  const windows: Record<ReminderType, { lower: Date; upper: Date; column: string }> = {
    week: {
      lower: addMs(now, 4 * 24 * 60 * 60 * 1000),
      upper: addMs(now, 5 * 24 * 60 * 60 * 1000),
      column: REMINDER_COLUMNS.week,
    },
    "24h": {
      lower: addMs(now, 23 * 60 * 60 * 1000),
      upper: addMs(now, 24 * 60 * 60 * 1000),
      column: REMINDER_COLUMNS["24h"],
    },
    "1h": {
      lower: addMs(now, 10 * 60 * 1000),
      upper: addMs(now, 60 * 60 * 1000),
      column: REMINDER_COLUMNS["1h"],
    },
    "10min": {
      lower: now,
      upper: addMs(now, 10 * 60 * 1000),
      column: REMINDER_COLUMNS["10min"],
    },
    followup: {
      lower: addMs(now, -165 * 60 * 1000),
      upper: addMs(now, -105 * 60 * 1000),
      column: REMINDER_COLUMNS.followup,
    },
  };

  // --- Query all upcoming published events (single query, reused below) ---
  const { data: upcomingEvents, error: eventsErr } = await supabase
    .from("events")
    .select("id, title, slug, description, event_date, zoom_link")
    .eq("is_published", true)
    .gte("event_date", now.toISOString())
    .order("event_date");

  if (eventsErr) {
    console.error("[reminders] events query failed:", JSON.stringify(eventsErr));
    return jsonResp(500, { error: "Failed to query events." });
  }

  const events: LabEvent[] = upcomingEvents ?? [];
  console.log(`[reminders] found ${events.length} upcoming published events`);

  // ---------------------------------------------------------------------------
  // Process each reminder type
  // ---------------------------------------------------------------------------

  const summary: Record<ReminderType, {
    eligible: number;
    sent: number;
    failed: number;
    skipped: number;
    would_send?: string[];
  }> = {
    week: { eligible: 0, sent: 0, failed: 0, skipped: 0 },
    "24h": { eligible: 0, sent: 0, failed: 0, skipped: 0 },
    "1h": { eligible: 0, sent: 0, failed: 0, skipped: 0 },
    "10min": { eligible: 0, sent: 0, failed: 0, skipped: 0 },
    followup: { eligible: 0, sent: 0, failed: 0, skipped: 0 },
  };

  for (const type of (["week", "24h", "1h", "10min", "followup"] as ReminderType[])) {
    const { lower, upper, column } = windows[type];

    // Events whose date falls in this reminder window. Multi-session events
    // get their followup from the last session's end (handled below), not
    // from event_date (= session 1 start).
    const dueEvents = events.filter(
      (e) => new Date(e.event_date) >= lower && new Date(e.event_date) < upper &&
        !(type === "followup" && getMultiSessionEvent(e.slug)),
    );

    if (dueEvents.length === 0) {
      console.log(`[reminders] ${type}: no events in window [${lower.toISOString()}, ${upper.toISOString()})`);
      continue;
    }

    console.log(
      `[reminders] ${type}: ${dueEvents.length} event(s) in window — ` +
      dueEvents.map((e) => `"${e.title}"`).join(", "),
    );

    summary[type] = await sendReminderBatch(supabase, resendApiKey, fromEmail, type, column, dueEvents, isDryRun);
  }

  // ---------------------------------------------------------------------------
  // Multi-session events: later-session reminders + end-of-event followup.
  // Queried separately because once session 1 has started, event_date is in
  // the past and the upcoming-events query above no longer returns them.
  // ---------------------------------------------------------------------------

  const sessionSummary: ReminderResult = { eligible: 0, sent: 0, failed: 0, skipped: 0 };
  const msSlugs = Object.keys(MULTI_SESSION_EVENTS);

  if (msSlugs.length > 0) {
    const { data: msRows, error: msErr } = await supabase
      .from("events")
      .select("id, title, slug, description, event_date, zoom_link")
      .eq("is_published", true)
      .in("slug", msSlugs);

    if (msErr) {
      console.error("[reminders] multi-session events query failed:", JSON.stringify(msErr));
    }

    for (const event of (msRows ?? []) as LabEvent[]) {
      const ms = getMultiSessionEvent(event.slug)!;

      for (let i = 1; i < ms.sessions.length; i++) {
        const start = new Date(ms.sessions[i].start);
        if (start >= windows["1h"].lower && start < windows["1h"].upper) {
          console.log(`[reminders] session: "${event.title}" ${ms.sessions[i].label} in window`);
          const r = await sendSessionReminderBatch(supabase, resendApiKey, fromEmail, event, ms, i, isDryRun);
          mergeResult(sessionSummary, r);
        }
      }

      const lastEnd = new Date(ms.sessions[ms.sessions.length - 1].end);
      const followLower = addMs(now, -75 * 60 * 1000);
      const followUpper = addMs(now, -15 * 60 * 1000);
      if (lastEnd >= followLower && lastEnd < followUpper) {
        console.log(`[reminders] followup: "${event.title}" (multi-session) in window`);
        const r = await sendReminderBatch(
          supabase, resendApiKey, fromEmail, "followup", REMINDER_COLUMNS.followup, [event], isDryRun,
        );
        mergeResult(summary.followup, r);
      }
    }
  }

  // --- Build totals ---
  const allResults = [...Object.values(summary), sessionSummary];
  const totalSent = allResults.reduce((n, s) => n + s.sent, 0);
  const totalFailed = allResults.reduce((n, s) => n + s.failed, 0);
  const totalSkipped = allResults.reduce((n, s) => n + s.skipped, 0);

  console.log(
    `[reminders] done: dry_run=${isDryRun} total_sent=${totalSent} total_failed=${totalFailed}`,
  );

  return jsonResp(200, {
    dry_run: isDryRun,
    results: { ...summary, session: sessionSummary },
    total_sent: totalSent,
    total_failed: totalFailed,
    total_skipped: totalSkipped,
  });
});

// ---------------------------------------------------------------------------
// Shared send/stamp logic — used by both the windowed production loop and
// the force-send mode.
// ---------------------------------------------------------------------------

interface ReminderResult {
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  would_send?: string[];
}

async function sendReminderBatch(
  supabase: ReturnType<typeof createClient>,
  resendApiKey: string | undefined,
  fromEmail: string,
  type: ReminderType,
  column: string,
  dueEvents: LabEvent[],
  isDryRun: boolean,
): Promise<ReminderResult> {
  const result: ReminderResult = { eligible: 0, sent: 0, failed: 0, skipped: 0 };

  if (dueEvents.length === 0) return result;

  // Fetch eligible registrations for all due events
  const { data: rows, error: regErr } = await supabase
    .from("registrations")
    .select("id, name, email, event_id, first_utm_source, first_utm_medium, first_utm_campaign")
    .in("event_id", dueEvents.map((e) => e.id))
    .eq("registration_status", "active")
    .not("email", "is", null)
    .is(column, null);

  if (regErr) {
    console.error(`[reminders] ${type}: registration query failed:`, JSON.stringify(regErr));
    return result;
  }

  // Build recipient list with event lookup
  const eventMap = new Map<string, LabEvent>(dueEvents.map((e) => [e.id, e]));

  const recipients: Recipient[] = (rows ?? [])
    .filter((r) => r.email?.trim())
    .map((r) => ({
      registration_id: r.id,
      name: r.name ?? "Friend",
      email: r.email.trim().toLowerCase(),
      event: eventMap.get(r.event_id)!,
      origin: {
        first_utm_source:   r.first_utm_source ?? null,
        first_utm_medium:   r.first_utm_medium ?? null,
        first_utm_campaign: r.first_utm_campaign ?? null,
      },
    }));

  result.eligible = recipients.length;
  console.log(`[reminders] ${type}: ${recipients.length} eligible recipients`);

  // Dry run: report and skip
  if (isDryRun) {
    result.would_send = recipients.map((r) => `${r.email} (${r.event.title})`);
    return result;
  }

  if (recipients.length === 0) return result;

  // Send in batches
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);

    const batchPayload = chunk.map((r) => ({
      from: `Covo Multipliers <${fromEmail}>`,
      to: [r.email],
      subject: buildSubject(type, r.event.title, r.event.slug),
      html: buildEmailHtml(type, r.name, r.event, r.origin),
    }));

    console.log(
      `[reminders] ${type}: sending batch ${Math.floor(i / BATCH_SIZE) + 1}` +
      ` (${i + 1}–${i + chunk.length} of ${recipients.length})`,
    );

    let batchResults: Array<{ id?: string } | null> = [];
    let batchOk = false;

    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchPayload),
      });

      const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (!res.ok) {
        console.error(`[reminders] ${type}: Resend batch error:`, JSON.stringify(resBody));
        result.failed += chunk.length;
        continue;
      }

      batchResults = Array.isArray(resBody.data)
        ? (resBody.data as Array<{ id?: string } | null>)
        : [];
      batchOk = true;
    } catch (err) {
      console.error(`[reminders] ${type}: fetch to Resend threw:`, err);
      result.failed += chunk.length;
      continue;
    }

    // Stamp rows only after Resend returns a message ID.
    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j];
      const sendRes = batchOk ? (batchResults[j] ?? null) : null;

      if (!sendRes?.id) {
        console.error(`[reminders] ${type}: no Resend ID for ${r.email}:`, JSON.stringify(sendRes));
        result.failed++;
        continue;
      }

      console.log(`[reminders] ${type}: sent to ${r.email} msg_id=${sendRes.id}`);

      const { error: updateErr } = await supabase
        .from("registrations")
        .update({ [column]: new Date().toISOString() })
        .eq("id", r.registration_id);

      if (updateErr) {
        console.error(
          `[reminders] ${type}: update failed for registration_id=${r.registration_id}:`,
          JSON.stringify(updateErr),
        );
        result.failed++;
      } else {
        console.log(`[reminders] ${type}: stamped registration_id=${r.registration_id}`);
        result.sent++;
      }
    }
  }

  return result;
}

function mergeResult(into: ReminderResult, from: ReminderResult): void {
  into.eligible += from.eligible;
  into.sent += from.sent;
  into.failed += from.failed;
  into.skipped += from.skipped;
  if (from.would_send) into.would_send = [...(into.would_send ?? []), ...from.would_send];
}

// "Starting in 1 hour" for a later session of a multi-session event. Same
// send-then-stamp contract as sendReminderBatch, but stamps a row in
// registration_session_reminders instead of a registrations column.
async function sendSessionReminderBatch(
  supabase: ReturnType<typeof createClient>,
  resendApiKey: string | undefined,
  fromEmail: string,
  event: LabEvent,
  ms: MultiSessionEvent,
  sessionIndex: number,
  isDryRun: boolean,
): Promise<ReminderResult> {
  const result: ReminderResult = { eligible: 0, sent: 0, failed: 0, skipped: 0 };
  const session = ms.sessions[sessionIndex];
  const tag = `session[${sessionIndex}]`;

  const { data: rows, error: regErr } = await supabase
    .from("registrations")
    .select("id, name, email")
    .eq("event_id", event.id)
    .eq("registration_status", "active")
    .not("email", "is", null);

  if (regErr) {
    console.error(`[reminders] ${tag}: registration query failed:`, JSON.stringify(regErr));
    return result;
  }

  type RegRow = { id: string; name: string | null; email: string | null };
  const regs = ((rows ?? []) as RegRow[]).filter((r) => r.email?.trim());
  if (regs.length === 0) return result;

  const { data: sentRows, error: sentErr } = await supabase
    .from("registration_session_reminders")
    .select("registration_id")
    .eq("session_index", sessionIndex)
    .in("registration_id", regs.map((r) => r.id));

  if (sentErr) {
    // Fail closed: without the sent list we can't avoid double-sending.
    console.error(`[reminders] ${tag}: sent-log query failed:`, JSON.stringify(sentErr));
    return result;
  }

  const alreadySent = new Set(((sentRows ?? []) as Array<{ registration_id: string }>).map((r) => r.registration_id));
  const recipients = regs
    .filter((r) => !alreadySent.has(r.id))
    .map((r) => ({ id: r.id, name: r.name ?? "Friend", email: r.email!.trim().toLowerCase() }));

  result.eligible = recipients.length;
  console.log(`[reminders] ${tag}: ${recipients.length} eligible recipients`);

  if (isDryRun) {
    result.would_send = recipients.map((r) => `${r.email} (${event.title} — ${session.label})`);
    return result;
  }

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((r) => ({
      from: `Covo Multipliers <${fromEmail}>`,
      to: [r.email],
      subject: buildSessionSubject(session, event.title),
      html: buildSessionEmail(r.name, event, ms, session),
    }));

    let ids: Array<{ id?: string } | null> = [];
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        console.error(`[reminders] ${tag}: Resend batch error:`, JSON.stringify(resBody));
        result.failed += chunk.length;
        continue;
      }
      ids = Array.isArray(resBody.data) ? (resBody.data as Array<{ id?: string } | null>) : [];
    } catch (err) {
      console.error(`[reminders] ${tag}: fetch to Resend threw:`, err);
      result.failed += chunk.length;
      continue;
    }

    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j];
      if (!ids[j]?.id) {
        console.error(`[reminders] ${tag}: no Resend ID for ${r.email}`);
        result.failed++;
        continue;
      }
      const { error: insErr } = await supabase
        .from("registration_session_reminders")
        .upsert({ registration_id: r.id, session_index: sessionIndex } as never, { ignoreDuplicates: true });
      if (insErr) {
        console.error(`[reminders] ${tag}: stamp failed for registration_id=${r.id}:`, JSON.stringify(insErr));
        result.failed++;
      } else {
        result.sent++;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Email subjects
// ---------------------------------------------------------------------------

function buildSessionSubject(session: EventSession, eventTitle: string): string {
  const day = session.label.split("·")[0].trim(); // "Day 2"
  return `${day} starts in 1 hour: ${eventTitle}`;
}

function followupVariant(slug: string): number {
  let hash = 0;
  for (const char of slug) hash = ((hash << 5) - hash) + char.charCodeAt(0);
  return Math.abs(hash) % 5;
}

function buildSubject(type: ReminderType, eventTitle: string, eventSlug?: string): string {
  switch (type) {
    case "week":  return `What you'll walk away with: ${eventTitle}`;
    case "24h":   return `Tomorrow: ${eventTitle}`;
    case "1h":    return `Starting in 1 hour: ${eventTitle}`;
    case "10min": return `We start in 10 minutes`;
    case "followup": {
      if (getMultiSessionEvent(eventSlug)) return "Don't let the weekend stay in your notes";
      if (!eventSlug) return "Next step: practice together";
      const variant = followupVariant(eventSlug);
      const subjects = [
        "Don't let this stay in your notes",
        "Pick one person this week",
        "The lab is not the finish line",
        "You need more than information",
        "What's your follow/fish goal?",
      ];
      return subjects[variant];
    }
  }
}

// ---------------------------------------------------------------------------
// Email HTML builders
// ---------------------------------------------------------------------------

function buildEmailHtml(type: ReminderType, fullName: string, event: LabEvent, origin: OriginAttribution): string {
  switch (type) {
    case "week":  return buildWeekEmail(fullName, event, origin);
    case "24h":   return build24hEmail(fullName, event, origin);
    case "1h":    return build1hEmail(fullName, event);
    case "10min": return build10minEmail(fullName, event);
    case "followup": return buildFollowupEmail(fullName, event, origin);
  }
}

function buildWeekEmail(fullName: string, event: LabEvent, origin: OriginAttribution): string {
  const firstName = firstWord(fullName);
  const description = event.description?.trim() ?? "";
  const { ms, noun } = eventKind(event);

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.65;">
      ${ms
        ? `<strong>${esc(event.title)}</strong> starts in 5 days. Here is the full schedule
      and a quick look at what you will walk away with.`
        : `The <strong>${esc(event.title)}</strong> lab is in 5 days.
      Here is a quick look at what you will walk away with.`}
    </p>

    ${description ? `
    <div style="background:#f9fafb;border-left:4px solid #1b4d3e;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:15px;color:#2d2d2d;line-height:1.7;">${esc(description).replace(/\n/g, "<br />")}</p>
    </div>` : ""}

    ${renderPrepNote(event)}
    ${renderDetailCard(event)}
    ${renderCalendarCta(event)}

    ${renderWhatsAppCta("lab_reminder_email", `The ${noun} is where we train. WhatsApp is where we practice. Apply to Join the Field Room before we meet.`, origin, "week_reminder")}

    <p style="margin:28px 0 0;font-size:15px;color:#555555;line-height:1.65;">
      Block out the time now so it's there when the day comes.
    </p>
    ${renderTransactionalFooter(event)}
  `, "What you'll walk away with", event);
}

function build24hEmail(fullName: string, event: LabEvent, origin: OriginAttribution): string {
  const firstName = firstWord(fullName);
  const { ms, noun } = eventKind(event);

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
      <strong>${esc(event.title)}</strong> ${ms ? "starts" : "is"} tomorrow.
      Come live if you can — this is practical and simple, and the people who show up
      live are the ones who walk away with a real next step.
    </p>

    ${renderPrepNote(event)}
    ${renderDetailCard(event)}
    ${renderJoinCta(event)}

    ${renderWhatsAppCta("lab_reminder_email", `The ${noun} is where we train. WhatsApp is where we practice. Apply to Join the Field Room before we meet.`, origin, "24h_reminder")}

    <p style="margin:28px 0 0;font-size:15px;color:#555555;line-height:1.65;">
      See you tomorrow.
    </p>
    ${renderTransactionalFooter(event)}
  `, "See you tomorrow", event);
}

function build1hEmail(fullName: string, event: LabEvent): string {
  const firstName = firstWord(fullName);

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
      <strong>${esc(event.title)}</strong> starts in one hour.
      Grab a notebook and come ready to work on one real situation —
      you'll leave with something you can use today.
    </p>

    ${renderPrepNote(event)}
    ${renderDetailCard(event)}
    ${renderJoinCta(event)}

    <p style="margin:28px 0 0;font-size:15px;color:#555555;">
      See you soon.
    </p>
    ${renderTransactionalFooter(event)}
  `, "Starting in 1 hour", event);
}

function build10minEmail(fullName: string, event: LabEvent): string {
  const firstName = firstWord(fullName);

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 4px;font-size:16px;color:#1a1a1a;line-height:1.6;font-weight:600;">
      We're starting in 10 minutes.
    </p>

    ${renderJoinCta(event)}

    <p style="margin:24px 0 0;font-size:15px;color:#444444;line-height:1.65;">
      Come live if you can. This will be practical, simple, and immediately usable.
    </p>
    ${renderTransactionalFooter(event)}
  `, "We start in 10 minutes", event);
}

function buildFollowupEmail(fullName: string, event: LabEvent, origin: OriginAttribution): string {
  const firstName = firstWord(fullName);
  if (getMultiSessionEvent(event.slug)) return buildMultiSessionFollowupEmail(firstName, event, origin);
  const variant = followupVariant(event.slug);

  const variants = [
    {
      heading: "Don't let this stay in your notes",
      body: `The win is not learning another tool. The win is obeying Jesus with one real person this week. Don't let the insights from the lab fade — put one into practice, with one person, this week.`,
    },
    {
      heading: "Pick one person this week",
      body: `You don't need to overthink the whole mission field. Don't be paralyzed by the size of the work. Start with one person God has already put near you — at work, at home, in your community.`,
    },
    {
      heading: "The lab is not the finish line",
      body: `A 45-minute lab can give you the tool and the clarity. But it cannot give you traction. Traction comes from practice — repeating the tool, seeing how it works, learning from real conversations.`,
    },
    {
      heading: "You need more than information",
      body: `Most people don't get stuck because they lack content. They get stuck because they're trying to practice alone. Apply to join the community and keep practicing with others who are learning the same things.`,
    },
    {
      heading: "What's your follow/fish goal?",
      body: `Before this fades: name your next step. How will you follow Jesus this week? And who will you fish for — who will you have a spiritual conversation with?`,
    },
  ];

  const v = variants[variant];

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.65;">
      ${v.body}
    </p>

    ${renderFollowupCta(event)}

    ${renderWhatsAppCta("post_lab_email", "Don't let the lab stay theoretical. Apply to Join the Field Room and keep practicing with us this week.", origin)}

    ${renderTransactionalFooter(event)}
  `, v.heading, event);
}

function buildMultiSessionFollowupEmail(firstName: string, event: LabEvent, origin: OriginAttribution): string {
  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.65;">
      Thank you for giving your weekend to <strong>${esc(event.title)}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.65;">
      You now have the path, the principles, and the tools. What you don't have yet is traction —
      and traction only comes from practice. Before Monday fills up, name two things:
    </p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:15px;color:#444444;line-height:1.7;">
      <li>the one field where you live, work, or play that you will work this week</li>
      <li>the one person in that field you will start with</li>
    </ul>
    <p style="margin:0 0 4px;font-size:15px;color:#444444;line-height:1.65;">
      Then don't practice alone.
    </p>

    ${renderFollowupCta(event)}

    ${renderWhatsAppCta("post_lab_email", "Don't let the intensive stay theoretical. Apply to Join the Field Room and keep practicing with us this week.", origin)}

    ${renderTransactionalFooter(event)}
  `, "Don't let the weekend stay in your notes", event);
}

// "Day 2 starts in 1 hour" — later sessions of a multi-session event.
function buildSessionEmail(fullName: string, event: LabEvent, ms: MultiSessionEvent, session: EventSession): string {
  const firstName = firstWord(fullName);
  const day = session.label.split("·")[0].trim();

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
      ${esc(day)} of <strong>${esc(event.title)}</strong> starts in one hour.
      Same Zoom link as before. Bring your notes and your Bible — we'll pick up right where we left off.
    </p>

    ${renderDetailCard(event, ms.sessions.indexOf(session))}
    ${renderJoinCta(event)}

    <p style="margin:28px 0 0;font-size:15px;color:#555555;">
      See you soon.
    </p>
    ${renderTransactionalFooter(event)}
  `, `${day} starts in 1 hour`, event);
}

// ---------------------------------------------------------------------------
// Shared email components
// ---------------------------------------------------------------------------

// Noun + header brand for an event: "lab" / "Covo Multipliers Labs" for
// normal labs, overridden by _shared/eventSessions.ts for multi-session events.
function eventKind(event: LabEvent): { ms: MultiSessionEvent | null; noun: string; brand: string } {
  const ms = getMultiSessionEvent(event.slug);
  return { ms, noun: ms?.noun ?? "lab", brand: ms?.brand ?? "Covo Multipliers Labs" };
}

function wrapEmail(body: string, headerTitle: string, event: LabEvent): string {
  const { brand } = eventKind(event);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10281f 0%,#1b4d3e 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">
                ${esc(brand)}
              </p>
              <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;line-height:1.2;">
                ${esc(headerTitle)}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              ${body}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Event-specific "Come prepared" callout, sourced from EVENT_PREP_NOTES.
// Returns empty string when the event has no prep note, so it can be dropped
// into any pre-lab email unconditionally.
function renderPrepNote(event: LabEvent): string {
  const note = EVENT_PREP_NOTES[event.slug];
  if (!note) return "";
  return `
    <div style="margin:0 0 24px;padding:16px 20px;background:#fbf7ec;border:1px solid #e6d9b3;border-left:4px solid #9f7a2f;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a28;">Come prepared</p>
      <p style="margin:0;font-size:15px;color:#2d2d2d;line-height:1.65;">${esc(note)}</p>
    </div>`;
}

// When / Where card. Multi-session events list every session; highlightIndex
// bolds the session an email is about.
function renderDetailCard(event: LabEvent, highlightIndex = -1): string {
  const ms = getMultiSessionEvent(event.slug);
  if (ms) {
    const rows = ms.sessions.map((sess, i) => `
      <tr${i % 2 === 0 ? ' style="background:#f9fafb;"' : ""}>
        <td style="padding:11px 14px;font-weight:600;color:#245c4a;white-space:nowrap;vertical-align:top;">${esc(sess.label.split("·")[0].trim())}</td>
        <td style="padding:11px 14px;color:#1a1a1a;${i === highlightIndex ? "font-weight:700;" : ""}">${esc(formatSessionTime(sess))}</td>
      </tr>`).join("");
    return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:15px;">
      ${rows}
      <tr>
        <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Where</td>
        <td style="padding:11px 14px;color:#1a1a1a;">Online (Zoom)</td>
      </tr>
    </table>`;
  }

  const dateStr = formatDate(event.event_date);
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:15px;">
      <tr style="background:#f9fafb;">
        <td style="padding:11px 14px;font-weight:600;color:#245c4a;width:80px;white-space:nowrap;">When</td>
        <td style="padding:11px 14px;color:#1a1a1a;">${esc(dateStr)}</td>
      </tr>
      <tr>
        <td style="padding:11px 14px;font-weight:600;color:#245c4a;">Where</td>
        <td style="padding:11px 14px;color:#1a1a1a;">Online</td>
      </tr>
    </table>`;
}

// --- CTA building blocks ------------------------------------------------------

// Large primary green button — used for "Join the Lab" (Zoom) and, when no Zoom
// link exists, repurposed for "Add to Calendar".
function renderPrimaryButton(href: string, label: string): string {
  return `
    <div style="text-align:center;margin:28px 0 0;">
      <a href="${esc(href)}"
         style="display:inline-block;padding:15px 40px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
        ${esc(label)}
      </a>
    </div>`;
}

// Single-action CTA for the 5-day reminder: the most useful step days out is
// getting the lab onto the calendar. One button, no competing links.
function renderCalendarCta(event: LabEvent): string {
  const calendarUrl = `${CALENDAR_BASE}?event=${encodeURIComponent(event.slug)}`;
  return renderPrimaryButton(calendarUrl, "Add to Calendar");
}

// Single-action CTA for the 24h / 1h / 10min reminders: the only goal close to
// the lab is joining live. One "Join the Lab" button with the branded redirect URL.
// No competing calendar CTA.
//   Zoom present → Join the Lab (primary, via branded redirect)
//   Zoom absent  → "sent before the lab" note
function renderJoinCta(event: LabEvent): string {
  const { ms } = eventKind(event);
  if (event.zoom_link) {
    const joinUrl = `https://www.covomultipliers.com/join-lab.html?event=${encodeURIComponent(event.slug)}`;
    return renderPrimaryButton(joinUrl, ms ? "Join the Intensive" : "Join the Lab");
  }

  return `
    <p style="text-align:center;margin:28px 0 0;font-size:14px;line-height:20px;color:#888888;">
      The Zoom link will be sent before ${ms ? "we start" : "the lab"}.
    </p>`;
}

// Secondary WhatsApp Field Room CTA — used as a soft next step below the primary action.
// Never replaces the primary CTA; always comes after it.
function renderWhatsAppCta(utmSource: string, copy: string, origin: OriginAttribution, utmContent?: string): string {
  const placement: Record<string, string> = {
    utm_source: utmSource,
    utm_medium: "email",
    utm_campaign: "whatsapp_field_room",
  };
  if (utmContent) placement.utm_content = utmContent;
  const url = whatsAppJoinUrl(placement, origin);
  return `
    <div style="margin:20px 0 0;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#15803d;">WhatsApp Field Room</p>
      <p style="margin:0 0 8px;font-size:13px;color:#374151;line-height:1.55;">${esc(copy)}</p>
      <a href="${esc(url)}" style="font-size:13px;font-weight:600;color:#15803d;text-decoration:underline;">Apply to Join the Field Room →</a>
    </div>`;
}

// Single-action CTA for the post-lab followup reminder: move from information
// to practice in community. One button, no competing links.
function renderFollowupCta(event: LabEvent): string {
  const nextStepUrl = `https://www.covomultipliers.com/lab-next-step.html?utm_source=email&utm_medium=postlab&utm_campaign=${encodeURIComponent(event.slug)}`;
  return renderPrimaryButton(nextStepUrl, "Apply to Join the Community of Practice");
}

function renderTransactionalFooter(event: LabEvent): string {
  const { ms } = eventKind(event);
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      You're receiving this because you registered for this CoVo Multipliers ${ms ? "training" : "Lab"}.
    </p>

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      CoVo Multipliers<br />
      14839 61st Road<br />
      Flushing, Queens, NYC
    </p>

    <p style="margin:0;font-size:12px;line-height:18px;color:#888888;">
      Questions? <a href="https://www.covomultipliers.com/contact.html" style="color:#1b4d3e;text-decoration:underline;">Contact us here</a>.
    </p>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a /join-whatsapp URL carrying both the placement UTMs (where on the
 * site/email the link lives) and, when known, the visitor's origin_utm_*
 * (their original acquisition channel — Substack, YouTube, podcast, ...).
 */
function whatsAppJoinUrl(placement: Record<string, string>, origin: OriginAttribution): string {
  const url = new URL("https://www.covomultipliers.com/join-whatsapp");
  for (const [k, v] of Object.entries(placement)) url.searchParams.set(k, v);
  if (origin.first_utm_source)   url.searchParams.set("origin_utm_source", origin.first_utm_source);
  if (origin.first_utm_medium)   url.searchParams.set("origin_utm_medium", origin.first_utm_medium);
  if (origin.first_utm_campaign) url.searchParams.set("origin_utm_campaign", origin.first_utm_campaign);
  return url.toString();
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function jsonResp(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
