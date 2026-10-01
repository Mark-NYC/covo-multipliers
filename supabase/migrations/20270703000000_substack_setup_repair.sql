-- Run this file in the Covo Supabase SQL Editor. Safe to run again.
-- Add missing setup without dropping tables or stored metrics.
BEGIN;
CREATE TABLE IF NOT EXISTS public.substack_posts (
  id text PRIMARY KEY, publication_id text NOT NULL, title text NOT NULL,
  subtitle text, post_url text NOT NULL UNIQUE, published_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.substack_posts ADD COLUMN IF NOT EXISTS post_type text;
ALTER TABLE public.substack_posts ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE public.substack_posts ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.substack_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE TABLE IF NOT EXISTS public.substack_metrics (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  post_id text NOT NULL REFERENCES public.substack_posts(id) ON DELETE CASCADE,
  metric_date timestamptz DEFAULT now(), metric_day date,
  likes integer, comments integer, restacks integer,
  created_at timestamptz DEFAULT now(), metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.substack_metrics ADD COLUMN IF NOT EXISTS metric_day date;
ALTER TABLE public.substack_metrics ADD COLUMN IF NOT EXISTS restacks integer;
-- Unknown is NULL, never invented zero. Preserve previously stored values.
ALTER TABLE public.substack_metrics ALTER COLUMN likes DROP DEFAULT;
ALTER TABLE public.substack_metrics ALTER COLUMN comments DROP DEFAULT;
ALTER TABLE public.substack_metrics ALTER COLUMN restacks DROP DEFAULT;
UPDATE public.substack_metrics
SET metric_day = (metric_date AT TIME ZONE 'UTC')::date WHERE metric_day IS NULL;
-- Stop and preserve everything if older setup contains duplicate daily rows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.substack_metrics WHERE metric_day IS NOT NULL
    GROUP BY post_id, metric_day HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate daily snapshots exist. Setup stopped without deleting history; reconcile duplicate rows before rerunning.';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS substack_metrics_daily_upsert ON public.substack_metrics(post_id, metric_day);
CREATE INDEX IF NOT EXISTS idx_substack_posts_publication_id ON public.substack_posts(publication_id);
CREATE INDEX IF NOT EXISTS idx_substack_posts_published_at ON public.substack_posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_substack_metrics_post_id ON public.substack_metrics(post_id);
ALTER TABLE public.substack_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substack_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.substack_posts, public.substack_metrics FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.substack_posts, public.substack_metrics TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'Substack database ready. Test the Edge Function health action next.' AS status;
