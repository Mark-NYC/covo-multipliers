# Disciple Maker Next Step V2 — Release Safety

Proves the rollout is safe by contract, and gives the exact sequence + rollback.

## TL;DR

The V2 backend is shipped as **new, versioned endpoints** — nothing that V1 uses is
changed. Launch is **purely additive**, so there is no window where a live V1 page talks
to a V2 function (or vice-versa). Cutover is the single atomic act of merging the frontend.

| Concern | Verdict |
| --- | --- |
| V1 endpoints (`disciple-maker-submit`, `-results`, `-cfc-followup`, `-cfc-diagnostic`) | **Unchanged** — restored to `main`. Regression-guarded by tests. |
| V2 logic | Lives in `disciple-maker-v2-{submit,results,event,followup}` — brand-new names. |
| Migration | Additive (`ADD COLUMN … IF NOT EXISTS`, new table). Harmless to live V1. |
| Frontend | V2 pages call only `-v2-*` endpoints (test-enforced). |
| Legacy result links | v2-results returns `legacy:true`; page shows a graceful "we've made this simpler" invite — no mislabeling. |
| Day-1 email | Cron repointed to `-v2-followup`, which **skips legacy rows**. Old endpoint dormant (rollback only). |

## Why the naïve rollout was unsafe (what this replaces)

The original PR edited the production functions in place and deleted one. Three real
failures, all avoided by versioning:

1. **Submit contract break.** V1 frontend posts `{responses}`; the new submit reads
   `{answers}` → `typeof answers !== "object"` → **HTTP 400**. Any moment the live V1 page
   hit the new function, submissions failed.
2. **Migration race.** `deploy-supabase-functions.yml` auto-deploys on push to `main`, but
   **nothing auto-runs the migration.** New submit/results `SELECT`/`UPDATE` the new
   columns → on merge they'd deploy against a schema without those columns → **500 for
   every completion and every results link, including legacy.**
3. **Deploy job breakage.** The workflow's hardcoded list still ran
   `supabase functions deploy disciple-maker-cfc-diagnostic`, which the PR **deleted** →
   the deploy step errors → partial/aborted deploy. And the new `-event` function was never
   in the list → never deployed → silent telemetry loss.

Versioning removes all three: V1 stays intact, V2 endpoints are new, and the migration is
applied **before** anything reads it.

## Contract comparison (V1 live vs V2 new)

### submit
| | V1 `disciple-maker-submit` (live, unchanged) | V2 `disciple-maker-v2-submit` (new) |
| --- | --- | --- |
| Request | `{session_id, session_token, responses:{qid:score}}` | `{session_id, session_token, answers:{qid:string}, recognition_outcome, note?}` |
| Response | `{results_token}` | `{results_token, recognition_outcome}` |
| Writes | `dimension_scores, pathway, …` | `diagnostic_answers, recognition_outcome, barrier_summary, seven_day_step, note` |
| Needs migration | no | **yes** |

### results
| | V1 `disciple-maker-results` | V2 `disciple-maker-v2-results` |
| --- | --- | --- |
| Response | `{first_name, dimension_scores, pathway, strongest/lowest, bottleneck}` | `{first_name, recognition_outcome, barrier_summary, seven_day_step, note}` **or** `{first_name, legacy:true}` |
| Legacy row (no outcome) | returns pathway `"explorer"` fallback | returns `legacy:true` → page invites a fresh run |

### followup
| | V1 `disciple-maker-cfc-followup` | V2 `disciple-maker-v2-followup` |
| --- | --- | --- |
| Selects | all completed 24–26h ago | same **AND `recognition_outcome IS NOT NULL`** (V2 rows only) |
| Email | CFC identity, links `cfc-profile.html` | "did you take your step?" nudge, links `/#labs` |
| Trigger | (was) the daily cron | the daily cron (repointed) |

### event
New. No V1 equivalent. Best-effort beacon (`keepalive`), always 200, failures swallowed
client-side. Frontend never blocks on it.

## What happens in each scenario

- **V2 functions deploy while V1 frontend still live** → nothing. V1 pages call V1
  endpoints (untouched). The `-v2-*` endpoints simply sit unused.
- **V2 frontend deploys while V1 functions still live** → cannot happen in isolation: the
  V2 frontend only calls `-v2-*` endpoints, which we deploy **before** merge. (If someone
  merged without pre-deploying, V2 pages would get 404 on submit and show the error state —
  no data corruption. The sequence below prevents this.)
