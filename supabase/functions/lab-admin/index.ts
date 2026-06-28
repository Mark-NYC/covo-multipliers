// supabase/functions/lab-admin/index.ts
//
// Lab Admin Dashboard Edge Function
// GET /functions/v1/lab-admin
// Headers: Authorization: Bearer <access_token>
//
// Authenticates the user via JWT, checks LAB_ADMIN_EMAILS allowlist,
// then returns aggregated read-only dashboard data (summaries, per-lab stats,
// registrants, attendance counts).
//
// Requires: LAB_ADMIN_EMAILS env var (comma-separated admin emails)
// JWT verification is enabled by default on deploy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[1];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

interface LabSummary {
  id: string;
  title: string;
  slug: string;
  event_date: string;
  max_seats: number | null;
  active_signups: number;
  seats_remaining: number | null;
  days_left: number;
  // Pace vs. benchmark: expected signups by this point based on past labs.
  // Null when there is no historical lab to anchor the benchmark.
  expected_signups: number | null;
  pace_delta_pct: number | null;
}

interface ChannelStat {
  source: string;
  count: number;
}

interface TopicDemand {
  title: string;
  lab_count: number;
  total_signups: number;
}

interface ContentSource {
  page: string;
  count: number;
}

interface AffinityPair {
  topic_a: string;
  topic_b: string;
  shared_count: number;
}

interface Registrant {
  name: string;
  email: string;
  event_title: string;
  event_slug: string;
  event_date: string;
  registration_status: string;
  utm_source_first: string | null;
  utm_source_latest: string | null;
  created_at: string;
}

interface PersonSummary {
  name: string;
  email: string;
  labs_registered: number;
  labs_attended: number;
}

interface ChannelShowUpStat {
  source: string;
  registered: number;
  attended: number;
  show_up_rate: number;
}

interface LabNewReturning {
  id: string;
  title: string;
  new_count: number;
  returning_count: number;
}

interface BucketStat {
  label: string;
  count: number;
}

interface SignupPatterns {
  showUpByChannel: ChannelShowUpStat[];
  newVsReturning: LabNewReturning[];
  daysToRegisterBuckets: BucketStat[];
}

interface LabCurveData {
  id: string;
  title: string;
  daysLeft: number;
  // Index d = cumulative active signups at exactly d days before the event.
  // Length is MAX_DAYS_WINDOW + 1 (indices 0..MAX_DAYS_WINDOW).
  points: number[];
}

interface PaceChartData {
  maxDaysWindow: number;
  // averageCurve[d] = average cumulative signups across all past labs at d days before event.
  averageCurve: number[];
  labCurves: LabCurveData[];
}

interface DashboardData {
  summaryStats: {
    totalActiveSignups: number;
    totalUniqueRegistrants: number;
    upcomingLabCount: number;
    signupsLast24h: number;
    signupsLast7d: number;
    benchmarkLabCount: number;
  };
  channelBreakdown: ChannelStat[];
  topicDemand: TopicDemand[];
  contentAttribution: ContentSource[];
  topicAffinity: AffinityPair[];
  labSummary: LabSummary[];
  registrants: Registrant[];
  personSummary: PersonSummary[];
  paceChart: PaceChartData;
  signupPatterns: SignupPatterns;
}

