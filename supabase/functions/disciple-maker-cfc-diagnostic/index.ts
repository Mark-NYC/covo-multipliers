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

    // === GENERATE TACTICAL BREAKTHROUGH PATH ===
    let breakthroughPath = null;
    const threshold = 3.5;

    const hasCommitment = commitment >= threshold;
    const hasFocus = focus >= threshold;
    const hasConsistency = consistency >= threshold;

    // Mission field mapping for specific feedback
    const missionFieldMap = {
      passion: "hobby or activity you already enjoy",
      people: "relationships and friend groups",
      place: "geographic community or neighborhood",
      profession: "workplace or professional network"
    };

    if (!hasCommitment) {
      // Not locked in on mission field
      const fieldDesc = missionFieldMap[diagnostic.commitment as keyof typeof missionFieldMap] || "mission field";
      breakthroughPath = {
        title: "Lock In Your Mission Field",
        detail: `You selected ${fieldDesc} as your focus, but you haven't crystallized who you're actually reaching. Without clarity on the specific people God has placed around you, you'll keep starting and stopping. You need to move from vague intention to named people.`,
        action: `This week: Write down 5-6 specific names of people in your ${diagnostic.commitment} who don't yet follow Jesus. Put them on a prayer list. This is your mission field.`
      };
    } else if (!hasFocus) {
      // Not taking action yet or needs depth
      const missing = [];
      if (!diagnostic.focus.includes("praying")) missing.push("praying for them by name");
      if (!diagnostic.focus.includes("conversations")) missing.push("spiritual conversations");
      if (!diagnostic.focus.includes("scripture")) missing.push("faith activities together");
      if (!diagnostic.focus.includes("investing")) missing.push("investing in their growth");

      let detail = "";
      if (missing.length > 0) {
        detail = `You know your mission field, but you're not yet taking action. Knowing about disciple-making doesn't cost you anything. Actually doing it requires time, vulnerability, and risk. You're currently doing ${focusCount} of the 4 core activities. The ones you're missing—${missing.join(", ")}—are what separate Christians who make disciples from those who don't.`;
      } else {
        detail = `You say you're doing all four core activities, but something isn't translating to real traction. Either the activities are shallow (checking a box instead of going deep), inconsistent, or lacking intentionality. Disciple-making isn't about doing more—it's about doing it with quality and persistence. The real question: Are these practices creating spiritual movement in people's lives?`;
      }

      breakthroughPath = {
        title: "Move from Knowing to Doing",
        detail: detail,
        action: `This week: Choose ONE person and take ONE action. Pray with them. Ask a real spiritual question. Read Scripture together. Don't wait until you feel ready.`
      };
    } else if (!hasConsistency) {
      // Missing 3-2-1 rhythms
      const missing = [];
      if (!diagnostic.consistency.includes("three")) {
        missing.push({
          rhythm: "Following & Fishing (3+ hours/week)",
          cost: "You're not spending enough time with lost people. Without relationship, there's no one to lead to Jesus.",
          action: "This week: Schedule 3 separate times to be with lost people (could be lunch, coffee, your hobby, neighborhood time)."
        });
      }
      if (!diagnostic.consistency.includes("two")) {
        missing.push({
          rhythm: "Multiplying Gathering (2+ hours/week)",
          cost: "You're isolated. Without others who share your vision, you'll burn out alone. Multiplication happens in community.",
          action: "This week: Find one other person serious about this and propose a weekly 2-hour gathering (meal, study, prayer)."
        });
      }
      if (!diagnostic.consistency.includes("one")) {
        missing.push({
          rhythm: "Accountability Team (1+ hour/week)",
          cost: "You're unaccountable. Without someone checking your progress weekly, you'll drift back to normal when life gets hard.",
          action: "This week: Text one person and ask them to hold you accountable. One weekly check-in: 'How's your discipleship going?'"
        });
      }

      // Format the missing rhythms into the detail
      const rhythmDetails = missing.map(m => `\n**${m.rhythm}**\n${m.cost}\n${m.action}`).join("\n");

      breakthroughPath = {
        title: "Build the Rhythms That Stick",
        detail: `You're doing ${consistencyCount} of the 3 critical rhythms. Here's what's missing—and why it matters:${rhythmDetails}`,
        action: "" // Action is embedded in detail above
      };
    } else {
      // All strong
      breakthroughPath = {
        title: "You're Ready to Multiply",
        detail: `You've got it locked in. Clear mission field. Active practice. Building the rhythms. You're not waiting for perfect—you're just doing the work. The breakthrough question now is: who else is watching you? Who sees your commitment and wants to join?`,
        action: `This week: Identify one person who's watching your journey. Invite them in. Tell them what you're doing and ask if they want to take their next step with you.`
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
      breakthroughPath
    }, cors);
  } catch (error) {
    console.error("[cfc-diagnostic] Error:", error);
    return jsonResp(500, { error: "Failed to process diagnostic." }, cors);
  }
});
