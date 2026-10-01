import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePosts, collectPosts } from './core.js';
const post = { id: 123, title: 'Test post', canonical_url: 'https://multiplyingdisciples.substack.com/p/test', post_date: '2026-10-01T12:00:00Z', reaction_count: 0, comment_count: 2 };
test('missing metrics stay unknown, observed zero stays zero', () => {
  assert.deepEqual(normalizePosts([post], 'multiplyingdisciples')[0].metrics, { likes: 0, comments: 2, restacks: null });
});
test('empty or malformed source is a failure', () => {
  for (const x of [[], {}, [{ ...post, id: null }], [{ ...post, post_date: 'bad' }]]) assert.throws(() => normalizePosts(x, 'multiplyingdisciples'));
});
const db = fail => ({ from(table) { return { async upsert(rows, options) { return { error: table === fail ? { message: 'database write rejected' } : null }; } }; } });
test('upstream refusal is never reported as a successful empty sync', async () => {
  await assert.rejects(collectPosts({ db: db(), publication: 'multiplyingdisciples', fetcher: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
});
test('both post and metric writes must succeed', async () => {
  for (const table of ['substack_posts', 'substack_metrics']) await assert.rejects(collectPosts({ db: db(table), publication: 'multiplyingdisciples', fetcher: async () => ({ ok: true, json: async () => [post] }) }), /write failed/);
});
test('completed sync reports the actual snapshot day and count', async () => {
  const result = await collectPosts({ db: db(), publication: 'multiplyingdisciples', now: new Date('2026-10-01T12:00:00Z'), fetcher: async () => ({ ok: true, json: async () => [post] }) });
  assert.equal(result.synced, 1); assert.equal(result.metric_day, '2026-10-01');
});
