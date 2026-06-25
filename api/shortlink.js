'use strict';

const { createClient } = require('@supabase/supabase-js');

const ALLOWED_ORIGINS = [
  'https://covomultipliers.com',
  'https://www.covomultipliers.com',
  'https://mark-nyc.github.io',
];

const BASE_DOMAIN = process.env.SHORTLINK_BASE_DOMAIN || 'https://covomultipliers.com';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

async function createShortlink(req, res) {
  const { long_url } = req.body || {};

  if (!long_url || typeof long_url !== 'string') {
    return res.status(400).json({ error: 'long_url is required and must be a string' });
  }

  // Basic URL validation
  try {
    new URL(long_url);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const supabase = getSupabaseClient();
    let short_code;
    let attempts = 0;
    const maxAttempts = 10;

    // Try to generate a unique short code
    while (attempts < maxAttempts) {
      short_code = generateShortCode();
      const { data: existing } = await supabase
        .from('shortlinks')
        .select('short_code')
        .eq('short_code', short_code)
        .single();

      if (!existing) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json({ error: 'Failed to generate unique short code' });
    }

    const { data, error } = await supabase
      .from('shortlinks')
      .insert({
        short_code,
        long_url,
        metadata: {
          user_agent: req.headers['user-agent'],
          created_ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to create shortlink' });
    }

    return res.status(201).json({
      short_code: data.short_code,
      short_url: `${BASE_DOMAIN}/s/${data.short_code}`,
      long_url: data.long_url,
      created_at: data.created_at,
    });
  } catch (err) {
    console.error('Error creating shortlink:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

async function redirectShortlink(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'short code is required' });
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch and increment click count in one operation
    const { data, error } = await supabase
      .from('shortlinks')
      .select('long_url, click_count')
      .eq('short_code', code)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Shortlink not found' });
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
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return createShortlink(req, res);
  }

  if (req.method === 'GET') {
    return redirectShortlink(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
