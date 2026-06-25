-- Create shortlinks table
CREATE TABLE shortlinks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  short_code TEXT UNIQUE NOT NULL,
  long_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  click_count INTEGER DEFAULT 0,
  last_clicked_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Create index for faster lookups
CREATE INDEX idx_shortlinks_short_code ON shortlinks(short_code);
CREATE INDEX idx_shortlinks_created_at ON shortlinks(created_at DESC);

-- Enable RLS
ALTER TABLE shortlinks ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read shortlinks (for redirects)
CREATE POLICY "public_read" ON shortlinks
  FOR SELECT USING (true);

-- Allow anyone to create shortlinks
CREATE POLICY "public_create" ON shortlinks
  FOR INSERT WITH CHECK (true);

-- Allow updating click_count
CREATE POLICY "public_update_clicks" ON shortlinks
  FOR UPDATE USING (true)
  WITH CHECK (true);
