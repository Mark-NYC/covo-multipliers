// supabase/functions/disciple-maker-cfc-diagnostic/index.ts
//
// CFC Diagnostic Recalculation
//
// POST /functions/v1/disciple-maker-cfc-diagnostic
//
// Receives diagnostic answers and recalculates CFC scores with weighted adjustments.
// Returns tailored recommendations based on gaps identified through diagnostic.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface DiagnosticData {
  commitment: string; // passion, people, place, profession
  focus: string[];
  consistency: string[];
}

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
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResp(status: number, body: Record<string, unknown>, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    return jsonResp(405, { error: "Method not allowed." }, cors);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const { results_token, diagnostic } = await req.json();

    if (!results_token || !diagnostic) {
      return jsonResp(400, { error: "Missing required fields." }, cors);
    }

    // Hash the token before querying
    const tokenHash = await sha256hex(results_token);

    // Get the session and scores
    const { data: session, error: sessionErr } = await supabase
      .from("disciple_maker_sessions")
      .select("id, dimension_scores")
      .eq("results_token_hash", tokenHash)
      .single();

    if (sessionErr || !session) {
      console.error("[cfc-diagnostic] session not found:", sessionErr);
      return jsonResp(404, { error: "Session not found." }, cors);
    }

    const scores = session.dimension_scores || {};
    const practice = scores.practice || 0;
    const rhythm = scores.rhythm || 0;
    const mission = scores.everyday_mission || 0;
    const coachability = scores.coachability || 0;
    const vision = scores.vision || 0;

    // Base CFC scores
    let commitment = (vision + mission) / 2;
    let focus = (practice + coachability) / 2;
    let consistency = rhythm;

    // === DIAGNOSTIC ADJUSTMENTS ===

    // Commitment adjustment based on mission field clarity
    // If they chose "Passion" (hobby they already do), it shows they can identify
    // an existing activity. This refines Commitment understanding.
    if (diagnostic.commitment === "passion") {
      // They found an existing activity they enjoy - good sign of clarity
      commitment = Math.min(5, commitment + 0.3);
    } else if (diagnostic.commitment === "people") {
      // Clear on specific relationships - strongest indicator
      commitment = Math.min(5, commitment + 0.5);
    } else if (diagnostic.commitment === "place") {
      // Geographic focus is clear
      commitment = Math.min(5, commitment + 0.4);
    } else if (diagnostic.commitment === "profession") {
      // Workplace focus is clear
      commitment = Math.min(5, commitment + 0.4);
    }

    // Focus adjustment based on actual activities
    const focusActivities = diagnostic.focus || [];
    const focusCount = focusActivities.length;

    if (focusCount === 0) {
      // Doing none of these activities - major gap
      focus = Math.max(1, focus - 1.0);
    } else if (focusCount === 1) {
      // Doing one activity
      focus = Math.max(1, focus - 0.5);
    } else if (focusCount === 2) {
      // Doing two activities - reasonable
      focus = Math.min(5, focus + 0.2);
    } else if (focusCount >= 3) {
      // Doing three or more - solid engagement
      focus = Math.min(5, focus + 0.5);
    }

    // Consistency adjustment based on 3-2-1 framework
    const consistencyItems = diagnostic.consistency || [];
    const consistencyCount = consistencyItems.length;

    if (consistencyCount === 0) {
      // Not doing any of the rhythms
      consistency = Math.max(1, consistency - 1.0);
    } else if (consistencyCount === 1) {
      // Doing one rhythm
      consistency = Math.max(1, consistency - 0.5);
    } else if (consistencyCount === 2) {
      // Doing two rhythms - good
      consistency = Math.min(5, consistency + 0.3);
    } else if (consistencyCount === 3) {
      // Doing all three rhythms - excellent
      consistency = Math.min(5, consistency + 0.8);
    }

    // === GENERATE TAILORED RECOMMENDATIONS ===
    let priority = null;
    const threshold = 3.5;

    const hasCommitment = commitment >= threshold;
    const hasFocus = focus >= threshold;
    const hasConsistency = consistency >= threshold;

    // Identify gaps and create specific action items
    if (!hasCommitment) {
      priority = {
        title: "Clarify Your Mission Field",
        reason: `You selected "${diagnostic.commitment}" as your focus, but the diagnostic shows you need clearer conviction about who God has placed around you. Get crystal clear on the 3-5 specific people or community He's calling you to reach.`,
        action: "This week: Write down 5-6 names of people in your ${diagnostic.commitment} who don't yet follow Jesus. This becomes your prayer list and your mission field."
      };
    } else if (!hasFocus) {
      const missingActivities = [];
      if (!diagnostic.focus.includes("praying")) missingActivities.push("praying for them by name");
      if (!diagnostic.focus.includes("conversations")) missingActivities.push("having spiritual conversations");
      if (!diagnostic.focus.includes("scripture")) missingActivities.push("doing faith activities together");
      if (!diagnostic.focus.includes("investing")) missingActivities.push("investing in their discipleship");

      priority = {
        title: "Move from Knowing to Doing",
        reason: `You know your mission field, but you're not yet doing the basic discipling activities. You're currently doing ${focusCount} of the 4 key activities—you need to add ${missingActivities.join(" and ")} to build focus.`,
        action: `This week: Pick ONE person and take ONE action. It could be a spiritual conversation, praying with them, or reading Scripture together. Don't aim for perfection—just start.`
      };
    } else if (!hasConsistency) {
      const missingRhythms = [];
      if (!diagnostic.consistency.includes("three")) missingRhythms.push("3+ hours/week Following & Fishing");
      if (!diagnostic.consistency.includes("two")) missingRhythms.push("2+ hours/week in multiplying gathering");
      if (!diagnostic.consistency.includes("one")) missingRhythms.push("1+ hour/week accountability team");

      priority = {
        title: "Build Your Consistency Rhythms",
        reason: `You're active, but inconsistency kills momentum. You're currently doing ${consistencyCount} of the 3 key rhythms. You need ${missingRhythms.join(", ")} to sustain this over time.`,
        action: `This week: Pick one rhythm and commit to it for 12 weeks. It could be a weekly coffee with your accountability team, a Friday lunch with a friend, or a Monday prayer time. Same time, same practice, every week.`
      };
    } else {
      priority = {
        title: "You're Ready to Multiply",
        reason: "You've got Commitment, Focus, and Consistency locked in. You know your mission field, you're taking action, and you're building the rhythms that sustain it. Now the question is: who else is watching your example?",
        action: "This week: Identify one person who's watching your journey. Invite them into the process. Tell them what you're doing and ask if they want to join you. Multiplication starts with invitation."
      };
    }

    // Save diagnostic answers to session
    await supabase
      .from("disciple_maker_sessions")
      .update({
        diagnostic_answers: {
          commitment: diagnostic.commitment,
          focus: diagnostic.focus,
          consistency: diagnostic.consistency,
          answered_at: new Date().toISOString()
        }
      })
      .eq("id", session.id);

    return jsonResp(200, {
      commitment: parseFloat(commitment.toFixed(1)),
      focus: parseFloat(focus.toFixed(1)),
      consistency: parseFloat(consistency.toFixed(1)),
      priority
    }, cors);
  } catch (error) {
    console.error("[cfc-diagnostic] Error:", error);
    return jsonResp(500, { error: "Failed to process diagnostic." }, cors);
  }
});
