-- Create substack_posts table to store post metadata
CREATE TABLE substack_posts (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  post_url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_substack_posts_published_at ON substack_posts(published_at DESC);
CREATE INDEX idx_substack_posts_publication_id ON substack_posts(publication_id);

-- Create substack_metrics table to store daily/periodic metrics snapshots
CREATE TABLE substack_metrics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  post_id TEXT NOT NULL REFERENCES substack_posts(id) ON DELETE CASCADE,
  metric_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  likes INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  subscriber_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_substack_metrics_post_id ON substack_metrics(post_id);
CREATE INDEX idx_substack_metrics_date ON substack_metrics(metric_date DESC);

-- Enable RLS
ALTER TABLE substack_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE substack_metrics ENABLE ROW LEVEL SECURITY;

-- Allow service role (Edge Functions) to read/write, but keep data private
CREATE POLICY "service_role_full_access" ON substack_posts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access" ON substack_metrics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant permissions to service_role
GRANT SELECT, INSERT, UPDATE ON substack_posts TO service_role;
GRANT SELECT, INSERT, UPDATE ON substack_metrics TO service_role;