- **Migration runs first** → correct and required. Additive columns/table; V1 keeps working
  (it selects fixed columns; extra columns are ignored).
- **User starts V1 before deploy, finishes after** → V1 progress lived only in
  `sessionStorage` (`dm_responses`/`dm_current_index`); the V1 page persists nothing to the
  DB until submit. After cutover they load the V2 page, which reads `dm_answers` (absent) and
  starts the (shorter) V2 flow fresh against the same valid session row. No crash, no orphan.
- **Legacy results link opened after launch** → served by the V2 page → `v2-results` sees no
  `recognition_outcome` → returns `legacy:true` → friendly "we've made this simpler, take the
  3-minute finder" screen. Their original data is untouched in the DB.
- **Old day-1 email fires for a legacy user** → the cron now calls `-v2-followup`, which
  filters `recognition_outcome IS NOT NULL`, so legacy rows are skipped (they already got
  their original day-1 email pre-launch). The old endpoint is never triggered.

## Contract tests

`node disciple-maker/v2_contract.test.js` (29 checks, no DB): outcome-map completeness,
routing candidates (all six personas + empty), **client↔server routing parity**, q7
branching, versioned-endpoint enforcement, request/response shapes, **legacy + expired**
handling, **V1 regression guards**, followup legacy-skip, cron target, and deploy-list
coverage. Wire into CI or run pre-deploy.

Manual prod smoke (after step 3 below), using a throwaway email:
```
# expired/garbage token → 404 JSON
curl -s "$SUPABASE_URL/functions/v1/disciple-maker-v2-results?token=deadbeef" | jq
# legacy link (an old V1 results token) → {"first_name":...,"legacy":true}
```

## Safest rollout sequence

> Frontend (Vercel) and functions (GitHub Actions) both deploy from `main`. Decouple by
> pre-deploying the additive backend, verify, then merge to cut the frontend over.

1. **Apply the migration to prod first** (additive, safe while V1 is live):
   `supabase db push` (applies `20260806000000_disciple_maker_v2_recognition.sql`).
2. **Deploy the four new functions** without merging the frontend — run the
   **Deploy Supabase Edge Functions** workflow via `workflow_dispatch` (its list now
   includes the `-v2-*` functions and still includes every V1 function). This touches no V1
   behavior.
3. **Verify on prod** with the smoke curls above + one full end-to-end run on the **Vercel
   Preview** for this PR (uses a throwaway email — see below).
4. **Merge the PR.** Vercel publishes the V2 frontend, which calls the already-live `-v2-*`
   endpoints. This is the atomic cutover.
5. **Confirm** the daily nudge cron shows green on its next run (or `workflow_dispatch` it
   once with a test row).
6. **(Later, separate PR) cleanup:** after a bake period, delete V1 `-submit`/`-results`/
   `-cfc-followup`/`-cfc-diagnostic`, `cfc-profile.html`, and remove them from the deploy
   list. Not part of launch.

## Rollback

- **Instant:** revert the merge commit. Vercel republishes the V1 frontend, which calls the
  still-present, unchanged V1 endpoints. Full restore in one deploy. The `-v2-*` functions,
  new columns, and events table remain — all inert and harmless.
- **If a single V2 function misbehaves** but the frontend is fine: re-deploy that one
  function from the last-good commit (`supabase functions deploy disciple-maker-v2-…`).
- **To pause day-1 nudges:** disable the **Send … Day-1 Nudge** workflow (no code change).
- **Data:** the migration is additive; there is nothing to roll back schema-wise. If ever
  desired, the added columns/table can be dropped later with zero impact on V1.

## Vercel Preview: full end-to-end without touching live users — yes

`config.js` points at the **production** Supabase project, so the Preview deploy exercises
the real `-v2-*` endpoints and writes real rows. It is fully testable end-to-end **once
steps 1–2 are done**, and it does **not** affect live users because:

- Live users are on the production V1 frontend, which calls only V1 endpoints. The Preview
  calls only `-v2-*` endpoints. The two paths never intersect.
- Preview runs create their own new session rows (use a throwaway email like
  `qa+dmv2@…`), so they don't alter anyone's data.

The only side effect is a handful of QA rows in `disciple_maker_sessions`/`_events` (filter
by the test email; delete if desired). If you prefer zero prod writes, point a Preview-only
`config.js` at a staging Supabase project instead.
