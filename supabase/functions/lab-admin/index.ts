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
  slug: string;
  event_date: string;
  max_seats: number | null;
  active_signups: number;
  cancelled_signups: number;
}

interface Registrant {
  name: string;
  email: string;
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
    totalCancelledSignups: number;
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
    // --- Fetch summary stats ---
    const { data: registrations, error: regError } = await supabaseAdmin
      .from("registrations")
      .select("registration_status", { count: "exact" });

    if (regError) throw new Error(`registrations query: ${regError.message}`);

    const totalActiveSignups = registrations?.filter((r: any) => r.registration_status === "active").length || 0;
    const totalCancelledSignups = registrations?.filter((r: any) => r.registration_status === "cancelled").length || 0;

    // Unique registrants
    const { data: uniqueEmails, error: uniqueError } = await supabaseAdmin
      .from("registrations")
      .select("email")
      .eq("registration_status", "active");

    if (uniqueError) throw new Error(`unique emails: ${uniqueError.message}`);

    const totalUniqueRegistrants = new Set(uniqueEmails?.map((r: any) => r.email) || []).size;

    // Upcoming labs (next 30 days)
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const { data: upcomingLabs, error: upcomingError } = await supabaseAdmin
      .from("events")
      .select("id")
      .gte("event_date", now.toISOString())
      .lte("event_date", thirtyDaysFromNow.toISOString())
      .eq("is_published", true);

    if (upcomingError) throw new Error(`upcoming labs: ${upcomingError.message}`);

    const upcomingLabCount = upcomingLabs?.length || 0;

    // --- Per-lab summary ---
    const { data: labData, error: labError } = await supabaseAdmin
      .from("events")
      .select(`
        id,
        slug,
        event_date,
        max_seats,
        registrations(count)
      `)
      .eq("is_published", true)
      .order("event_date", { ascending: false });

    if (labError) throw new Error(`lab summary: ${labError.message}`);

    const labSummary: LabSummary[] = (labData || []).map((event: any) => {
      const allRegs = event.registrations || [];
      const activeCount = allRegs.filter((r: any) => r.registration_status === "active").length;
      const cancelledCount = allRegs.filter((r: any) => r.registration_status === "cancelled").length;

      return {
        id: event.id,
        slug: event.slug,
        event_date: event.event_date,
        max_seats: event.max_seats,
        active_signups: activeCount,
        cancelled_signups: cancelledCount,
      };
    });

    // Actually, the above join is wrong. Let me redo with separate queries.
    // Fetch registrations per event
    const { data: labRegistrations, error: labRegError } = await supabaseAdmin
      .from("registrations")
      .select("event_id, registration_status");

    if (labRegError) throw new Error(`lab registrations: ${labRegError.message}`);

    // Build lab summary properly
    const labSummaryMap = new Map<string, any>();
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id, slug, event_date, max_seats, is_published")
      .eq("is_published", true)
      .order("event_date", { ascending: false });

    if (eventsError) throw new Error(`events: ${eventsError.message}`);

    (events || []).forEach((event: any) => {
      const eventRegs = (labRegistrations || []).filter((r: any) => r.event_id === event.id);
      labSummaryMap.set(event.id, {
        id: event.id,
        slug: event.slug,
        event_date: event.event_date,
        max_seats: event.max_seats,
        active_signups: eventRegs.filter((r: any) => r.registration_status === "active").length,
        cancelled_signups: eventRegs.filter((r: any) => r.registration_status === "cancelled").length,
        seats_remaining: event.max_seats ? event.max_seats - eventRegs.filter((r: any) => r.registration_status === "active").length : null,
      });
    });

    const labSummaryArray = Array.from(labSummaryMap.values());

    // --- Registrants list ---
    const { data: registrantList, error: regListError } = await supabaseAdmin
      .from("registrations")
      .select(`
        name,
        email,
        event_id,
        registration_status,
        utm_source_first,
        utm_source_latest,
        created_at,
        events(slug, event_date)
      `)
      .order("created_at", { ascending: false });

    if (regListError) throw new Error(`registrant list: ${regListError.message}`);

    const registrants: Registrant[] = (registrantList || []).map((reg: any) => ({
      name: reg.name || "",
      email: reg.email || "",
      event_slug: reg.events?.slug || "",
      event_date: reg.events?.event_date || "",
      registration_status: reg.registration_status || "",
      utm_source_first: reg.utm_source_first,
      utm_source_latest: reg.utm_source_latest,
      created_at: reg.created_at,
    }));

    // --- Person summary (Labs Registered & Labs Attended) ---
    // Get unique people with their lab counts
    const { data: allRegistrations, error: allRegError } = await supabaseAdmin
      .from("registrations")
      .select(`
        email,
        name,
        event_id,
        registration_status
      `);

    if (allRegError) throw new Error(`all registrations: ${allRegError.message}`);

    // Get attendance data
    const { data: attendanceData, error: attError } = await supabaseAdmin
      .from("lab_attendance")
      .select("event_id, attendee_email, status");

    if (attError) throw new Error(`attendance: ${attError.message}`);

    // Build person summary
    const personMap = new Map<string, { name: string; labs_registered: Set<string>; labs_attended: Set<string> }>();

    (allRegistrations || []).forEach((reg: any) => {
      if (reg.registration_status === "active") {
        if (!personMap.has(reg.email)) {
          personMap.set(reg.email, {
            name: reg.name || "",
            labs_registered: new Set(),
            labs_attended: new Set(),
          });
        }
        personMap.get(reg.email)!.labs_registered.add(reg.event_id);
      }
    });

    (attendanceData || []).forEach((att: any) => {
      if (att.status === "attended" || att.status === "partial") {
        if (!personMap.has(att.attendee_email)) {
          personMap.set(att.attendee_email, {
            name: "",
            labs_registered: new Set(),
            labs_attended: new Set(),
          });
        }
        personMap.get(att.attendee_email)!.labs_attended.add(att.event_id);
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
        totalCancelledSignups,
        upcomingLabCount,
      },
      labSummary: labSummaryArray,
      registrants,
      personSummary,
    };

    return jsonResp(200, dashboard, cors);
  } catch (err) {
    console.error("[lab-admin] error:", err);
    return jsonResp(500, { error: err instanceof Error ? err.message : "Internal server error" }, cors);
  }
});
