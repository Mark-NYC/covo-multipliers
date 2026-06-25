'use strict';

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Short code is required');
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials');
      return res.status(500).send('Server error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the shortlink
    const { data, error } = await supabase
      .from('shortlinks')
      .select('long_url, click_count')
      .eq('short_code', code)
      .single();

    if (error || !data) {
      console.error('Shortlink not found:', code, error);
      return res.status(404).send('Shortlink not found');
    }

    // Update click count asynchronously (don't wait for it)
    supabase
      .from('shortlinks')
      .update({
        click_count: (data.click_count || 0) + 1,
        last_clicked_at: new Date().toISOString(),
      })
      .eq('short_code', code)
      .then()
      .catch((err) => console.error('Failed to update click count:', err));

    // Redirect to the long URL
    return res.redirect(302, data.long_url);
  } catch (err) {
    console.error('Error redirecting shortlink:', err);
    return res.status(500).send('Server error');
  }
};
