// supabase/functions/send-lost-to-leader-reminder/index.ts
//
// Covo Multipliers — Lost to Leader Lab Reminder Edge Function
//
// POST /functions/v1/send-lost-to-leader-reminder
// Headers: x-admin-secret: <ADMIN_EMAIL_SEND_SECRET>
// Body: { "type": "24_hour" | "1_hour" }
//
// 1. Verify the admin secret header — returns 401 if missing or wrong.
// 2. Resolve the Lost to Leader event ID from the events table.
// 3. Query all registrations for that event where the relevant reminder
//    timestamp is null (i.e. reminder has not yet been sent).
// 4. Send emails via Resend in batches of 100.
// 5. After each successful send, mark that row's reminder column with the
//    current timestamp so it is never re-sent.
// 6. Return a JSON summary.
//
// Required secrets (set with: supabase secrets set KEY=value):
//   ADMIN_EMAIL_SEND_SECRET     — shared secret for the x-admin-secret header
//   RESEND_API_KEY              — from resend.com dashboard
//   FROM_EMAIL                  — verified Resend sender address
//   LOST_TO_LEADER_ZOOM_LINK    — Zoom link inserted into each email
//   LOST_TO_LEADER_START_TIME   — human-readable start time, e.g. "7:00 PM ET"
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_SLUG = "from-lost-to-leader-may-2026";
const BATCH_SIZE = 100;

