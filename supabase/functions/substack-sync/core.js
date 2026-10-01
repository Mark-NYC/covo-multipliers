// Shared by the Edge Function and Node regression tests. No credentials here.
export function normalizePosts(payload, publication) {
  const items = Array.isArray(payload) ? payload : payload?.posts;
  if (!Array.isArray(items) || !items.length) throw new Error('Substack returned no usable posts');
  const number = value => Number.isInteger(value) && value >= 0 ? value : null;
  return items.map(p => {
    if (!p.id || !p.title) throw new Error('Substack post is missing its ID or title');
    const url = new URL(p.canonical_url || p.post_url);
    if (url.protocol !== 'https:') throw new Error('Substack post link must use HTTPS');
    const published = p.post_date || p.published_at;
    if (!published || !Number.isFinite(Date.parse(published))) throw new Error('Substack post date is missing or invalid');
    return {
      post: { id: String(p.id), publication_id: publication, title: String(p.title),
        subtitle: p.subtitle || null, post_url: url.href, published_at: new Date(published).toISOString(),
        post_type: p.type || null, audience: p.audience || null,
        tags: Array.isArray(p.postTags) ? p.postTags.map(t => t.name).filter(t => typeof t === 'string') : [],
        updated_at: new Date().toISOString() },
      metrics: { likes: number(p.reaction_count), comments: number(p.comment_count), restacks: number(p.restacks) },
    };
  });
}

export async function collectPosts({ db, fetcher, publication, now = new Date() }) {
  // The public endpoint is undocumented. Fail visibly if it changes or refuses access.
  const response = await fetcher(`https://${publication}.substack.com/api/v1/posts?limit=50`, {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`Substack fetch returned HTTP ${response.status}`);
  const posts = normalizePosts(await response.json(), publication);
  const day = now.toISOString().slice(0, 10);
  const { error: postError } = await db.from('substack_posts').upsert(posts.map(x => x.post), { onConflict: 'id' });
  if (postError) throw new Error(`Post write failed: ${postError.message}`);
  const { error: metricError } = await db.from('substack_metrics').upsert(posts.map(x => ({
    post_id: x.post.id, metric_day: day, ...x.metrics,
  })), { onConflict: 'post_id,metric_day' });
  if (metricError) throw new Error(`Snapshot write failed: ${metricError.message}`);
  return { message: 'Sync completed', synced: posts.length, total: posts.length, metric_day: day,
    coverage: 'Latest 50 publication posts. Notes and private owner statistics are not collected.' };
}
