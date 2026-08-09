// supabase/functions/disciple-maker-v2-event/index.ts
// POST /functions/v1/disciple-maker-v2-event
// POST /functions/v1/disciple-maker-event
// Body: { session_id?: string, results_token?: string, event: string, detail?: any }
//
// Best-effort funnel telemetry for the Disciple Maker Next Step. Writes one row
// to disciple_maker_events and flips summary booleans on the session for the key
// conversion moments. Never authenticated (low-risk, no PII in the payload) and
// always returns 200 so the client's keepalive beacon never blocks the UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://covomultipliers.com",
  "https://www.covomultipliers.com",
]);

const ALLOWED_EVENTS = new Set([
  "started", "question_answered", "recognition_confirmed", "completed",
  "results_viewed", "step_accepted", "human_named", "share_opened", "cta_clicked",
  // V2 prescription flow
  "prescription_opened", "calendar_added", "tool_opened",
  // Two-act baseline instrumentation
  "immediate_action_initiated", "accountability_opened",
]);

// event -> boolean column flipped on the session row
const FLAG: Record<string, string> = {
  step_accepted: "step_accepted",
  human_named: "human_connection_used",
  share_opened: "share_action_used",
  cta_clicked: "covo_cta_clicked",
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://covomultipliers.com",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function ok(cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return ok(cors); // never error the beacon

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return ok(cors); }

  const event = typeof body.event === "string" ? body.event : "";
  if (!ALLOWED_EVENTS.has(event)) return ok(cors);

  const detail = body.detail ?? null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Resolve session id from either a direct id or a results token hash.
    let sessionId: string | null = typeof body.session_id === "string" ? body.session_id : null;
    if (!sessionId && typeof body.results_token === "string") {
      const hash = await sha256hex(body.results_token);
      const { data } = await supabase
        .from("disciple_maker_sessions")
        .select("id")
        .eq("results_token_hash", hash)
        .single();
      sessionId = data?.id ?? null;
    }

    await supabase.from("disciple_maker_events").insert({
      session_id: sessionId,
      event,
      detail: detail && typeof detail === "object" ? detail : detail ? { value: detail } : null,
    });

    const col = FLAG[event];
    if (sessionId && col) {
      await supabase.from("disciple_maker_sessions").update({ [col]: true }).eq("id", sessionId);
    }
  } catch (err) {
    console.error("[disciple-maker-event] non-fatal:", err);
  }

  return ok(cors);
});
