#!/usr/bin/env python3
"""Resolve per-episode Apple Podcasts / Spotify links for H3X.

Reads h3x-feed.json (written by the cache-h3x-feed workflow) and updates
h3x-links.json, a map of RSS guid -> {title, apple, spotify}.

The file is additive: a link, once found, is never removed or overwritten,
so older episodes stay linked after they fall out of a platform's "recent"
window, and a hand-edited link in h3x-links.json is preserved. To fix a bad
match, edit the value by hand; to force a re-match, delete it.

Sources (each is optional; a failure only skips that platform this run):
  Apple    iTunes Lookup API, matched by RSS guid, then title.
  Spotify  Web API if SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set
           (full archive), else the public show embed page (recent only).

Stdlib only.
"""
import base64
import difflib
import html
import json
import os
import re
import sys
import urllib.request

FEED_JSON = 'h3x-feed.json'
LINKS_JSON = 'h3x-links.json'

APPLE_SHOW_ID = '1562206185'
SPOTIFY_SHOW_ID = '2NNDtnQaRLeqRU2N3LVayR'

UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/125.0 Safari/537.36')
MATCH_THRESHOLD = 0.86
PLATFORMS = ('apple', 'spotify')


def log(msg):
    print(msg, file=sys.stderr)


def http_get(url, headers=None, data=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode('utf-8', 'replace')


# ---------------------------------------------------------------- matching

NOISE = re.compile(r'\b(h3x|podcast|episode|ep|full episode)\b')


def normalize(title):
    t = html.unescape(title or '').lower()
    t = t.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    t = re.sub(r'\s[|–—-]\s*h3x.*$', '', t)  # "Title | H3X Podcast"
    t = re.sub(r"'", '', t)
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    t = NOISE.sub(' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def score(a, b):
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    short, long_ = sorted((a, b), key=len)
    if len(short) >= 18 and short in long_:
        return 0.95
    return difflib.SequenceMatcher(None, a, b).ratio()


def match_by_title(episodes, candidates, platform, links):
    """Greedy best-first title match of candidates [(title, url)] onto episodes
    still missing `platform`. Each candidate is used at most once."""
    taken = {v.get(platform) for v in links.values() if v.get(platform)}
    cands = [(normalize(t), u) for t, u in candidates if u and u not in taken]
    pairs = []
    for ep in episodes:
        if links.get(ep['guid'], {}).get(platform):
            continue
        n = normalize(ep['title'])
        for i, (cn, _) in enumerate(cands):
            s = score(n, cn)
            if s >= MATCH_THRESHOLD:
                pairs.append((s, ep['guid'], i))
    pairs.sort(reverse=True)
    used_eps, used_cands, found = set(), set(), 0
    for s, guid, i in pairs:
        if guid in used_eps or i in used_cands:
            continue
        used_eps.add(guid)
        used_cands.add(i)
        links[guid][platform] = cands[i][1]
        found += 1
    return found


# ----------------------------------------------------------------- sources

def apple_episodes():
    url = ('https://itunes.apple.com/lookup?id=%s&entity=podcastEpisode'
           '&limit=200&country=us' % APPLE_SHOW_ID)
    data = json.loads(http_get(url))
    out = []
    for r in data.get('results', []):
        if r.get('wrapperType') != 'podcastEpisode' and r.get('kind') != 'podcast-episode':
            continue
        out.append({
            'guid': (r.get('episodeGuid') or '').strip(),
            'title': r.get('trackName') or '',
            'url': (r.get('trackViewUrl') or '').split('?')[0] + (
                '?i=%s' % r['trackId'] if r.get('trackId') else ''),
        })
    return out


def spotify_api_episodes(client_id, client_secret):
    auth = base64.b64encode(('%s:%s' % (client_id, client_secret)).encode()).decode()
    token = json.loads(http_get(
        'https://accounts.spotify.com/api/token',
        headers={'Authorization': 'Basic ' + auth,
                 'Content-Type': 'application/x-www-form-urlencoded'},
        data=b'grant_type=client_credentials'))['access_token']
    out = []
    url = 'https://api.spotify.com/v1/shows/%s/episodes?market=US&limit=50' % SPOTIFY_SHOW_ID
    while url:
        page = json.loads(http_get(url, headers={'Authorization': 'Bearer ' + token}))
        for ep in page.get('items') or []:
            if ep and ep.get('id'):
                out.append((ep.get('name') or '', 'https://open.spotify.com/episode/' + ep['id']))
        url = page.get('next')
    return out


def spotify_embed_episodes():
    page = http_get('https://open.spotify.com/embed/show/%s' % SPOTIFY_SHOW_ID)
    m = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        raise RuntimeError('no __NEXT_DATA__ on embed page')
    out = []

    def walk(node):
        if isinstance(node, dict):
            uri = node.get('uri')
            name = node.get('title') or node.get('name')
            if isinstance(uri, str) and uri.startswith('spotify:episode:') and name:
                out.append((name, 'https://open.spotify.com/episode/' + uri.split(':')[-1]))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(json.loads(m.group(1)))
    return out


def first_working(*fns):
    for fn in fns:
        try:
            result = fn()
            if result:
                log('  %s: %d candidates' % (fn.__name__, len(result)))
                return result
            log('  %s: no results' % fn.__name__)
        except Exception as e:  # network, parse, rate limit — try the next one
            log('  %s failed: %s' % (fn.__name__, e))
    return []


# -------------------------------------------------------------------- main

def main():
    with open(FEED_JSON, encoding='utf-8') as f:
        episodes = [
            {'guid': (it.get('guid') or '').strip(), 'title': it.get('title') or ''}
            for it in json.load(f).get('items', [])
        ]
    episodes = [e for e in episodes if e['guid']]

    try:
        with open(LINKS_JSON, encoding='utf-8') as f:
            links = json.load(f).get('episodes', {})
    except FileNotFoundError:
        links = {}

    for ep in episodes:
        entry = links.setdefault(ep['guid'], {})
        entry['title'] = ep['title']
        for p in PLATFORMS:
            entry.setdefault(p, '')

    def missing(p):
        return [e for e in episodes if not links[e['guid']].get(p)]

    # Apple: exact guid match first, then title.
    if missing('apple'):
        log('Apple:')
        apple = first_working(apple_episodes)
        by_guid = {a['guid']: a['url'] for a in apple if a['guid'] and a['url']}
        n = 0
        for ep in missing('apple'):
            if ep['guid'] in by_guid:
                links[ep['guid']]['apple'] = by_guid[ep['guid']]
                n += 1
        n += match_by_title(episodes, [(a['title'], a['url']) for a in apple], 'apple', links)
        log('  linked %d' % n)

    if missing('spotify'):
        log('Spotify:')
        cid, secret = os.environ.get('SPOTIFY_CLIENT_ID'), os.environ.get('SPOTIFY_CLIENT_SECRET')
        sources = [spotify_embed_episodes]
        if cid and secret:
            def spotify_api():
                return spotify_api_episodes(cid, secret)
            spotify_api.__name__ = 'spotify_api_episodes'
            sources.insert(0, spotify_api)
        log('  linked %d' % match_by_title(episodes, first_working(*sources), 'spotify', links))

    # Newest first, matching the feed order; keep entries for episodes that
    # have left the feed rather than dropping links we already resolved.
    order = [e['guid'] for e in episodes]
    ordered = {g: links[g] for g in order}
    ordered.update({g: v for g, v in links.items() if g not in ordered})

    with open(LINKS_JSON, 'w', encoding='utf-8') as f:
        json.dump({'episodes': ordered}, f, ensure_ascii=False, indent=2)
        f.write('\n')

    for p in PLATFORMS:
        have = sum(1 for e in episodes if links[e['guid']].get(p))
        log('%-8s %d/%d episodes linked' % (p, have, len(episodes)))


if __name__ == '__main__':
    main()
