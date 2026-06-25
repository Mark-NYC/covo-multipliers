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

interface DashboardData {
  summaryStats: {
    totalActiveSignups: number;
    totalUniqueRegistrants: number;
    upcomingLabCount: number;
  };
  labSummary: LabSummary[];
  registrants: Registrant[];
  personSummary: PersonSummary[];
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
    // Only current/future labs: include anything from the start of today onward.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, event_date, seat_limit")
      .eq("is_published", true)
      .gte("event_date", startOfToday.toISOString())
      .order("event_date", { ascending: true });

    if (eventsError) throw new Error(`events: ${eventsError.message}`);

    const allEvents = events || [];

    // Lookup map + the set of event IDs we surface on the dashboard.
    const eventById = new Map<string, any>();
    allEvents.forEach((e: any) => eventById.set(e.id, e));
    const currentEventIds = new Set(allEvents.map((e: any) => e.id));

    const { data: regsRaw, error: regsError } = await supabaseAdmin
      .from("registrations")
      .select("id, name, email, event_id, registration_status, utm_source, first_utm_source, created_at")
      .order("created_at", { ascending: false });

    if (regsError) throw new Error(`registrations: ${regsError.message}`);

    const { data: attendance, error: attError } = await supabaseAdmin
      .from("lab_attendance")
      .select("registration_id, status");

    if (attError) throw new Error(`attendance: ${attError.message}`);

    // Scope registrations to current/future labs only.
    const allRegs = (regsRaw || []).filter((r: any) => currentEventIds.has(r.event_id));
    const allAttendance = attendance || [];

    const regById = new Map<string, any>();
    allRegs.forEach((r: any) => regById.set(r.id, r));

    // --- Summary stats ---
    const totalActiveSignups = allRegs.filter((r: any) => r.registration_status === "active").length;
    const totalUniqueRegistrants = new Set(
      allRegs.filter((r: any) => r.registration_status === "active").map((r: any) => r.email),
    ).size;

    // All current/future published labs (the same set shown in the per-lab table).
    const upcomingLabCount = allEvents.length;

    // --- Per-lab summary ---
    const labSummary: LabSummary[] = allEvents.map((event: any) => {
      const eventRegs = allRegs.filter((r: any) => r.event_id === event.id);
      const activeCount = eventRegs.filter((r: any) => r.registration_status === "active").length;
      return {
        id: event.id,
        title: event.title || event.slug,
        slug: event.slug,
        event_date: event.event_date,
        max_seats: event.seat_limit ?? null,
        active_signups: activeCount,
        seats_remaining: event.seat_limit != null ? Math.max(event.seat_limit - activeCount, 0) : null,
      };
    });

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
      },
      labSummary,
      registrants,
      personSummary,
    };

    return jsonResp(200, dashboard, cors);
  } catch (err) {
    console.error("[lab-admin] error:", err);
    return jsonResp(500, { error: err instanceof Error ? err.message : "Internal server error" }, cors);
  }
});
