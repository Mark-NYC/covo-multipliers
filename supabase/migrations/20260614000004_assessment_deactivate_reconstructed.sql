-- =============================================================================
-- Mark reconstructed item bank as unapproved and non-active.
-- Create empty approved-items-pending draft version.
-- =============================================================================

-- 1. Deactivate the reconstructed version and rename it clearly.
UPDATE assessment_versions
SET
  is_active   = false,
  version_tag = 'unapproved_reconstructed',
  label       = 'UNAPPROVED — Reconstructed items (not approved for use)',
  config      = config || '{
    "unapproved": true,
    "reason": "Items were reconstructed from the construct framework because the exact approved pilot bank could not be recovered. These items must not be used for assessment or scoring.",
    "publicly_available": false
  }'::jsonb
WHERE version_tag = 'pilot-v1';

-- 2. Create the empty approved-items-pending draft version (not active).
INSERT INTO assessment_versions (id, version_tag, label, is_active, config)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'product-a-pilot-v1-pending',
  'Product A Pilot — Approved Items Pending',
  false,
  '{
    "status": "draft",
    "item_count": 0,
    "estimated_minutes": null,
    "validated": false,
    "publicly_available": false,
    "note": "Empty draft. Awaiting verbatim import of the approved 88-item pilot bank. Do not activate or score until the exact approved items have been imported and verified."
  }'
);

-- 3. Clone approved domains into the new draft version.
INSERT INTO assessment_domains (version_id, domain_key, label, short_label, sort_order)
SELECT
  '00000000-0000-0000-0000-000000000002',
  domain_key, label, short_label, sort_order
FROM assessment_domains
WHERE version_id = '00000000-0000-0000-0000-000000000001';

-- 4. Clone approved constructs into the new draft version.
INSERT INTO assessment_constructs (version_id, construct_key, domain_key, label, description)
SELECT
  '00000000-0000-0000-0000-000000000002',
  construct_key, domain_key, label, description
FROM assessment_constructs
WHERE version_id = '00000000-0000-0000-0000-000000000001';

-- 5. No items are seeded — they will be imported verbatim via the importer function.

-- 6. Verify no active version exists (should be zero rows after this migration).
DO $$
BEGIN
  IF (SELECT count(*) FROM assessment_versions WHERE is_active = true) > 0 THEN
    RAISE EXCEPTION 'Unexpected: an assessment version is still marked active. All versions must be inactive until the approved item bank has been imported and verified.';
  END IF;
END $$;
