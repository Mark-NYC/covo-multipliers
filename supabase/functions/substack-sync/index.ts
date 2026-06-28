// supabase/functions/substack-sync/index.ts
//
// Sync Substack post metrics to database
//
// POST /functions/v1/substack-sync
// Headers: { "x-admin-secret": "your_secret" }
// Body: { action: "sync_posts" | "get_metrics", publication_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_SECRET = Deno.env.get("ADMIN_ANALYTICS_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-admin-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

// Fetch posts from Substack publication
async function fetchSubstackPosts(
  publicationName: string
): Promise<Array<{ id: string; title: string; subtitle?: string; post_url: string; published_at?: string }>> {
  try {
    // Fetch publication feed (RSS or API endpoint)
    // Substack doesn't have an official API, so we use the undocumented /api/v1/posts endpoint
    const postsUrl = `https://${publicationName}.substack.com/api/v1/posts?limit=50`;
    const response = await fetch(postsUrl);
    if (!response.ok) {
      throw new Error(`Substack API error: ${response.status}`);
    }
    // Substack /api/v1/posts returns a plain array, not { posts: [...] }
    const data = await response.json();
    const posts = Array.isArray(data) ? data : (data.posts || []);
    return posts.map((p: Record<string, unknown>) => ({
      id: String(p.id),
      title: String(p.title || ""),
      subtitle: p.subtitle ? String(p.subtitle) : undefined,
      post_url: String(p.canonical_url || p.post_url || ""),
      published_at: p.post_date ? String(p.post_date) : (p.published_at ? String(p.published_at) : undefined),
    }));
  } catch (error) {
    console.error("Error fetching Substack posts:", error);
    return [];
  }
}

// Fetch detailed metrics for a specific post
async function fetchPostMetrics(
  publicationName: string,
  postId: string
): Promise<{ likes?: number; views?: number; clicks?: number; comments?: number }> {
  try {
    // Note: Substack doesn't expose detailed metrics via public API
    // For now, return placeholder. In production, you'd scrape or use undocumented endpoints
    const metricsUrl = `https://${publicationName}.substack.com/api/v1/posts/${postId}`;
    const response = await fetch(metricsUrl);
    if (!response.ok) {
      return {};
    }
    const data = await response.json() as Record<string, unknown>;
    return {
      likes: Number(data.reactions || data.likes || 0),
      views: Number(data.total_views || data.views || 0),
      clicks: Number(data.clicks || 0),
      comments: Number(data.comment_count || data.comments || 0),
    };
  } catch (error) {
    console.error("Error fetching post metrics:", error);
    return {};
  }
}

async function syncPosts(publicationName: string): Promise<Response> {
  try {
    const posts = await fetchSubstackPosts(publicationName);

    if (posts.length === 0) {
      return json(200, { message: "No posts found", synced: 0 });
    }

    let synced = 0;

    for (const post of posts) {
      // Check if post already exists
      const { data: existing } = await supabase
        .from("substack_posts")
        .select("id")
        .eq("id", post.id)
        .single();

      if (!existing) {
        // Insert new post
        const { error } = await supabase.from("substack_posts").insert({
          id: post.id,
          publication_id: publicationName,
          title: post.title,
          subtitle: post.subtitle || null,
          post_url: post.post_url,
          published_at: post.published_at || null,
        });
        if (error) continue;
      }

      synced++;

      // Upsert today's metrics snapshot (one row per post per day)
      const metrics = await fetchPostMetrics(publicationName, post.id);
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("substack_metrics").upsert({
        post_id: post.id,
        metric_day: today,
        likes: metrics.likes || 0,
        views: metrics.views || 0,
        clicks: metrics.clicks || 0,
        comments: metrics.comments || 0,
      }, { onConflict: "post_id,metric_day" });
    }

    return json(200, {
      message: "Sync completed",
      synced,
      total: posts.length,
    });
  } catch (error) {
    console.error("Error in syncPosts:", error);
    return json(500, { error: "Sync failed", details: String(error) });
  }
}

async function getMetrics(publicationName?: string): Promise<Response> {
  try {
    let query = supabase
      .from("substack_metrics")
      .select(
        `
        id,
        post_id,
        metric_day,
        likes,
        views,
        clicks,
        comments,
        substack_posts (
          id,
          title,
          post_url,
          published_at
        )
      `
      )
      .order("metric_day", { ascending: false })
      .limit(50);

    if (publicationName) {
      query = query.eq("substack_posts.publication_id", publicationName);
    }

    const { data, error } = await query;

    if (error) {
      return json(500, { error: "Query failed", details: error.message });
    }

    return json(200, { data });
  } catch (error) {
    console.error("Error in getMetrics:", error);
    return json(500, { error: "Query failed", details: String(error) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("OK", { headers: corsHeaders() });
  }

  // Verify admin secret
  const secret = req.headers.get("x-admin-secret");
  if (secret !== ADMIN_SECRET) {
    return json(401, { error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json() as { action?: string; publication_id?: string };
    const { action, publication_id } = body;

    if (!action) {
      return json(400, { error: "Missing action parameter" });
    }

    if (action === "sync_posts") {
      if (!publication_id) {
        return json(400, { error: "Missing publication_id for sync_posts" });
      }
      return await syncPosts(publication_id);
    }

    if (action === "get_metrics") {
      return await getMetrics(publication_id);
    }

    return json(400, { error: "Unknown action" });
  } catch (error) {
    console.error("Error processing request:", error);
    return json(500, { error: "Internal server error", details: String(error) });
  }
});