function jsonResp(status: number, data: unknown, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // --- Preflight ---
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // --- Only GET allowed ---
  if (req.method !== "GET") {
    return jsonResp(405, { error: "Method not allowed" }, cors);
  }

  // --- Extract and verify JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResp(401, { error: "Missing Authorization header" }, cors);
  }

  const token = authHeader.substring("Bearer ".length);

  // --- Initialize Supabase clients ---
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Use anon client to verify the JWT and get user
  const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await supabasePublic.auth.getUser(token);

  if (authError || !authData.user) {
    console.warn("[lab-admin] JWT verification failed:", authError?.message);
    return jsonResp(401, { error: "Unauthorized" }, cors);
  }

  const userEmail = authData.user.email;

  // --- Check allowlist ---
  const allowListEnv = Deno.env.get("LAB_ADMIN_EMAILS") || "";
  const allowList = allowListEnv.split(",").map((e) => e.trim()).filter((e) => e);

  if (!allowList.includes(userEmail)) {
    console.warn(`[lab-admin] forbidden — ${userEmail} not in allowlist`);
    return jsonResp(403, { error: "Forbidden" }, cors);
  }

  // --- Use service role to query data ---
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // -----------------------------------------------------------------------
    // Three base queries; all aggregation happens in memory.
    //
    // Schema notes (verified against migrations):
    //   events:         id, slug, event_date, seat_limit, is_published
    //   registrations:  id, name, email, event_id, registration_status,
    //                   utm_source (latest-touch), first_utm_source (first-touch),
    //                   created_at
    //   lab_attendance: registration_id (FK -> registrations.id), status
    //                   (no event_id / email column; join via registration_id)
    // -----------------------------------------------------------------------
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = new Date();
    // Current/future labs: anything from the start of today onward.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    // Fetch ALL published labs. Upcoming labs are displayed; past labs are used
    // only to compute the signup-pace benchmark.
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, event_date, seat_limit")
      .eq("is_published", true)
      .order("event_date", { ascending: true });

    if (eventsError) throw new Error(`events: ${eventsError.message}`);

    const allEvents = events || [];
    const upcomingEvents = allEvents.filter((e: any) => new Date(e.event_date) >= startOfToday);
    const pastEvents = allEvents.filter((e: any) => new Date(e.event_date) < startOfToday);

    const eventById = new Map<string, any>();
    allEvents.forEach((e: any) => eventById.set(e.id, e));
    const upcomingEventIds = new Set(upcomingEvents.map((e: any) => e.id));

    const { data: regsRaw, error: regsError } = await supabaseAdmin
      .from("registrations")
      .select("id, name, email, event_id, registration_status, utm_source, first_utm_source, first_landing_page, created_at")
      .order("created_at", { ascending: false });

    if (regsError) throw new Error(`registrations: ${regsError.message}`);

    const { data: attendance, error: attError } = await supabaseAdmin
      .from("lab_attendance")
      .select("registration_id, status");

    if (attError) throw new Error(`attendance: ${attError.message}`);

    const allRegsFull = regsRaw || [];
    const allAttendance = attendance || [];

    // Active registrations grouped by event (used for per-lab counts + benchmark).
    const activeRegsByEvent = new Map<string, any[]>();
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      if (!activeRegsByEvent.has(r.event_id)) activeRegsByEvent.set(r.event_id, []);
      activeRegsByEvent.get(r.event_id)!.push(r);
    });

    // Registrations scoped to current/future labs (display: tables + person summary).
    const allRegs = allRegsFull.filter((r: any) => upcomingEventIds.has(r.event_id));

    const regById = new Map<string, any>();
    allRegs.forEach((r: any) => regById.set(r.id, r));

    // --- Summary stats ---
    const activeUpcomingRegs = allRegs.filter((r: any) => r.registration_status === "active");
    const totalActiveSignups = activeUpcomingRegs.length;
    const totalUniqueRegistrants = new Set(activeUpcomingRegs.map((r: any) => r.email)).size;
    const upcomingLabCount = upcomingEvents.length;

    // --- Signup velocity (active signups for upcoming labs, by recency) ---
    const signupsLast24h = activeUpcomingRegs.filter(
      (r: any) => now.getTime() - new Date(r.created_at).getTime() <= DAY_MS,
    ).length;
    const signupsLast7d = activeUpcomingRegs.filter(
      (r: any) => now.getTime() - new Date(r.created_at).getTime() <= 7 * DAY_MS,
    ).length;

    // --- Channel breakdown (first-touch source for upcoming-lab signups) ---
    const channelMap = new Map<string, number>();
    activeUpcomingRegs.forEach((r: any) => {
      const source = (r.first_utm_source || r.utm_source || "direct / unknown").toString();
      channelMap.set(source, (channelMap.get(source) || 0) + 1);
    });
    const channelBreakdown: ChannelStat[] = Array.from(channelMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // --- Content insights (all-time, for article/podcast planning) ---
    // Topic demand: total active signups per topic (aggregated by title so
    // repeat runs of the same topic combine). Includes past + future labs.
    const topicMap = new Map<string, { signups: number; labs: Set<string> }>();
    allEvents.forEach((e: any) => {
      const title = e.title || e.slug;
      if (!topicMap.has(title)) topicMap.set(title, { signups: 0, labs: new Set() });
      topicMap.get(title)!.labs.add(e.id);
    });
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      const e = eventById.get(r.event_id);
      if (!e) return;
      const title = e.title || e.slug;
      topicMap.get(title)!.signups += 1;
    });
    const topicDemand: TopicDemand[] = Array.from(topicMap.entries())
      .map(([title, v]) => ({ title, lab_count: v.labs.size, total_signups: v.signups }))
      .sort((a, b) => b.total_signups - a.total_signups);

    // Content attribution: which first-touch landing page brought registrants.
    // first_landing_page is the first page a person hit before ever registering,
    // so this is piece-level "which article/episode converts" signal.
    const normalizePage = (raw: string | null): string => {
      if (!raw) return "(direct / unknown)";
      try {
        const u = new URL(raw);
        return u.pathname || "/";
      } catch {
        return raw;
      }
    };
    const contentMap = new Map<string, number>();
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      const page = normalizePage(r.first_landing_page);
      contentMap.set(page, (contentMap.get(page) || 0) + 1);
    });
    const contentAttribution: ContentSource[] = Array.from(contentMap.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count);

    // Topic affinity: "people who signed up for X also signed up for Y".
    // Build each person's set of topics, then count co-occurring topic pairs.
    // Guides content series and sequencing.
    const personTopics = new Map<string, Set<string>>();
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      const e = eventById.get(r.event_id);
      if (!e) return;
      const title = e.title || e.slug;
      if (!personTopics.has(r.email)) personTopics.set(r.email, new Set());
      personTopics.get(r.email)!.add(title);
    });
    const PAIR_SEP = " ||| ";
    const pairCounts = new Map<string, number>();
    for (const topics of personTopics.values()) {
      const arr = Array.from(topics).sort();
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = arr[i] + PAIR_SEP + arr[j];
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
    const topicAffinity: AffinityPair[] = Array.from(pairCounts.entries())
      .map(([key, count]) => {
        const [topic_a, topic_b] = key.split(PAIR_SEP);
        return { topic_a, topic_b, shared_count: count };
      })
      .sort((a, b) => b.shared_count - a.shared_count);

    // --- Pace benchmark helper ---
    // For a lab, how many active signups it had by D days before its event date.
    const signupsByDaysBefore = (event: any, daysBefore: number): number => {
      const cutoff = new Date(event.event_date).getTime() - daysBefore * DAY_MS;
      const regs = activeRegsByEvent.get(event.id) || [];
      return regs.filter((r: any) => new Date(r.created_at).getTime() <= cutoff).length;
    };
    const benchmarkLabCount = pastEvents.length;

    // --- Per-lab summary (with pace vs. benchmark) ---
    const labSummary: LabSummary[] = upcomingEvents.map((event: any) => {
      const activeCount = (activeRegsByEvent.get(event.id) || []).length;
      const daysLeft = Math.max(0, Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / DAY_MS));

      // Expected signups by now = average of how many each past lab had at the
      // same days-before-event mark.
      let expectedSignups: number | null = null;
      let paceDeltaPct: number | null = null;
      if (pastEvents.length > 0) {
        const samples = pastEvents.map((p: any) => signupsByDaysBefore(p, daysLeft));
        const avg = samples.reduce((a: number, b: number) => a + b, 0) / samples.length;
        expectedSignups = Math.round(avg * 10) / 10;
        if (avg > 0) {
          paceDeltaPct = Math.round(((activeCount - avg) / avg) * 100);
        }
      }

      return {
        id: event.id,
        title: event.title || event.slug,
        slug: event.slug,
        event_date: event.event_date,
        max_seats: event.seat_limit ?? null,
        active_signups: activeCount,
        seats_remaining: event.seat_limit != null ? Math.max(event.seat_limit - activeCount, 0) : null,
        days_left: daysLeft,
        expected_signups: expectedSignups,
        pace_delta_pct: paceDeltaPct,
      };
    });

    // --- Signup pace chart data ---
    // Build cumulative signup curve for a given event. Returns an array of length
    // MAX_DAYS_WINDOW+1 where result[d] = cumulative active signups at d days before event.
    const MAX_DAYS_WINDOW = 60;
    const buildCurve = (event: any): number[] => {
      const regs = activeRegsByEvent.get(event.id) || [];
      const eventTime = new Date(event.event_date).getTime();
      const sorted = regs.slice().sort(
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const result: number[] = new Array(MAX_DAYS_WINDOW + 1).fill(0);
      let count = 0;
      let idx = 0;
      // Iterate d from high to low: cutoff moves forward in time, so pointer only advances.
      for (let d = MAX_DAYS_WINDOW; d >= 0; d--) {
        const cutoff = eventTime - d * DAY_MS;
        while (idx < sorted.length && new Date(sorted[idx].created_at).getTime() <= cutoff) {
          count++;
          idx++;
        }
        result[d] = count;
      }
      return result;
    };

    // Average curve across all past labs
    const averageCurve: number[] = new Array(MAX_DAYS_WINDOW + 1).fill(0);
    if (pastEvents.length > 0) {
      const pastCurves = pastEvents.map((e: any) => buildCurve(e));
      for (let d = 0; d <= MAX_DAYS_WINDOW; d++) {
        const sum = pastCurves.reduce((acc: number, curve: number[]) => acc + curve[d], 0);
        averageCurve[d] = Math.round((sum / pastCurves.length) * 10) / 10;
      }
    }

    // Per-upcoming-lab curves
    const labCurves: LabCurveData[] = upcomingEvents.map((event: any) => {
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(event.event_date).getTime() - now.getTime()) / DAY_MS),
      );
      return {
        id: event.id,
        title: event.title || event.slug,
        daysLeft,
        points: buildCurve(event),
      };
    });

    const paceChart: PaceChartData = {
      maxDaysWindow: MAX_DAYS_WINDOW,
      averageCurve,
      labCurves,
    };

    // --- Signup patterns ---

    // Show-up rate by channel: across all labs, what % of active registrants attended
    // (attended or partial) grouped by first-touch utm source.
    const regIdToChannel = new Map<string, string>();
    allRegsFull.forEach((r: any) => {
      if (r.registration_status === "active") {
        regIdToChannel.set(r.id, (r.first_utm_source || r.utm_source || "direct / unknown").toString());
      }
    });
    const channelRegistered = new Map<string, number>();
    const channelAttended = new Map<string, number>();
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      const src = (r.first_utm_source || r.utm_source || "direct / unknown").toString();
      channelRegistered.set(src, (channelRegistered.get(src) || 0) + 1);
    });
    allAttendance.forEach((att: any) => {
      if (att.status !== "attended" && att.status !== "partial") return;
      const src = regIdToChannel.get(att.registration_id);
      if (!src) return;
      channelAttended.set(src, (channelAttended.get(src) || 0) + 1);
    });
    const showUpByChannel: ChannelShowUpStat[] = Array.from(channelRegistered.entries())
      .map(([source, registered]) => {
        const attended = channelAttended.get(source) || 0;
        return { source, registered, attended, show_up_rate: Math.round((attended / registered) * 100) };
      })
      .sort((a, b) => b.registered - a.registered);

    // New vs. returning registrants per upcoming lab.
    // "Returning" = email has a attended/partial record on any past lab.
    const returnerEmails = new Set<string>();
    allAttendance.forEach((att: any) => {
      if (att.status !== "attended" && att.status !== "partial") return;
      const reg = allRegsFull.find((r: any) => r.id === att.registration_id);
      if (!reg) return;
      const ev = eventById.get(reg.event_id);
      if (ev && new Date(ev.event_date) < startOfToday) {
        returnerEmails.add(reg.email);
      }
    });
    const newVsReturning: LabNewReturning[] = upcomingEvents.map((event: any) => {
      const regs = activeRegsByEvent.get(event.id) || [];
      let returning_count = 0;
      regs.forEach((r: any) => { if (returnerEmails.has(r.email)) returning_count++; });
      return {
        id: event.id,
        title: event.title || event.slug,
        new_count: regs.length - returning_count,
        returning_count,
      };
    });

    // Days-to-register distribution across all active registrations (all labs).
    // Shows how far in advance people tend to sign up relative to the event.
    const daysToRegBuckets: BucketStat[] = [
      { label: "30+ days before", count: 0 },
      { label: "15–29 days", count: 0 },
      { label: "8–14 days", count: 0 },
      { label: "3–7 days", count: 0 },
      { label: "1–2 days", count: 0 },
      { label: "Same day", count: 0 },
    ];
    allRegsFull.forEach((r: any) => {
      if (r.registration_status !== "active") return;
      const ev = eventById.get(r.event_id);
      if (!ev) return;
      const daysBefore = Math.max(0, Math.round(
        (new Date(ev.event_date).getTime() - new Date(r.created_at).getTime()) / DAY_MS
      ));
      if (daysBefore >= 30) daysToRegBuckets[0].count++;
      else if (daysBefore >= 15) daysToRegBuckets[1].count++;
      else if (daysBefore >= 8) daysToRegBuckets[2].count++;
      else if (daysBefore >= 3) daysToRegBuckets[3].count++;
      else if (daysBefore >= 1) daysToRegBuckets[4].count++;
      else daysToRegBuckets[5].count++;
    });

    const signupPatterns: SignupPatterns = {
      showUpByChannel,
      newVsReturning,
      daysToRegisterBuckets: daysToRegBuckets,
    };

    // --- Registrants list ---
    const registrants: Registrant[] = allRegs.map((reg: any) => {
      const ev = eventById.get(reg.event_id);
      return {
        name: reg.name || "",
        email: reg.email || "",
        event_title: ev?.title || ev?.slug || "",
        event_slug: ev?.slug || "",
        event_date: ev?.event_date || "",
        registration_status: reg.registration_status || "",
        utm_source_first: reg.first_utm_source ?? null,
        utm_source_latest: reg.utm_source ?? null,
        created_at: reg.created_at,
      };
    });

    // --- Person summary (Labs Registered & Labs Attended) ---
    // Labs Registered: distinct events with an active registration, keyed by email.
    // Labs Attended:   attendance rows with status attended/partial, mapped to the
    //                  registrant's email + event via registration_id.
    const personMap = new Map<string, { name: string; labs_registered: Set<string>; labs_attended: Set<string> }>();

    const ensurePerson = (email: string, name: string) => {
      if (!personMap.has(email)) {
        personMap.set(email, { name: name || "", labs_registered: new Set(), labs_attended: new Set() });
      }
      const p = personMap.get(email)!;
      if (!p.name && name) p.name = name;
      return p;
    };

    allRegs.forEach((reg: any) => {
      if (reg.registration_status === "active") {
        ensurePerson(reg.email, reg.name).labs_registered.add(reg.event_id);
      }
    });

    allAttendance.forEach((att: any) => {
      if (att.status === "attended" || att.status === "partial") {
        const reg = regById.get(att.registration_id);
        if (reg) {
          ensurePerson(reg.email, reg.name).labs_attended.add(reg.event_id);
        }
      }
    });

    const personSummary: PersonSummary[] = Array.from(personMap.entries()).map(([email, data]) => ({
      name: data.name,
      email,
      labs_registered: data.labs_registered.size,
      labs_attended: data.labs_attended.size,
    }));

    // --- Return dashboard data ---
    const dashboard: DashboardData = {
      summaryStats: {
        totalActiveSignups,
        totalUniqueRegistrants,
        upcomingLabCount,
        signupsLast24h,
        signupsLast7d,
        benchmarkLabCount,
      },
      channelBreakdown,
      topicDemand,
      contentAttribution,
      topicAffinity,
      labSummary,
      registrants,
      personSummary,
      paceChart,
      signupPatterns,
    };

    return jsonResp(200, dashboard, cors);
  } catch (err) {
    console.error("[lab-admin] error:", err);
    return jsonResp(500, { error: err instanceof Error ? err.message : "Internal server error" }, cors);
  }
});
