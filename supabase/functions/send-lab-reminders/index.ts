// supabase/functions/send-lab-reminders/index.ts
//
// Covo Multipliers — Generic Lab Reminder Edge Function
//
// POST /functions/v1/send-lab-reminders[?dry_run=true]
// Headers: x-admin-secret: <REMINDER_ADMIN_SECRET>
// Body (optional): { "test_email"?: string }
//
// Sends reminder emails for all upcoming published labs in a single run.
// For each reminder type, this function finds every active registration
// whose event falls inside the due window and whose sent-at column is null,
// then sends HTML email via Resend and stamps the column.
//
// Reminder windows (checked against events.event_date):
//   week  (5-day)  → event_date in [now+4d, now+5d)   — stamps reminder_week_sent_at
//   24h            → event_date in [now+23h, now+24h)  — stamps reminder_24h_sent_at
//   1h             → event_date in [now,     now+1h)   — stamps reminder_1h_sent_at
//
// Modes:
//   (default)              — send to all eligible registrants; stamp sent timestamps
//   ?dry_run=true          — no emails sent; returns who would receive what
//   body.test_email        — send one real email per type to that address only; nothing stamped
//
// Required secrets (supabase secrets set KEY=value):
//   REMINDER_ADMIN_SECRET    — value compared against x-admin-secret header
//   RESEND_API_KEY           — from resend.com dashboard
//   RESEND_FROM_EMAIL        — verified sender address, e.g. labs@covomultipliers.com
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;
const CALENDAR_BASE = "https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/lab-calendar";

type ReminderType = "week" | "24h" | "1h";

interface LabEvent {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  event_date: string;
  zoom_link: string | null;
}

