-- Add metadata column to assessment_items for secondary tags and future per-item fields.
ALTER TABLE assessment_items
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN assessment_items.metadata IS
  'Stores optional per-item fields not in the core schema: secondary_tag, notes, etc.';
