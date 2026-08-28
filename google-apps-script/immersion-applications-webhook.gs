/**
 * Covo Immersion Applications — Google Apps Script Webhook
 * =========================================================
 * Receives a JSON POST from the Supabase Edge Function and appends one row
 * to the "Applications" sheet in this Google Spreadsheet.
 *
 *
 * ── DEPLOYMENT INSTRUCTIONS ──────────────────────────────────────────────
 *
 *  1. Open the "Covo Immersion Applications" Google Sheet.
 *  2. Click Extensions > Apps Script.
 *  3. Delete any placeholder code and paste this entire file.
 *  4. Set WEBHOOK_SECRET (below) to a long random string, e.g.:
 *       openssl rand -hex 32
 *     Store the same value in your Supabase Edge Function as an environment
 *     secret (e.g. APPS_SCRIPT_SECRET) so the two sides stay in sync.
 *  5. Click the floppy-disk icon to Save (Ctrl/Cmd + S).
 *  6. Click Deploy > New deployment.
 *  7. Click the gear icon next to "Select type" and choose Web app.
 *  8. Set the fields:
 *       Description  :  Covo Immersion Applications Webhook   (any label)
 *       Execute as   :  Me            ← lets the script write to the sheet
 *       Who has access: Anyone        ← lets Supabase POST without OAuth
 *  9. Click Deploy and authorize the requested permissions.
 * 10. Copy the Web App URL — paste it into your Edge Function config as the
 *     destination for application webhooks.
 *
 *
 * ── RE-DEPLOYING AFTER EDITS ─────────────────────────────────────────────
 *
 *  After any code change you must publish a new version:
 *  Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *  The Web App URL stays the same across versions.
 *
 *
 * ── LOCAL TESTING ────────────────────────────────────────────────────────
 *
 *  Select the testDoPost function from the function dropdown in the editor
 *  and click Run. Check the Execution log and your sheet to confirm a row
 *  was written correctly.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */


// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Shared secret your Supabase Edge Function sends in the JSON body as "secret".
 * Replace this with a long random string before deploying.
 */
var WEBHOOK_SECRET = 'REPLACE_WITH_YOUR_SECRET';

/** Name of the sheet tab that receives application rows. */
var SHEET_NAME = 'Applications';

/**
 * Column headers written on the first row when the sheet is first created.
 * Order here matches the order of values in buildRow() — keep them in sync.
 */
var HEADERS = [
  'Submitted At',
  'Immersion Title',
  'Immersion City',
  'Immersion Dates',
  'Application Status',
  'Name',
  'Email',
  'Phone',
  'City/State',
  'Church/Org',
  'Team Status',
  'Team Size',
  'Why Coming',
  'Hoping To Learn',
  'Prior Training',
  'Lodging Acknowledged',
  'Supabase Application ID',
  'Supabase Immersion ID',
];


// ── Entry point ───────────────────────────────────────────────────────────

/**
 * Handles POST requests from the Supabase Edge Function.
 *
 * Expected JSON body fields:
 *   secret            {string}  - shared secret for request validation
 *   submitted_at      {string}  - ISO 8601 timestamp
 *   immersion_title   {string}
 *   immersion_city    {string}
 *   immersion_dates   {string}  - human-readable date range
 *   application_status{string}  - e.g. "pending", "approved"
 *   name              {string}
 *   email             {string}
 *   phone             {string}
 *   city_state        {string}
 *   church_org        {string}
 *   team_status       {string}  - "individual" | "team" | "unsure"
 *   team_size         {number}
 *   why_coming        {string}
 *   hoping_to_learn   {string}
 *   prior_training    {string}
 *   lodging_acknowledged {boolean}
 *   application_id    {string}  - Supabase row ID for the application
 *   immersion_id      {string}  - Supabase row ID for the immersion
 */
function doPost(e) {
  try {
    // ── 1. Parse request body ────────────────────────────────────────────
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Invalid JSON body' });
    }

    // ── 2. Validate shared secret ────────────────────────────────────────
    if (!body.secret || body.secret !== WEBHOOK_SECRET) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }

    // ── 3. Get or create the Applications sheet ──────────────────────────
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // ── 4. Write headers if the sheet is empty ───────────────────────────
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);

      // Style the header row to match the Covo brand palette
      var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange
        .setFontWeight('bold')
        .setBackground('#1b4d3e')
        .setFontColor('#ffffff')
        .setHorizontalAlignment('left');

      sheet.setFrozenRows(1);

      // Auto-resize columns for readability
      sheet.autoResizeColumns(1, HEADERS.length);
    }

    // ── 5. Append the application row ────────────────────────────────────
    sheet.appendRow(buildRow(body));

    // ── 6. Return success ─────────────────────────────────────────────────
    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message || 'Internal error' });
  }
}


// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Builds the array of cell values for one application row.
 * Column order must match HEADERS exactly.
 *
 * @param {Object} body - parsed JSON request body
 * @returns {Array}
 */
function buildRow(body) {
  return [
    body.submitted_at       || new Date().toISOString(), // Submitted At
    body.immersion_title    || '',                        // Immersion Title
    body.immersion_city     || '',                        // Immersion City
    body.immersion_dates    || '',                        // Immersion Dates
    body.application_status || 'pending',                 // Application Status
    body.name               || '',                        // Name
    body.email              || '',                        // Email
    body.phone              || '',                        // Phone
    body.city_state         || '',                        // City/State
    body.church_org         || '',                        // Church/Org
    body.team_status        || '',                        // Team Status
    body.team_size          != null ? body.team_size : '', // Team Size
    body.why_coming         || '',                        // Why Coming
    body.hoping_to_learn    || '',                        // Hoping To Learn
    body.prior_training     || '',                        // Prior Training
    body.lodging_acknowledged ? 'Yes' : 'No',            // Lodging Acknowledged
    body.application_id     || '',                        // Supabase Application ID
    body.immersion_id       || '',                        // Supabase Immersion ID
  ];
}

/**
 * Returns a JSON ContentService response.
 * Note: Apps Script Web Apps always send HTTP 200 regardless of content.
 * The success/error fields in the body are the authoritative signal.
 *
 * @param {Object} data
 * @returns {TextOutput}
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Local test ────────────────────────────────────────────────────────────

/**
 * Run this function from the Apps Script editor to test the webhook locally
 * without a real HTTP request. Check the Execution log and the sheet to
 * verify a row was written correctly.
 *
 * Select "testDoPost" from the function dropdown, then click Run.
 */
function testDoPost() {
  var mockEvent = {
    postData: {
      contents: JSON.stringify({
        secret: WEBHOOK_SECRET,
        submitted_at: new Date().toISOString(),
        immersion_title: 'NYC Immersion — Summer 2026',
        immersion_city: 'New York City',
        immersion_dates: 'Jul 10–12, 2026',
        application_status: 'pending',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+1 (555) 000-0000',
        city_state: 'Brooklyn, NY',
        church_org: 'Redemption Church',
        team_status: 'team',
        team_size: 3,
        why_coming: 'I want to see disciple-making in real everyday settings.',
        hoping_to_learn: 'How to bring this back to my own church context.',
        prior_training: 'Covo 101, H3X training',
        lodging_acknowledged: true,
        application_id: 'test-app-id-001',
        immersion_id: 'test-immersion-id-001',
      }),
    },
  };

  var result = doPost(mockEvent);
  Logger.log('Response: ' + result.getContent());
}
