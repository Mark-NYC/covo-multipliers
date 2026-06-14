/**
 * assessment/config.js
 *
 * Single source of truth for the assessment front-end configuration.
 * Update SUPABASE_FUNCTIONS_URL once and all pages pick it up.
 *
 * Do not embed service-role keys or scoring logic here.
 * This file is public — it may only contain the functions base URL.
 */

window.ASSESSMENT_CONFIG = {
  // Replace with your actual Supabase project URL before deployment.
  // Format: https://<project-ref>.supabase.co/functions/v1
  SUPABASE_FUNCTIONS: "https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1",
};