type ReminderType = "24_hour" | "1_hour";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed." });
  }

  // --- Auth ---
  const adminSecret = Deno.env.get("ADMIN_EMAIL_SEND_SECRET");
  const providedSecret = req.headers.get("x-admin-secret");

  if (!adminSecret || providedSecret !== adminSecret) {
    console.warn("[reminder] unauthorized request — invalid or missing x-admin-secret header");
    return jsonResp(401, { error: "Unauthorized." });
  }

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "Request body must be valid JSON." });
  }

  const { type } = body;
  if (type !== "24_hour" && type !== "1_hour") {
    return jsonResp(400, { error: "type must be \"24_hour\" or \"1_hour\"." });
  }

  const reminderType = type as ReminderType;
  const sentAtColumn = reminderType === "24_hour"
    ? "reminder_24h_sent_at"
    : "reminder_1h_sent_at";

  // --- Env vars ---
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL") ?? "labs@covomultipliers.com";
  const zoomLink = Deno.env.get("LOST_TO_LEADER_ZOOM_LINK") ?? "(Zoom link not configured)";
  const startTime = Deno.env.get("LOST_TO_LEADER_START_TIME") ?? "(time not configured)";

  if (!resendApiKey) {
    console.error("[reminder] RESEND_API_KEY is not set");
    return jsonResp(500, { error: "RESEND_API_KEY is not configured." });
  }

  // --- Supabase admin client ---
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // --- Resolve event ID from slug ---
  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, title")
    .eq("slug", EVENT_SLUG)
    .single();

  if (eventErr || !event) {
    console.error("[reminder] event lookup failed:", JSON.stringify(eventErr));
    return jsonResp(404, {
      error: `Event with slug "${EVENT_SLUG}" not found. Has it been created in the events table?`,
    });
  }

  console.log(`[reminder] resolved event: id=${event.id} title="${event.title}"`);

  // --- Query recipients ---
  // Fetch registrations for this event that:
  //   (a) have an email address, and
  //   (b) have not yet received this reminder (column is null).
  const { data: rows, error: queryErr } = await supabase
    .from("registrations")
    .select("id, name, email")
    .eq("event_id", event.id)
    .not("email", "is", null)
    .is(sentAtColumn, null);

  if (queryErr) {
    console.error("[reminder] registration query failed:", JSON.stringify(queryErr));
    return jsonResp(500, { error: "Failed to query registrations." });
  }

  // Filter out rows with an empty email just in case
  const recipients = (rows ?? []).filter((r) => r.email && r.email.trim().length > 0);
  const totalFound = recipients.length;

  console.log(`[reminder] type=${reminderType} event_id=${event.id} recipients=${totalFound}`);

  if (totalFound === 0) {
    return jsonResp(200, {
      type: reminderType,
      total_found: 0,
      sent_count: 0,
      failed_count: 0,
      failed_emails: [],
    });
  }

  // --- Send in batches ---
  let sentCount = 0;
  const failedEmails: string[] = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);

    const subject = reminderType === "24_hour"
      ? "Tomorrow: Lost to Leader Lab"
      : "Starting in 1 hour: Lost to Leader Lab";

    const batchPayload = chunk.map((r) => ({
      from: `Mark <${fromEmail}>`,
      to: [r.email],
      subject,
      text: buildEmailText(reminderType, r.name, zoomLink, startTime),
    }));

    console.log(
      `[reminder] sending batch ${Math.floor(i / BATCH_SIZE) + 1}: emails ${i + 1}–${i + chunk.length}`,
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
        console.error("[reminder] Resend batch error:", JSON.stringify(resBody));
        for (const r of chunk) failedEmails.push(r.email);
        continue;
      }

      // Resend batch response: { data: [{ id: "..." }, ...] }
      batchResults = Array.isArray(resBody.data)
        ? (resBody.data as Array<{ id?: string } | null>)
        : [];

      batchOk = true;
    } catch (err) {
      console.error("[reminder] fetch to Resend threw:", err);
      for (const r of chunk) failedEmails.push(r.email);
      continue;
    }

    // Update rows individually — only mark sent for emails with a returned ID.
    for (let j = 0; j < chunk.length; j++) {
      const r = chunk[j];
      const result = batchOk ? (batchResults[j] ?? null) : null;

      if (result?.id) {
        const { error: updateErr } = await supabase
          .from("registrations")
          .update({ [sentAtColumn]: new Date().toISOString() })
          .eq("id", r.id);

        if (updateErr) {
          console.error(
            `[reminder] update failed for registration_id=${r.id} email=${r.email}:`,
            JSON.stringify(updateErr),
          );
          failedEmails.push(r.email);
        } else {
          console.log(`[reminder] sent + marked: email=${r.email} msg_id=${result.id}`);
          sentCount++;
        }
      } else {
        console.error(
          `[reminder] no Resend message ID for email=${r.email}, result=`,
          JSON.stringify(result),
        );
        failedEmails.push(r.email);
      }
    }
  }

  console.log(
    `[reminder] done: type=${reminderType} total=${totalFound} sent=${sentCount} failed=${failedEmails.length}`,
  );

  return jsonResp(200, {
    type: reminderType,
    total_found: totalFound,
    sent_count: sentCount,
    failed_count: failedEmails.length,
    failed_emails: failedEmails,
  });
});

// ---------------------------------------------------------------------------
// Email content
// ---------------------------------------------------------------------------

function buildEmailText(
  type: ReminderType,
  fullName: string,
  zoomLink: string,
  startTime: string,
): string {
  const firstName = firstWord(fullName);

  if (type === "24_hour") {
    return `Hey ${firstName},

Tomorrow we're hosting the Lost to Leader Lab.

This is a 45-minute working lab for leaders who don't just want more activity, but want a clearer path for helping people move from spiritually lost to active disciple-makers.

We'll focus on two simple questions:

1. Do you clearly see your harvest field?
2. Do you know how to help someone take their first steps with Jesus through simple habits and rhythms?

Here's the link to join:

${zoomLink}

Starts at: ${startTime}

Come ready to think about real people, not theory.

See you tomorrow,
Mark`;
  }

  return `Hey ${firstName},

The Lost to Leader Lab starts in 1 hour.

Here's the link to join:

${zoomLink}

Bring a notebook and come ready to name your field and the next person you're helping take a step.

See you soon,
Mark`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

function jsonResp(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