interface Recipient {
  registration_id: string;
  name: string;
  email: string;
  event: LabEvent;
}

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

  // --- Optional test_email ---
  let testEmail: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.test_email === "string" && body.test_email.trim().length > 0) {
      if (!isEmail(body.test_email)) {
        return jsonResp(400, { error: "test_email must be a valid email address." });
      }
      if (isDryRun) {
        return jsonResp(400, { error: "test_email and dry_run cannot both be set." });
      }
      testEmail = body.test_email.trim().toLowerCase();
    }
  } catch {
    // no body is fine
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
      column: "reminder_week_sent_at",
    },
    "24h": {
      lower: addMs(now, 23 * 60 * 60 * 1000),
      upper: addMs(now, 24 * 60 * 60 * 1000),
      column: "reminder_24h_sent_at",
    },
    "1h": {
      lower: now,
      upper: addMs(now, 60 * 60 * 1000),
      column: "reminder_1h_sent_at",
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
  };

  for (const type of (["week", "24h", "1h"] as ReminderType[])) {
    const { lower, upper, column } = windows[type];

    // Events whose date falls in this reminder window
    const dueEvents = events.filter(
      (e) => new Date(e.event_date) >= lower && new Date(e.event_date) < upper,
    );

    if (dueEvents.length === 0) {
      console.log(`[reminders] ${type}: no events in window [${lower.toISOString()}, ${upper.toISOString()})`);
      continue;
    }

    console.log(
      `[reminders] ${type}: ${dueEvents.length} event(s) in window — ` +
      dueEvents.map((e) => `"${e.title}"`).join(", "),
    );

    // Fetch eligible registrations for all due events
    const { data: rows, error: regErr } = await supabase
      .from("registrations")
      .select("id, name, email, event_id")
      .in("event_id", dueEvents.map((e) => e.id))
      .eq("registration_status", "active")
      .not("email", "is", null)
      .is(column, null);

    if (regErr) {
      console.error(`[reminders] ${type}: registration query failed:`, JSON.stringify(regErr));
      continue;
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
      }));

    summary[type].eligible = recipients.length;
    console.log(`[reminders] ${type}: ${recipients.length} eligible recipients`);

    // Dry run: report and skip
    if (isDryRun) {
      summary[type].would_send = recipients.map((r) => `${r.email} (${r.event.title})`);
      continue;
    }

    // Determine actual send list (test mode overrides recipient but not eligibility count)
    const sendList: Recipient[] = testEmail
      ? recipients.map((r) => ({ ...r, email: testEmail!, name: "there" })).slice(0, 1)
      : recipients;

    if (sendList.length === 0) continue;

    // Send in batches
    for (let i = 0; i < sendList.length; i += BATCH_SIZE) {
      const chunk = sendList.slice(i, i + BATCH_SIZE);

      const batchPayload = chunk.map((r) => ({
        from: `Covo Multipliers <${fromEmail}>`,
        to: [r.email],
        subject: buildSubject(type, r.event.title),
        html: buildEmailHtml(type, r.name, r.event),
      }));

      console.log(
        `[reminders] ${type}: sending batch ${Math.floor(i / BATCH_SIZE) + 1}` +
        ` (${i + 1}–${i + chunk.length} of ${sendList.length})`,
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
          summary[type].failed += chunk.length;
          continue;
        }

        batchResults = Array.isArray(resBody.data)
          ? (resBody.data as Array<{ id?: string } | null>)
          : [];
        batchOk = true;
      } catch (err) {
        console.error(`[reminders] ${type}: fetch to Resend threw:`, err);
        summary[type].failed += chunk.length;
        continue;
      }

      // Stamp rows — skip in test mode (we sent to testEmail, not real recipients)
      for (let j = 0; j < chunk.length; j++) {
        const r = chunk[j];
        const result = batchOk ? (batchResults[j] ?? null) : null;

        if (!result?.id) {
          console.error(`[reminders] ${type}: no Resend ID for ${r.email}:`, JSON.stringify(result));
          summary[type].failed++;
          continue;
        }

        console.log(`[reminders] ${type}: sent to ${r.email} msg_id=${result.id}`);

        if (testEmail) {
          // Test send succeeded — never touch the database
          summary[type].sent++;
          continue;
        }

        const originalRecipient = recipients[i + j];

        const { error: updateErr } = await supabase
          .from("registrations")
          .update({ [column]: new Date().toISOString() })
          .eq("id", originalRecipient.registration_id);

        if (updateErr) {
          console.error(
            `[reminders] ${type}: update failed for registration_id=${originalRecipient.registration_id}:`,
            JSON.stringify(updateErr),
          );
          summary[type].failed++;
        } else {
          console.log(`[reminders] ${type}: stamped registration_id=${originalRecipient.registration_id}`);
          summary[type].sent++;
        }
      }
    }

    // Registrations that were eligible but not in the send list (test mode skip)
    if (testEmail) {
      summary[type].skipped = Math.max(0, recipients.length - 1);
    }
  }

  // --- Build totals ---
  const totalSent = Object.values(summary).reduce((n, s) => n + s.sent, 0);
  const totalFailed = Object.values(summary).reduce((n, s) => n + s.failed, 0);
  const totalSkipped = Object.values(summary).reduce((n, s) => n + s.skipped, 0);

  console.log(
    `[reminders] done: dry_run=${isDryRun} test_email=${testEmail ?? "none"} ` +
    `total_sent=${totalSent} total_failed=${totalFailed}`,
  );

  return jsonResp(200, {
    dry_run: isDryRun,
    ...(testEmail ? { test_email: testEmail } : {}),
    results: summary,
    total_sent: totalSent,
    total_failed: totalFailed,
    total_skipped: totalSkipped,
  });
});

// ---------------------------------------------------------------------------
// Email subjects
// ---------------------------------------------------------------------------

function buildSubject(type: ReminderType, eventTitle: string): string {
  switch (type) {
    case "week": return `What you'll walk away with: ${eventTitle}`;
    case "24h":  return `Tomorrow: ${eventTitle}`;
    case "1h":   return `Starting in 1 hour: ${eventTitle}`;
  }
}

// ---------------------------------------------------------------------------
// Email HTML builders
// ---------------------------------------------------------------------------

function buildEmailHtml(type: ReminderType, fullName: string, event: LabEvent): string {
  switch (type) {
    case "week": return buildWeekEmail(fullName, event);
    case "24h":  return build24hEmail(fullName, event);
    case "1h":   return build1hEmail(fullName, event);
  }
}

