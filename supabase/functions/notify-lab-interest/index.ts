// supabase/functions/notify-lab-interest/index.ts
//
// Covo Multipliers — Manual lab-interest broadcast
//
// POST /functions/v1/notify-lab-interest
// Headers: x-admin-secret: <ADMIN_SECRET>
// Body:    { "labs_url": "https://covomultipliers.com/#upcoming-labs" }
//
// 1. Verify admin secret
// 2. Fetch all rows from lab_interest
// 3. Send one email via Resend (BCC all subscribers, preserving privacy)
// 4. Update last_notified_at on all rows
// 5. Return { emailed: N }
//
// Secrets (set with: supabase secrets set KEY=value):
//   ADMIN_SECRET        — arbitrary string you choose
//   RESEND_API_KEY      — from resend.com dashboard
//   RESEND_FROM_EMAIL   — verified sender, e.g. labs@covomultipliers.com
//
// Auto-injected by Supabase (do not set manually):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  // Verify admin secret
  const adminSecret = Deno.env.get("ADMIN_SECRET");
  if (!adminSecret) {
    console.error("ADMIN_SECRET not configured.");
    return json(500, { error: "Server misconfiguration." });
  }
  if (req.headers.get("x-admin-secret") !== adminSecret) {
    return json(401, { error: "Unauthorized." });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const labsUrl = typeof body.labs_url === "string" ? body.labs_url.trim() : "";
  if (!labsUrl) {
    return json(400, { error: "labs_url is required." });
  }

  // Fetch all subscribers (service role bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: rows, error: fetchError } = await supabase
    .from("lab_interest")
    .select("id, email");

  if (fetchError) {
    console.error("Fetch error:", fetchError);
    return json(500, { error: "Failed to fetch subscribers." });
  }

  if (!rows || rows.length === 0) {
    return json(200, { emailed: 0, message: "No subscribers to notify." });
  }

  const emails = rows.map((r: { email: string }) => r.email);

  // Send one email — BCC all subscribers so addresses stay private
  const sent = await sendBroadcast(emails, labsUrl);
  if (!sent) {
    return json(500, { error: "Email send failed. No records updated." });
  }

  // Update last_notified_at for all notified rows
  const ids = rows.map((r: { id: string }) => r.id);
  const { error: updateError } = await supabase
    .from("lab_interest")
    .update({ last_notified_at: new Date().toISOString() })
    .in("id", ids);

  if (updateError) {
    console.warn("Could not update last_notified_at:", updateError);
  }

  return json(200, {
    emailed: rows.length,
    message: `Notification sent to ${rows.length} subscriber${rows.length === 1 ? "" : "s"}.`,
  });
});

async function sendBroadcast(emails: string[], labsUrl: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "labs@covomultipliers.com";

  if (!apiKey) {
    console.error("RESEND_API_KEY not set.");
    return false;
  }

  const text =
    `New Covo Multipliers labs are open.\n\n` +
    `See the upcoming labs here:\n${labsUrl}\n\n` +
    `Seats are limited to 25 per lab.\n\n` +
    `— Covo Multipliers\nhttps://covomultipliers.com`;

  try {
    // "to" is the sender (admin copy); subscribers receive via bcc
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Covo Multipliers <${from}>`,
        to: [from],
        bcc: emails,
        subject: "New Covo Multipliers labs are open",
        text,
      }),
    });

    if (!res.ok) {
      console.error(`Resend error ${res.status}:`, await res.text());
      return false;
    }

    console.log(`Broadcast sent to ${emails.length} subscriber(s).`);
    return true;
  } catch (err) {
    console.error("Email send failed:", err);
    return false;
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
