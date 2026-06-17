// supabase/functions/attendance-admin/index.ts
//
// Covo Multipliers — Lab Attendance Admin API
//
// POST /functions/v1/attendance-admin
// Header: x-admin-secret: <ADMIN_ATTENDANCE_SECRET>
// Body: { action: string, ...params }
//
// Supported actions:
//   list_events            — all events with per-event attendance stats
//   list_registrants       — registrants + attendance for one event
//   mark_attendance        — mark one attendance row
//   bulk_mark_attendance   — mark multiple attendance rows
//   cancel_registration    — cancel an active registration
//   reactivate_registration — reactivate a cancelled registration (admin path)
//   get_event_stats        — attendance and completion rates for one event
//
// Authentication: shared secret in x-admin-secret header.
// Actor: server-read from ADMIN_ATTENDANCE_ACTOR env var (never from request body).
// CORS: present for browser clients but CORS is not authentication.
//
// Required secrets (supabase secrets set KEY=value):
//   ADMIN_ATTENDANCE_SECRET   — shared secret for x-admin-secret header
// Optional secrets:
//   ADMIN_ATTENDANCE_ACTOR    — actor string written to audit log (default: "attendance_admin")
// Auto-injected by Supabase:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Constant-time secret comparison
// ---------------------------------------------------------------------------
function secretsEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    // Run a dummy comparison to keep timing consistent
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." }, cors);

  // --- Auth ---
  const expectedSecret = Deno.env.get("ADMIN_ATTENDANCE_SECRET");
  if (!expectedSecret) {
    console.error("[attendance-admin] ADMIN_ATTENDANCE_SECRET not set");
    return json(500, { error: "Server configuration error." }, cors);
  }

  const providedSecret = req.headers.get("x-admin-secret") ?? "";
  if (!secretsEqual(providedSecret, expectedSecret)) {
    return json(401, { error: "Unauthorized." }, cors);
  }

  // Actor is always server-owned — never derived from request body
  const actor = Deno.env.get("ADMIN_ATTENDANCE_ACTOR") ?? "attendance_admin";

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." }, cors);
  }

  const action = typeof body.action === "string" ? body.action : "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // -------------------------------------------------------------------------
  // list_events
  // -------------------------------------------------------------------------
  if (action === "list_events") {
    const { data: events, error } = await supabase
      .from("events")
      .select("id, slug, title, event_date, seat_limit, is_published, created_at")
      .order("event_date", { ascending: false });

    if (error) {
      console.error("[attendance-admin] list_events error:", JSON.stringify(error));
      return json(500, { error: "Failed to load events." }, cors);
    }

    // Fetch stats for all events in parallel
    const statsResults = await Promise.all(
      (events ?? []).map((e: Record<string, unknown>) =>
        supabase.rpc("get_event_attendance_stats", { p_event_id: e.id })
      ),
    );

    const eventsWithStats = (events ?? []).map(
      (e: Record<string, unknown>, i: number) => ({
        ...e,
        stats: statsResults[i].data ?? null,
      }),
    );

    return json(200, { events: eventsWithStats }, cors);
  }

  // -------------------------------------------------------------------------
  // list_registrants
  // -------------------------------------------------------------------------
  if (action === "list_registrants") {
    const eventId = body.event_id;
    if (typeof eventId !== "string" || !isUuid(eventId)) {
      return json(400, { error: "A valid event_id is required." }, cors);
    }

    const { data, error } = await supabase.rpc("list_event_registrants", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("[attendance-admin] list_registrants error:", JSON.stringify(error));
      return json(500, { error: "Failed to load registrants." }, cors);
    }

    return json(200, { registrants: data ?? [] }, cors);
  }

  // -------------------------------------------------------------------------
  // mark_attendance
  // -------------------------------------------------------------------------
  if (action === "mark_attendance") {
    const attendanceId = body.attendance_id;
    const status = body.status;
    const source = body.source ?? "manual";
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (typeof attendanceId !== "string" || !isUuid(attendanceId)) {
      return json(400, { error: "A valid attendance_id is required." }, cors);
    }
    if (typeof status !== "string") {
      return json(400, { error: "status is required." }, cors);
    }

    const { data, error } = await supabase.rpc("mark_attendance", {
      p_attendance_id: attendanceId,
      p_status:        status,
      p_source:        source,
      p_notes:         notes,
      p_actor:         actor,
    });

    if (error) {
      console.error("[attendance-admin] mark_attendance error:", JSON.stringify(error));
      return json(500, { error: "Failed to mark attendance." }, cors);
    }

    if (data && data.success === false) {
      return json(400, { error: data.error }, cors);
    }

    return json(200, data, cors);
  }

  // -------------------------------------------------------------------------
  // bulk_mark_attendance
  // -------------------------------------------------------------------------
  if (action === "bulk_mark_attendance") {
    const attendanceIds = body.attendance_ids;
    const status = body.status;
    const source = body.source ?? "manual";
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (!Array.isArray(attendanceIds) || attendanceIds.length === 0) {
      return json(400, { error: "attendance_ids must be a non-empty array." }, cors);
    }
    if (attendanceIds.some((id) => typeof id !== "string" || !isUuid(id))) {
      return json(400, { error: "All attendance_ids must be valid UUIDs." }, cors);
    }
    if (typeof status !== "string") {
      return json(400, { error: "status is required." }, cors);
    }

    const { data, error } = await supabase.rpc("bulk_mark_attendance", {
      p_attendance_ids: attendanceIds,
      p_status:         status,
      p_source:         source,
      p_notes:          notes,
      p_actor:          actor,
    });

    if (error) {
      console.error("[attendance-admin] bulk_mark_attendance error:", JSON.stringify(error));
      return json(500, { error: "Failed to bulk mark attendance." }, cors);
    }

    if (data && data.success === false) {
      return json(400, { error: data.error }, cors);
    }

    return json(200, data, cors);
  }

  // -------------------------------------------------------------------------
  // cancel_registration
  // -------------------------------------------------------------------------
  if (action === "cancel_registration") {
    const registrationId = body.registration_id;
    const cancelSource = body.cancellation_source ?? "admin";
    const cancelNotes = typeof body.cancellation_notes === "string"
      ? body.cancellation_notes
      : null;

    if (typeof registrationId !== "string" || !isUuid(registrationId)) {
      return json(400, { error: "A valid registration_id is required." }, cors);
    }

    const { data, error } = await supabase.rpc("cancel_registration", {
      p_registration_id:    registrationId,
      p_cancellation_source: cancelSource,
      p_cancellation_notes:  cancelNotes,
    });

    if (error) {
      console.error("[attendance-admin] cancel_registration error:", JSON.stringify(error));
      return json(500, { error: "Failed to cancel registration." }, cors);
    }

    if (data && data.success === false) {
      return json(400, { error: data.error }, cors);
    }

    return json(200, data, cors);
  }

  // -------------------------------------------------------------------------
  // reactivate_registration
  // -------------------------------------------------------------------------
  if (action === "reactivate_registration") {
    const registrationId = body.registration_id;

    if (typeof registrationId !== "string" || !isUuid(registrationId)) {
      return json(400, { error: "A valid registration_id is required." }, cors);
    }

    const { data, error } = await supabase.rpc("reactivate_registration", {
      p_registration_id: registrationId,
      p_actor:           actor,
    });

    if (error) {
      console.error("[attendance-admin] reactivate_registration error:", JSON.stringify(error));
      return json(500, { error: "Failed to reactivate registration." }, cors);
    }

    if (data && data.success === false) {
      return json(400, { error: data.error }, cors);
    }

    return json(200, data, cors);
  }

  // -------------------------------------------------------------------------
  // get_event_stats
  // -------------------------------------------------------------------------
  if (action === "get_event_stats") {
    const eventId = body.event_id;
    if (typeof eventId !== "string" || !isUuid(eventId)) {
      return json(400, { error: "A valid event_id is required." }, cors);
    }

    const { data, error } = await supabase.rpc("get_event_attendance_stats", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("[attendance-admin] get_event_stats error:", JSON.stringify(error));
      return json(500, { error: "Failed to load stats." }, cors);
    }

    return json(200, { stats: data }, cors);
  }

  // -------------------------------------------------------------------------
  // Unknown action
  // -------------------------------------------------------------------------
  return json(400, {
    error: "Unknown action.",
    valid_actions: [
      "list_events",
      "list_registrants",
      "mark_attendance",
      "bulk_mark_attendance",
      "cancel_registration",
      "reactivate_registration",
      "get_event_stats",
    ],
  }, cors);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
