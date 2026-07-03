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

interface SubstackPost {
  id: string;
  title: string;
  subtitle?: string;
  post_url: string;
  published_at?: string;
  likes: number;
  comments: number;
  restacks: number;
  postType?: string;
  audience?: string;
  tags: string[];
}

// Fetch posts from Substack publication, including every engagement field
// the list endpoint actually returns (likes, comments, restacks) and post
// categorization metadata (type, audience, tags).
//
// Substack's public API does NOT expose page views, clicks, email opens, or
// subscriber counts anywhere — those live behind an authenticated owner
// dashboard. Web pageviews/clicks for these posts are tracked separately via
// the GA4 panel instead (see admin/funnel.html GA4 section).
async function fetchSubstackPosts(publicationName: string): Promise<SubstackPost[]> {
  try {
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
      likes: Number(p.reaction_count || 0),
      comments: Number(p.comment_count || 0),
      restacks: Number(p.restacks || 0),
      postType: p.type ? String(p.type) : undefined,
      audience: p.audience ? String(p.audience) : undefined,
      tags: Array.isArray(p.postTags)
        ? (p.postTags as Array<Record<string, unknown>>).map((t) => String(t.name || "")).filter(Boolean)
        : [],
    }));
  } catch (error) {
    console.error("Error fetching Substack posts:", error);
    return [];
  }
}

async function debugShapes(publicationName: string): Promise<Response> {
  // Fetch raw API responses and return them as-is for field inspection
  const postsUrl = `https://${publicationName}.substack.com/api/v1/posts?limit=2`;
  const postsRes = await fetch(postsUrl);
  const postsRaw = await postsRes.json();

  const posts = Array.isArray(postsRaw) ? postsRaw : (postsRaw.posts || []);
  const firstPost = posts[0];
  const postId = firstPost?.id;

  let postDetailRaw: unknown = null;
  if (postId) {
    const detailUrl = `https://${publicationName}.substack.com/api/v1/posts/${postId}`;
    const detailRes = await fetch(detailUrl);
    postDetailRaw = await detailRes.json();
  }

  // Surface only the keys and their types/values — avoid giant HTML bodies
  function shapeOf(obj: unknown, depth = 0): unknown {
    if (depth > 2 || obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.slice(0, 2).map((v) => shapeOf(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 120) {
        out[k] = v.slice(0, 80) + "…[truncated]";
      } else {
        out[k] = shapeOf(v, depth + 1);
      }
    }
    return out;
  }

  return json(200, {
    posts_endpoint_is_array: Array.isArray(postsRaw),
    first_post_shape: shapeOf(firstPost),
    post_detail_shape: shapeOf(postDetailRaw),
    fields_of_interest: {
      id: firstPost?.id,
      title: firstPost?.title,
      canonical_url: firstPost?.canonical_url,
      post_url: firstPost?.post_url,
      slug: firstPost?.slug,
      post_date: firstPost?.post_date,
      published_at: firstPost?.published_at,
      reactions: (firstPost as Record<string, unknown>)?.reactions,
      reaction_count: (firstPost as Record<string, unknown>)?.reaction_count,
      comment_count: firstPost?.comment_count,
      comments: (firstPost as Record<string, unknown>)?.comments,
      // detail endpoint fields
      detail_reactions: (postDetailRaw as Record<string, unknown>)?.reactions,
      detail_reaction_count: (postDetailRaw as Record<string, unknown>)?.reaction_count,
      detail_comment_count: (postDetailRaw as Record<string, unknown>)?.comment_count,
      detail_likes: (postDetailRaw as Record<string, unknown>)?.likes,
      detail_total_views: (postDetailRaw as Record<string, unknown>)?.total_views,
      detail_views: (postDetailRaw as Record<string, unknown>)?.views,
      detail_clicks: (postDetailRaw as Record<string, unknown>)?.clicks,
    }
  });
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
          post_type: post.postType || null,
          audience: post.audience || null,
          tags: post.tags,
        });
        if (error) continue;
      }

      synced++;

      // Upsert today's engagement snapshot (one row per post per day)
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("substack_metrics").upsert({
        post_id: post.id,
        metric_day: today,
        likes: post.likes,
        comments: post.comments,
        restacks: post.restacks,
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
        comments,
        restacks,
        substack_posts (
          id,
          title,
          post_url,
          published_at,
          post_type,
          audience,
          tags
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
  console.log("[substack-sync] auth_diag", {
    secret_env_set: !!ADMIN_SECRET,
    secret_env_len: ADMIN_SECRET.length,
    provided_len: secret?.length ?? 0,
    match: secret === ADMIN_SECRET,
  });
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

    if (action === "debug_shapes") {
      if (!publication_id) {
        return json(400, { error: "Missing publication_id for debug_shapes" });
      }
      return await debugShapes(publication_id);
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
