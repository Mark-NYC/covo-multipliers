// Publication articles and daily public engagement snapshots.
// Notes, opens, views and subscriber counts require a separate authorized source.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { collectPosts } from './core.js';

const secret = Deno.env.get('ADMIN_ANALYTICS_SECRET') || '';
const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const publication = 'multiplyingdisciples';
const postColumns = 'id, title, post_url, published_at, post_type, audience, tags';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('OK', { headers });
  if (!secret) return json(503, { error: 'Configuration missing', details: 'Set ADMIN_ANALYTICS_SECRET in Edge Function Secrets.' });
  if (req.headers.get('x-admin-secret') !== secret) return json(401, { error: 'Unauthorized' });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON request' }); }
  if (!body || typeof body !== 'object') return json(400, { error: 'Invalid request' });
  if (body.publication_id && body.publication_id !== publication) return json(400, { error: 'Unsupported publication' });
  const action = body.action;
  try {
    if (action === 'sync_posts') {
      return json(200, await collectPosts({ db, fetcher: fetch, publication }));
    }
    if (action === 'health') {
      const posts = await db.from('substack_posts').select(postColumns, { count: 'exact', head: true }).eq('publication_id', publication);
      if (posts.error) throw new Error(`Post schema check failed: ${posts.error.message}`);
      const metrics = await db.from('substack_metrics').select(`metric_day, likes, comments, restacks, substack_posts!inner(publication_id)`).eq('substack_posts.publication_id', publication).order('metric_day', { ascending: false }).limit(1);
      if (metrics.error) throw new Error(`Snapshot schema check failed: ${metrics.error.message}`);
      const latest = metrics.data?.[0]?.metric_day || null;
      return json(200, { schema_ready: true, post_count: posts.count, latest_metric_day: latest,
        has_snapshots: !!latest, notes_supported: false,
        message: latest ? 'Stored publication snapshots available. Check snapshot date for freshness.' : 'Database ready. Run sync_posts to collect the first snapshot.' });
    }
    if (action === 'list_posts') {
      let query = db.from('substack_posts').select(postColumns).eq('publication_id', publication).not('published_at', 'is', null).order('published_at', { ascending: true }).limit(1000);
      for (const key of ['p_start', 'p_end']) {
        if (body[key] && !Number.isFinite(Date.parse(body[key]))) return json(400, { error: `Invalid ${key}` });
      }
      if (body.p_start) query = query.gte('published_at', body.p_start);
      if (body.p_end) query = query.lt('published_at', body.p_end);
      const { data, error } = await query;
      if (error) throw new Error(`Post query failed: ${error.message}`);
      return json(200, { data });
    }
    if (action === 'get_metrics') {
      const { data, error } = await db.from('substack_metrics')
        .select(`id, post_id, metric_day, likes, comments, restacks, substack_posts!inner(${postColumns}, publication_id)`)
        .eq('substack_posts.publication_id', publication)
        .order('metric_day', { ascending: false }).limit(1000);
      if (error) throw new Error(`Snapshot query failed: ${error.message}`);
      if (!data?.length) return json(503, { error: 'No snapshots collected', details: 'Run sync_posts after applying the Substack database setup.' });
      return json(200, { data, latest_metric_day: data[0].metric_day, notes_supported: false });
    }
    return json(400, { error: 'Unknown action', actions: ['health', 'sync_posts', 'get_metrics', 'list_posts'] });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown Substack error';
    console.error('[substack-sync]', { action, error: details });
    return json(500, { error: 'Substack integration failed', details,
      setup: 'Check database setup, then test health and sync_posts.' });
  }
});
