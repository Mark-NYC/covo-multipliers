// supabase/functions/weekly-report/index.ts
//
// Weekly Lab Admin Report
// POST /functions/v1/weekly-report
// Headers: x-admin-secret: <REMINDER_ADMIN_SECRET>
//
// Generates a digest email covering the past 7 days and sends it to all
// LAB_ADMIN_EMAILS via Resend. Supports ?dry_run=true to return the rendered
// HTML without sending.
//
// Required secrets:
//   REMINDER_ADMIN_SECRET    — shared with send-lab-reminders
//   RESEND_API_KEY
//   RESEND_FROM_EMAIL        — verified sender, e.g. labs@covomultipliers.com
//   LAB_ADMIN_EMAILS         — comma-separated recipient list
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonResp(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed." });
  }

  const adminSecret = Deno.env.get("REMINDER_ADMIN_SECRET");
  const provided = req.headers.get("x-admin-secret");
  if (!adminSecret || provided !== adminSecret) {
    return jsonResp(401, { error: "Unauthorized." });
  }

  const isDryRun = new URL(req.url).searchParams.get("dry_run") === "true";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    // --- Fetch data ---
    const [eventsRes, regsRes, attRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, slug, title, event_date, seat_limit")
        .eq("is_published", true)
        .order("event_date", { ascending: true }),
      supabase
        .from("registrations")
        .select("id, email, event_id, registration_status, utm_source, first_utm_source, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("lab_attendance")
        .select("registration_id, status"),
    ]);

    if (eventsRes.error) throw new Error(`events: ${eventsRes.error.message}`);
    if (regsRes.error) throw new Error(`registrations: ${regsRes.error.message}`);
    if (attRes.error) throw new Error(`attendance: ${attRes.error.message}`);

    const allEvents: any[] = eventsRes.data || [];
    const allRegs: any[] = regsRes.data || [];
    const allAtt: any[] = attRes.data || [];

    const upcomingEvents = allEvents.filter((e) => new Date(e.event_date) >= startOfToday);
    const pastEvents = allEvents.filter((e) => new Date(e.event_date) < startOfToday);

    const eventById = new Map<string, any>();
    allEvents.forEach((e) => eventById.set(e.id, e));

    const upcomingIds = new Set(upcomingEvents.map((e) => e.id));

    // Active registrations grouped by event
    const activeByEvent = new Map<string, any[]>();
    allRegs.forEach((r) => {
      if (r.registration_status !== "active") return;
      if (!activeByEvent.has(r.event_id)) activeByEvent.set(r.event_id, []);
      activeByEvent.get(r.event_id)!.push(r);
    });

    // --- Velocity this week ---
    const signupsThisWeek = allRegs.filter(
      (r) =>
        r.registration_status === "active" &&
        upcomingIds.has(r.event_id) &&
        new Date(r.created_at) >= weekAgo,
    ).length;

    // --- Per-lab summaries ---
    // Pace benchmark: for each past lab, how many active signups at d days before event.
    const signupsByDaysBefore = (event: any, daysLeft: number): number => {
      const cutoff = new Date(event.event_date).getTime() - daysLeft * DAY_MS;
      return (activeByEvent.get(event.id) || []).filter(
        (r: any) => new Date(r.created_at).getTime() <= cutoff,
      ).length;
    };

    interface LabRow {
      title: string;
      eventDate: string;
      daysLeft: number;
      activeSignups: number;
      maxSeats: number | null;
      seatsRemaining: number | null;
      paceLabel: string; // "Ahead", "On track", "Behind", "No benchmark"
      paceColor: string; // hex
      paceDelta: number | null;
    }

    const labRows: LabRow[] = upcomingEvents.map((event) => {
      const active = (activeByEvent.get(event.id) || []).length;
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / DAY_MS),
      );
      const maxSeats = event.seat_limit ?? null;
      const seatsRemaining = maxSeats !== null ? Math.max(maxSeats - active, 0) : null;

      let paceLabel = "No benchmark";
      let paceColor = "#888888";
      let paceDelta: number | null = null;

      if (pastEvents.length > 0) {
        const samples = pastEvents.map((p: any) => signupsByDaysBefore(p, daysLeft));
        const avg = samples.reduce((a: number, b: number) => a + b, 0) / samples.length;
        if (avg > 0) {
          paceDelta = Math.round(((active - avg) / avg) * 100);
          if (paceDelta > 10) { paceLabel = `+${paceDelta}% — Ahead`; paceColor = "#15803d"; }
          else if (paceDelta < -10) { paceLabel = `${paceDelta}% — Behind`; paceColor = "#b91c1c"; }
          else { paceLabel = `${paceDelta >= 0 ? "+" : ""}${paceDelta}% — On track`; paceColor = "#a16207"; }
        } else {
          paceLabel = active > 0 ? "Ahead" : "On track";
          paceColor = "#15803d";
        }
      }

      return {
        title: event.title || event.slug,
        eventDate: event.event_date,
        daysLeft,
        activeSignups: active,
        maxSeats,
        seatsRemaining,
        paceLabel,
        paceColor,
        paceDelta,
      };
    });

    // --- Top channels this week ---
    const channelMap = new Map<string, number>();
    allRegs
      .filter(
        (r) =>
          r.registration_status === "active" &&
          upcomingIds.has(r.event_id) &&
          new Date(r.created_at) >= weekAgo,
      )
      .forEach((r) => {
        const src = (r.first_utm_source || r.utm_source || "direct / unknown").toString();
        channelMap.set(src, (channelMap.get(src) || 0) + 1);
      });
    const topChannels = Array.from(channelMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    // --- New vs. returning across upcoming labs ---
    const regById = new Map<string, any>();
    allRegs.forEach((r) => regById.set(r.id, r));

    const returnerEmails = new Set<string>();
    allAtt.forEach((att) => {
      if (att.status !== "attended" && att.status !== "partial") return;
      const reg = regById.get(att.registration_id);
      if (!reg) return;
      const ev = eventById.get(reg.event_id);
      if (ev && new Date(ev.event_date) < startOfToday) {
        returnerEmails.add(reg.email);
      }
    });

    let totalNew = 0;
    let totalReturning = 0;
    upcomingEvents.forEach((event) => {
      (activeByEvent.get(event.id) || []).forEach((r: any) => {
        if (returnerEmails.has(r.email)) totalReturning++;
        else totalNew++;
      });
    });

    // --- Alerts (problems) ---
    const behindLabs = labRows.filter((l) => l.paceDelta !== null && l.paceDelta < -10);
    const fullLabs = labRows.filter(
      (l) => l.maxSeats && l.seatsRemaining !== null && l.seatsRemaining === 0,
    );

    // --- Wins (celebrations) ---
    const nearlyFullLabs = labRows.filter(
      (l) => l.maxSeats && l.seatsRemaining !== null && l.seatsRemaining > 0 && l.seatsRemaining <= 5,
    );
    const aheadLabs = labRows.filter((l) => l.paceDelta !== null && l.paceDelta > 10);

    // --- Build email ---
    const html = buildEmail({
      generatedAt: now,
      weekStart: weekAgo,
      signupsThisWeek,
      labRows,
      topChannels,
      totalNew,
      totalReturning,
      behindLabs,
      fullLabs,
      nearlyFullLabs,
      aheadLabs,
    });

    if (isDryRun) {
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
    }

    // --- Send via Resend ---
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const recipients = (Deno.env.get("LAB_ADMIN_EMAILS") || "")
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);

    if (recipients.length === 0) throw new Error("LAB_ADMIN_EMAILS not configured");

    const subject = `Labs weekly: ${signupsThisWeek} new signup${signupsThisWeek !== 1 ? "s" : ""} this week`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const body = await resendRes.text();
      throw new Error(`Resend error ${resendRes.status}: ${body}`);
    }

    const resendData = await resendRes.json();
    return jsonResp(200, {
      sent: true,
      resend_id: resendData.id,
      recipients,
      subject,
    });
  } catch (err) {
    console.error("[weekly-report] error:", err);
    return jsonResp(500, { error: err instanceof Error ? err.message : "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------

interface ReportData {
  generatedAt: Date;
  weekStart: Date;
  signupsThisWeek: number;
  labRows: any[];
  topChannels: [string, number][];
  totalNew: number;
  totalReturning: number;
  behindLabs: any[];
  fullLabs: any[];
  nearlyFullLabs: any[];
  aheadLabs: any[];
}

function buildEmail(d: ReportData): string {
  const fmtDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const fmtEventDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  const title = `Labs weekly · ${fmtDate(d.weekStart)} – ${fmtDate(d.generatedAt)}`;

  // --- Needs attention banner (problems) ---
  let urgentBanner = "";
  const urgentItems: string[] = [];
  d.behindLabs.forEach((l) => urgentItems.push(`<strong>${esc(l.title)}</strong> is behind pace (${l.paceLabel})`));
  d.fullLabs.forEach((l) => urgentItems.push(`<strong>${esc(l.title)}</strong> is full — consider expanding capacity`));
  if (urgentItems.length > 0) {
    urgentBanner = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#b91c1c;">Needs attention</p>
            <ul style="margin:0;padding-left:20px;color:#991b1b;font-size:14px;line-height:1.7;">
              ${urgentItems.map((i) => `<li>${i}</li>`).join("")}
            </ul>
          </td>
        </tr>
      </table>`;
  }

  // --- Wins banner (celebrations) ---
  let winsBanner = "";
  const winItems: string[] = [];
  d.nearlyFullLabs.forEach((l) =>
    winItems.push(`<strong>${esc(l.title)}</strong> is almost full — only ${l.seatsRemaining} seat${l.seatsRemaining === 1 ? "" : "s"} left`)
  );
  d.aheadLabs.forEach((l) => winItems.push(`<strong>${esc(l.title)}</strong> is ahead of pace (${l.paceLabel})`));
  if (winItems.length > 0) {
    winsBanner = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#15803d;">Wins this week</p>
            <ul style="margin:0;padding-left:20px;color:#166534;font-size:14px;line-height:1.7;">
              ${winItems.map((i) => `<li>${i}</li>`).join("")}
            </ul>
          </td>
        </tr>
      </table>`;
  }

  const spacer = (urgentBanner || winsBanner) ? `<div style="margin-bottom:12px;"></div>` : "";

  // --- Velocity row ---
  const velocityRow = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
      <tr>
        <td>
          ${statCard("New signups this week", String(d.signupsThisWeek), "#10281f")}
        </td>
      </tr>
    </table>`;

  // --- Audience pulse row ---
  const totalUpcoming = d.totalNew + d.totalReturning;
  const returningPct = totalUpcoming > 0 ? Math.round((d.totalReturning / totalUpcoming) * 100) : 0;
  const audienceRow = `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
      <tr>
        <td width="50%" style="padding-right:8px;">
          ${statCard("New registrants", String(d.totalNew), "#10281f")}
        </td>
        <td width="50%" style="padding-left:8px;">
          ${statCard("Returning registrants", `${d.totalReturning} (${returningPct}%)`, "#1b4d3e")}
        </td>
      </tr>
    </table>`;

  // --- Per-lab table ---
  const labRowsHtml = d.labRows.length === 0
    ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:#888;font-size:14px;">No upcoming labs.</td></tr>`
    : d.labRows.map((lab) => {
        const seatsCol = lab.maxSeats
          ? `${lab.activeSignups}/${lab.maxSeats} (${Math.round((lab.activeSignups / lab.maxSeats) * 100)}% full)`
          : String(lab.activeSignups);
        return `
          <tr style="border-top:1px solid #f0f0f0;">
            <td style="padding:12px 10px;font-size:14px;font-weight:600;color:#10281f;">${esc(lab.title)}</td>
            <td style="padding:12px 10px;font-size:13px;color:#555;white-space:nowrap;">${fmtEventDate(lab.eventDate)}</td>
            <td style="padding:12px 10px;font-size:13px;color:#555;text-align:center;">${lab.daysLeft}d</td>
            <td style="padding:12px 10px;font-size:13px;color:#555;">${esc(seatsCol)}</td>
            <td style="padding:12px 10px;font-size:13px;font-weight:600;color:${lab.paceColor};">${esc(lab.paceLabel)}</td>
          </tr>`;
      }).join("");

  const labTable = `
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#333;">Upcoming labs</h2>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Lab</th>
          <th style="padding:10px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Date</th>
          <th style="padding:10px 10px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Days left</th>
          <th style="padding:10px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Signups</th>
          <th style="padding:10px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Pace</th>
        </tr>
      </thead>
      <tbody>${labRowsHtml}</tbody>
    </table>`;

  // --- Top channels this week ---
  let channelsSection = "";
  if (d.topChannels.length > 0) {
    const channelRows = d.topChannels.map(([src, count]) => `
      <tr style="border-top:1px solid #f0f0f0;">
        <td style="padding:10px 12px;font-size:14px;color:#333;">${esc(src)}</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1b4d3e;text-align:right;">${count}</td>
      </tr>`).join("");

    channelsSection = `
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#333;">Top channels this week</h2>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
        style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Source</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">Signups</th>
          </tr>
        </thead>
        <tbody>${channelRows}</tbody>
      </table>`;
  }

  const footer = `
    <p style="margin:24px 0 0;font-size:12px;color:#aaa;text-align:center;">
      CoVo Multipliers Labs · weekly digest
    </p>`;

  const body = urgentBanner + winsBanner + spacer + velocityRow + audienceRow + labTable + channelsSection + footer;
  return wrapEmail(body, title);
}

function statCard(label: string, value: string, valueColor: string): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
      style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#888;">${esc(label)}</p>
          <p style="margin:0;font-size:26px;font-weight:800;color:${valueColor};line-height:1;">${esc(value)}</p>
        </td>
      </tr>
    </table>`;
}

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
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">
          <tr>
            <td style="background:linear-gradient(135deg,#10281f 0%,#1b4d3e 55%,#9f7a2f 100%);padding:36px 32px;border-radius:12px 12px 0 0;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.65);">
                Covo Multipliers Labs
              </p>
              <h1 style="margin:0;font-size:22px;font-weight:900;color:#ffffff;line-height:1.2;">
                ${esc(headerTitle)}
              </h1>
            </td>
          </tr>
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
