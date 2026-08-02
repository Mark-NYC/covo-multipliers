#!/usr/bin/env node
/*
 * Covo Multipliers — frontend Turnstile config generator (Vercel build step)
 * =========================================================================
 *
 * The public Cloudflare Turnstile SITE key must differ per environment
 * (production / preview / localhost) and must be rotatable without editing
 * source. This script reads it from a Vercel environment variable at build
 * time and writes it into the frontend in two places:
 *
 *   1. `turnstile-config.js` — sets `window.COVO_TURNSTILE_SITE_KEY`, loaded by
 *      every same-origin lab page before covo-turnstile.js.
 *
 *   2. `embeds/lab-registration-widget.js` — the cross-origin embed can't read
 *      that global on a third-party host page, so the key is injected in place
 *      of the `__COVO_TURNSTILE_SITE_KEY__` placeholder.
 *
 * Environment variables (set in the Vercel dashboard, per environment):
 *   PUBLIC_TURNSTILE_SITE_KEY  (preferred)   — the public site key
 *   TURNSTILE_SITE_KEY         (accepted alias)
 *
 * The SECRET key is never referenced here — it lives only in Supabase Edge
 * Function secrets.
 *
 * If neither variable is set, a public FALLBACK site key (the CoVo production
 * site key) is used so a build never ships a broken/placeholder widget. The
 * committed `turnstile-config.js` ships the same key so opening the pages
 * locally (without running this script) works. Rotate via the env var.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Fallback used only when PUBLIC_TURNSTILE_SITE_KEY is not set (or malformed).
// This is the CoVo Multipliers PRODUCTION *site* key — public and safe to
// commit — so a build without the env var still ships a working widget rather
// than the Cloudflare test key (which a real secret would reject). Rotate via
// the Vercel env var, not by editing this.
const FALLBACK_SITE_KEY = '0x4AAAAAAD6wlX7Wg73UGvGH';
const PLACEHOLDER = '__COVO_TURNSTILE_SITE_KEY__';

const root = path.resolve(__dirname, '..');

// Returns { key, fromEnv }. fromEnv is true only when a valid key came from the
// environment — used to decide whether to rewrite the committed embed source
// (so a local `npm run build` with no env never dirties the placeholder).
function resolveSiteKey() {
  const raw =
    process.env.PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    '';
  const key = raw.trim();
  if (!key) {
    console.warn(
      '[turnstile-config] No PUBLIC_TURNSTILE_SITE_KEY set — using the committed fallback site key. ' +
        'Set PUBLIC_TURNSTILE_SITE_KEY in the Vercel dashboard to override/rotate.'
    );
    return { key: FALLBACK_SITE_KEY, fromEnv: false };
  }
  // Turnstile site keys are short alphanumeric tokens (may contain _ and -).
  // Refuse anything else so we never inject arbitrary text into generated JS.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    console.warn(
      '[turnstile-config] PUBLIC_TURNSTILE_SITE_KEY has an unexpected format — falling back to the committed site key.'
    );
    return { key: FALLBACK_SITE_KEY, fromEnv: false };
  }
  return { key, fromEnv: true };
}

function writeConfigFile(siteKey) {
  const file = path.join(root, 'turnstile-config.js');
  const contents =
    '// AUTO-GENERATED at build time by scripts/generate-turnstile-config.js\n' +
    '// from the PUBLIC_TURNSTILE_SITE_KEY Vercel environment variable.\n' +
    '// A site key is public; the committed value is the production fallback.\n' +
    '// Rotate via the Vercel env var, not by editing this file.\n' +
    'window.COVO_TURNSTILE_SITE_KEY = ' + JSON.stringify(siteKey) + ';\n';
  fs.writeFileSync(file, contents);
  console.log('[turnstile-config] wrote turnstile-config.js');
}

function injectIntoEmbed(siteKey) {
  const file = path.join(root, 'embeds', 'lab-registration-widget.js');
  if (!fs.existsSync(file)) {
    console.warn('[turnstile-config] embed widget not found — skipping injection.');
    return;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.indexOf(PLACEHOLDER) === -1) {
    console.warn(
      '[turnstile-config] placeholder not found in embed widget — leaving it unchanged.'
    );
    return;
  }
  const out = src.split(PLACEHOLDER).join(siteKey);
  fs.writeFileSync(file, out);
  console.log('[turnstile-config] injected site key into embeds/lab-registration-widget.js');
}

function main() {
  const { key: siteKey, fromEnv } = resolveSiteKey();
  writeConfigFile(siteKey);
  // Inject the key into the cross-origin embed on any real build (env key
  // provided, or running on Vercel — VERCEL=1). The embed is loaded on
  // third-party hosts that never see turnstile-config.js, so it must carry the
  // key itself. Skip only for a plain local `npm run build` with no env, so the
  // committed placeholder isn't dirtied in a normal working tree.
  if (fromEnv || process.env.VERCEL) {
    injectIntoEmbed(siteKey);
  } else {
    console.log(
      '[turnstile-config] local build, no env key — leaving embed placeholder in place.'
    );
  }
  const masked = siteKey.length > 8 ? siteKey.slice(0, 6) + '…' : siteKey;
  console.log('[turnstile-config] done (site key ' + masked + ').');
}

main();
