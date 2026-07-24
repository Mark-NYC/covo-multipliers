'use strict';

const { createClient } = require('@supabase/supabase-js');

// Public Supabase project details. The anon key below is already exposed in
// the browser (see shortlink-maker.html and s/index.html) and the current RLS
// policy grants the anon role SELECT and UPDATE on the shortlinks table, so it
// is a safe last-resort fallback when Vercel has no Supabase env vars set.
// A service-role key must NEVER be hardcoded here.
const PUBLIC_SUPABASE_URL = 'https://mryjrvinzbxebzvxtggi.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWpydmluemJ4ZWJ6dnh0Z2dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzQ3MzksImV4cCI6MjA5MTg1MDczOX0.U1JJQTBVKePsVFXr2oFRCdUZasWaZiTQg6g8QrFdRyw';

function resolveCredentials() {
  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_SUPABASE_URL;
  // Priority: service-role key, then anon env var, then the public anon key.
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    PUBLIC_SUPABASE_ANON_KEY;
  return { supabaseUrl, supabaseKey };
}

function getRawCode(req) {
  const raw = req.query && req.query.code;
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

module.exports = async function handler(req, res) {
  // Never let short-link responses be cached by browsers or CDNs.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const rawCode = getRawCode(req);

  // Sanitize: short codes may contain ASCII letters and digits only.
  if (
    !rawCode ||
    typeof rawCode !== 'string' ||
    !/^[A-Za-z0-9]{1,64}$/.test(rawCode)
  ) {
    return res.status(400).send('Invalid shortlink code.');
  }

  const code = rawCode;

  try {
    const { supabaseUrl, supabaseKey } = resolveCredentials();
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // 1. Exact match on short_code.
    const exact = await supabase
      .from('shortlinks')
      .select('short_code, long_url, click_count')
      .eq('short_code', code)
      .maybeSingle();

    if (exact.error) {
      console.error('[SHORTLINK] Exact lookup failed:', exact.error);
      return res.status(502).send('Temporarily unavailable. Please try again.');
    }

    let row = exact.data;

    // 2. Case-insensitive fallback for legacy mixed-case codes. The code is
    //    already sanitized to alphanumerics, so it carries no ilike wildcards.
    if (!row) {
      const fallback = await supabase
        .from('shortlinks')
        .select('short_code, long_url, click_count')
        .ilike('short_code', code)
        .limit(2);

      if (fallback.error) {
        console.error('[SHORTLINK] Fallback lookup failed:', fallback.error);
        return res
          .status(502)
          .send('Temporarily unavailable. Please try again.');
      }

      // Only redirect when the fallback resolves to exactly one row.
      if (Array.isArray(fallback.data) && fallback.data.length === 1) {
        row = fallback.data[0];
      }
    }

    // 3. Genuinely no matching link -> real 404.
    if (!row) {
      return res.status(404).send('Shortlink not found.');
    }

    // 4. Validate the stored destination is an http(s) URL.
    let destination;
    try {
      const parsed = new URL(row.long_url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported protocol');
      }
      destination = parsed.toString();
    } catch (urlErr) {
      console.error('[SHORTLINK] Invalid stored destination:', urlErr);
      return res.status(500).send('Server error.');
    }

    // 5. Record the click and wait for it to complete before returning.
    const update = await supabase
      .from('shortlinks')
      .update({
        click_count: (row.click_count || 0) + 1,
        last_clicked_at: new Date().toISOString(),
      })
      .eq('short_code', row.short_code);

    if (update.error) {
      // A failed analytics update should not break the redirect.
      console.error('[SHORTLINK] Click update failed:', update.error);
    }

    // 6. Server-side 302. The visitor's browser keeps showing the short URL
    //    until this redirect fires. Works for GET and HEAD without a body.
    res.setHeader('Location', destination);
    return res.status(302).end();
  } catch (err) {
    console.error('[SHORTLINK] Unexpected error:', err);
    return res.status(500).send('Server error.');
  }
};