function buildWeekEmail(fullName: string, event: LabEvent): string {
  const firstName = firstWord(fullName);
  const dateStr = formatDate(event.event_date);
  const description = event.description?.trim() ?? "";

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 20px;font-size:15px;color:#444444;line-height:1.65;">
      The <strong>${esc(event.title)}</strong> lab is in 5 days.
      Here is a quick look at what you will walk away with.
    </p>

    ${description ? `
    <div style="background:#f9fafb;border-left:4px solid #1b4d3e;border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 24px;">
      <p style="margin:0;font-size:15px;color:#2d2d2d;line-height:1.7;">${esc(description).replace(/\n/g, "<br />")}</p>
    </div>` : ""}

    ${renderDetailCard(dateStr)}
    ${renderCalendarButton(event.slug)}
    <p style="margin:16px 0 0;font-size:14px;color:#888888;text-align:center;">
      The Zoom link will be sent before the lab.
    </p>

    <p style="margin:28px 0 0;font-size:15px;color:#555555;line-height:1.65;">
      We look forward to seeing you there.
    </p>
    ${renderTransactionalFooter()}
  `, "What you'll walk away with");
}

function build24hEmail(fullName: string, event: LabEvent): string {
  const firstName = firstWord(fullName);
  const dateStr = formatDate(event.event_date);

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
      <strong>${esc(event.title)}</strong> is tomorrow.
      This is a free 45-minute live lab — come ready to think about real people, not theory.
    </p>

    ${renderDetailCard(dateStr)}
    ${renderCalendarButton(event.slug)}
    <p style="margin:16px 0 0;font-size:14px;color:#888888;text-align:center;">
      The Zoom link will be sent before the lab.
    </p>

    <p style="margin:28px 0 0;font-size:15px;color:#555555;line-height:1.65;">
      See you tomorrow.
    </p>
    ${renderTransactionalFooter()}
  `, "See you tomorrow");
}

function build1hEmail(fullName: string, event: LabEvent): string {
  const firstName = firstWord(fullName);
  const dateStr = formatDate(event.event_date);

  const joinSection = event.zoom_link
    ? `<div style="text-align:center;margin:28px 0 8px;">
        <a href="${esc(event.zoom_link)}"
           style="display:inline-block;padding:14px 32px;background:#1b4d3e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
          Join the Lab
        </a>
      </div>
      <p style="text-align:center;margin:0 0 28px;font-size:13px;color:#888888;">
        ${esc(dateStr)}
      </p>`
    : `${renderDetailCard(dateStr)}
       <p style="margin:8px 0 28px;font-size:14px;color:#888888;text-align:center;">
         The Zoom link will be sent before the lab.
       </p>`;

  return wrapEmail(`
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${esc(firstName)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#444444;line-height:1.65;">
      <strong>${esc(event.title)}</strong> starts in one hour.
      Bring a notebook and come ready to engage with what you are already doing.
    </p>

    ${joinSection}

    <p style="margin:0;font-size:15px;color:#555555;">
      See you soon.
    </p>
    ${renderTransactionalFooter()}
  `, "Starting in 1 hour");
}

// ---------------------------------------------------------------------------
// Shared email components
// ---------------------------------------------------------------------------

function wrapEmail(body: string, headerTitle: string): string {
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
                Covo Multipliers Labs
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

function renderDetailCard(dateStr: string): string {
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

function renderCalendarButton(slug: string): string {
  const calendarUrl = `${CALENDAR_BASE}?event=${encodeURIComponent(slug)}`;
  return `
    <div style="text-align:center;margin:24px 0 8px;">
      <a href="${esc(calendarUrl)}"
         style="display:inline-block;padding:12px 26px;background:#1b4d3e;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
        Add to Calendar
      </a>
    </div>`;
}

function renderTransactionalFooter(): string {
  return `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />

    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#888888;">
      You're receiving this because you registered for this CoVo Multipliers Lab.
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
