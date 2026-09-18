# Immersion Applications → Google Sheet Sync — Setup

One-way sync from Supabase immersion applications into a Google Sheet tab named
**Applications**. Read-only, token-protected, safe to re-run (matches rows by
Supabase application id, so no duplicates).

**Pieces**

- `supabase/functions/immersion-applications-sync/` — read-only Edge Function,
  protected by a dedicated `x-sync-token` header. Paginated (keyset by id).
- `google-apps-script/ImmersionSync.gs` — the script you paste into Apps Script.
- `google-apps-script/rowMerge.ts` + tests — the tested merge logic the script
  mirrors.

**Security model**

- The service-role key never leaves Supabase. It is only used server-side to
  read past RLS.
- The only credential in Apps Script that grants data access is `SYNC_TOKEN`
  (checked server-side). `SUPABASE_ANON_KEY` is the project's public
  publishable key — it is already in the website HTML and is not a secret.
- Applicant text that starts with `=`, `+`, `-`, or `@` is neutralized so it
  cannot become a spreadsheet formula. The script logs counts only — never
  applicant names, emails, or the token.

---

## 1. Create the sync token (Supabase secret)

Generate a long random token. On your machine:

```bash
openssl rand -base64 32
```

Copy the output. Then, in the **Supabase dashboard**:

1. Open the project (ref `mryjrvinzbxebzvxtggi`).
2. **Edge Functions → Secrets** (or **Project Settings → Edge Functions →
   Secrets**).
3. **Add new secret**:
   - Name: `IMMERSION_SYNC_TOKEN`
   - Value: the token you generated.
4. Save.

> The Edge Function fails closed: if `IMMERSION_SYNC_TOKEN` is not set, it
> returns HTTP 500 and serves no data.

The function deploys automatically when this branch merges to `main` (it is in
`.github/workflows/deploy-supabase-functions.yml`). To deploy manually instead:
`supabase functions deploy immersion-applications-sync --no-verify-jwt`.

**Function URL:**
`https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/immersion-applications-sync`

---

## 2. Get the two public values you'll need

- **Anon key** — Supabase dashboard → **Project Settings → API → Project API
  keys → `anon` `public`**. Copy it. (Public; already in the site HTML.)
- **Google Sheet ID** — create (or open) the target Google Sheet. The id is the
  long string in its URL:
  `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`.
  You do **not** need to create the "Applications" tab by hand — the script
  creates it on first run.

---

## 3. Create the Apps Script project

1. Go to <https://script.google.com> → **New project**.
2. Delete the empty `Code.gs` contents.
3. Copy the entire contents of `google-apps-script/ImmersionSync.gs` from this
   repo and paste it in. Save.
4. Rename the project (top left) to e.g. **Immersion Applications Sync**.

### Script properties

**Project Settings** (gear icon) → **Script properties** → **Add script
property**, four rows:

| Property | Value |
|---|---|
| `EDGE_FUNCTION_URL` | `https://mryjrvinzbxebzvxtggi.supabase.co/functions/v1/immersion-applications-sync` |
| `SUPABASE_ANON_KEY` | the `anon` `public` key from step 2 |
| `SYNC_TOKEN` | the same token you stored as `IMMERSION_SYNC_TOKEN` in step 1 |
| `SHEET_ID` | the Google Sheet id from step 2 |

Save.

---

## 4. First run + Google authorization

1. In the Apps Script editor, pick **`syncImmersionApplications`** in the
   function dropdown (top toolbar).
2. Click **Run**.
3. Google prompts for authorization the first time:
   - **Review permissions** → choose your Google account.
   - You'll see "Google hasn't verified this app" (normal for your own script)
     → **Advanced** → **Go to Immersion Applications Sync (unsafe)**.
   - **Allow** the requested access (Sheets + external requests).
4. Run **`syncImmersionApplications`** again if the first click only did the
   authorization.
5. Open the Google Sheet — the **Applications** tab now holds a header row plus
   one row per application, with empty **Notes**, **Follow-up Owner**, and
   **Follow-up Status** columns on the right for leaders to fill in.

### Verify the row count

- **In the sheet:** data rows = last row number − 1 (the header). Or select the
  `application_id` column and read the count in the bottom-right status bar.
- **In Apps Script:** **Executions** (left sidebar) → open the last run → the
  log line reads `fetched=… created=… updated=… preserved=… totalRows=…`.
  `totalRows` should equal the data rows in the sheet, and `fetched` should
  equal the number of applications in Supabase.
- **Cross-check against Supabase:** dashboard → **Table Editor →
  `immersion_applications`** → the row count there should match `fetched`.

### Test an updated application

1. In Supabase **Table Editor → `immersion_applications`**, pick one row and
   change a Supabase-owned field (e.g. set `status` from `submitted` to
   `approved`). Save.
2. In that row in the Google Sheet, type something into **Notes** (e.g.
   `left voicemail`).
3. Back in Apps Script, run **`syncImmersionApplications`** again.
4. In the sheet, confirm on that same row: **`status` now shows `approved`**
   (Supabase-owned column refreshed) **and Notes still says `left voicemail`**
   (leader-owned column preserved). The total row count is unchanged — no
   duplicate row was created.

---

## 5. Install the hourly trigger

1. In the function dropdown, pick **`createHourlyTrigger`**.
2. Click **Run**. (Approve any additional trigger permission if asked.)
3. Confirm under **Triggers** (clock icon, left sidebar): one time-driven
   trigger for `syncImmersionApplications`, running **every hour**.

`createHourlyTrigger` removes any existing sync trigger first, so running it
again never stacks duplicates. To stop the schedule, delete the trigger from
that **Triggers** page.

---

## Troubleshooting

- **HTTP 401** in the execution log → `SYNC_TOKEN` (Apps Script) and
  `IMMERSION_SYNC_TOKEN` (Supabase) don't match, or the header is missing.
- **HTTP 500** → `IMMERSION_SYNC_TOKEN` is not set in Supabase, or a read error
  (check the function logs in the Supabase dashboard).
- **HTTP 401 from the gateway with an auth message** → `SUPABASE_ANON_KEY` is
  wrong or missing.
- **Missing Script Property** error → one of the four properties in step 3 is
  absent or misspelled.
- **Rotating the token:** update the value in both places (Supabase secret and
  the Apps Script `SYNC_TOKEN` property). No code change needed.
