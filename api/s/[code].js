'use strict';

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  console.log('[SHORTLINK] Request received for:', req.url);
  console.log('[SHORTLINK] Query params:', req.query);

  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    console.log('[SHORTLINK] No code provided');
    return res.status(400).send('Short code is required');
  }

  console.log('[SHORTLINK] Looking up code:', code);

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('[SHORTLINK] Supabase URL available?', !!supabaseUrl);
    console.log('[SHORTLINK] Service key available?', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[SHORTLINK] Missing Supabase credentials');
      return res.status(500).send('Server error: Missing credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the shortlink
    console.log('[SHORTLINK] Querying database for code:', code);
    const { data, error } = await supabase
      .from('shortlinks')
      .select('long_url, click_count')
      .eq('short_code', code)
      .single();

    console.log('[SHORTLINK] Query result:', { data, error });

    if (error || !data) {
      console.error('[SHORTLINK] Shortlink not found:', code, error);
      return res.status(404).send('Shortlink not found: ' + code);
    }

    console.log('[SHORTLINK] Found URL:', data.long_url);

    // Update click count asynchronously (don't wait for it)
    supabase
      .from('shortlinks')
      .update({
        click_count: (data.click_count || 0) + 1,
        last_clicked_at: new Date().toISOString(),
      })
      .eq('short_code', code)
      .then(() => console.log('[SHORTLINK] Click count updated'))
      .catch((err) => console.error('[SHORTLINK] Failed to update click count:', err));

    // Redirect to the long URL
    console.log('[SHORTLINK] Redirecting to:', data.long_url);
    return res.redirect(302, data.long_url);
  } catch (err) {
    console.error('[SHORTLINK] Error:', err);
    return res.status(500).send('Server error: ' + err.message);
  }
};
