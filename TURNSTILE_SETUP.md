# Lab Registration Bot Protection — Deployment Guide

This guide covers turning on the new protection for the CoVo lab registration
flow (Cloudflare Turnstile + honeypot + validation + rate limiting). It is
written for the **Cloudflare, Supabase, and Vercel dashboards** — no terminal
required.

## What changed (summary)

- **Turnstile** was added to every public lab registration form and is verified
  **server-side** inside the `register` Edge Function.
- A **honeypot** field, **conservative name/email validation**, **layered
  database-backed rate limiting**, and **origin checks** were added.
- Rejected spam is stopped **before** any registration row is created, so it
  never sends a confirmation or admin email and never increases signup totals.
- A new `registration_security_events` table stores a **privacy-safe** audit
  trail (salted hashes only — never raw IPs, emails, or Turnstile tokens).

> **Important rollout note:** Turnstile enforcement turns on **only when the
> server secret is set.** Until then, the site keeps working (protected by the
> honeypot, validation, and rate limiting). The client **site key** and the
> server **secret key** must be switched to real values **together** — a real
> secret rejects tokens produced by the test site key.

---

## 1. Create the Cloudflare Turnstile widget

1. Go to **https://dash.cloudflare.com** → **Turnstile** (left sidebar).
2. Click **Add widget**.
3. **Widget name:** `CoVo Lab Registration`.
4. **Hostnames — add all of these:**
   - `covomultipliers.com`
   - `www.covomultipliers.com`
   - `multiplyingdisciples.us` *(only if that site embeds the registration
     widget — see note below)*
   - `www.multiplyingdisciples.us` *(same condition)*
   - `multiplying-disciples.vercel.app` *(pre-launch preview, optional)*
   - `localhost` *(for local testing)*
5. **Widget Mode:** **Managed** (recommended — low friction, usually no click).
6. Click **Create**.
7. Cloudflare shows two values:
   - **Site Key** — public, goes in the browser code.
   - **Secret Key** — private, goes on the server. **Never** put this in
     browser code or commit it.

> **multiplyingdisciples.us:** The repo ships a shareable embed widget
> (`embeds/lab-registration-widget.js`) intended for that site. If
> multiplyingdisciples.us only *links* to CoVo lab pages (rather than embedding
> that widget), you do **not** need its hostnames here, and they can also be
> removed from `ALLOWED_ORIGINS` in `handler.ts`. Confirm which one is true
> before go-live.

---

## 2. Put the Site Key in the frontend

The public site key lives in **one** place: `covo-turnstile.js` (and, if you use
the cross-origin embed, `embeds/lab-registration-widget.js`).

1. Open `covo-turnstile.js`.
2. Replace the committed test key on this line:
   ```js
   var SITE_KEY = global.COVO_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
   ```
   with your real site key, e.g.:
   ```js
   var SITE_KEY = global.COVO_TURNSTILE_SITE_KEY || '0x4AAAAAAA...yourkey';
   ```
3. If you use the embed on another site, do the same in
   `embeds/lab-registration-widget.js`:
   ```js
   var TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
   ```

This is committed to the repo and deployed by Vercel (see step 5). The site key
is **public** — it is safe to commit and ship in browser code.

---

## 3. Add the Secret Key to the Supabase Edge Function

1. Go to **https://supabase.com/dashboard** → your project
   (`mryjrvinzbxebzvxtggi`).
2. **Project Settings** → **Edge Functions** → **Secrets** (or
   **Edge Functions → Manage secrets**).
3. Add these secrets:

   | Name | Value | Notes |
   |---|---|---|
   | `TURNSTILE_SECRET_KEY` | *your Turnstile secret key* | **Enables enforcement.** Required in production. |
   | `IP_HASH_SALT` | *any long random string* | Salts the IP/email hashes in the audit log. Pick once and keep it. |

   Do **not** set `TURNSTILE_DEV_BYPASS` in production.

4. Save.

The following secrets should already exist from the current setup (leave them
as-is): `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and optionally
`ADMIN_NOTIFY_EMAILS`.

---

## 4. Run the database migration

A new table `registration_security_events` must exist.

- **Option A — Supabase SQL Editor (dashboard):**
  1. Supabase Dashboard → **SQL Editor** → **New query**.
  2. Paste the contents of
     `supabase/migrations/20260721000000_registration_security_events.sql`.
  3. Click **Run**. It is idempotent and safe to re-run.

- **Option B — CLI (if you use it):** `supabase db push`.

---

## 5. Deploy

- **Edge Function (must be redeployed):** The `register` function changed.
  - It auto-deploys via the **Deploy Supabase Edge Functions** GitHub Action
    when changes under `supabase/functions/**` land on `main`.
  - Or deploy manually: Supabase Dashboard → **Edge Functions** → `register` →
    **Deploy** (or `supabase functions deploy register --no-verify-jwt`).
- **Frontend (must be redeployed):** The lab HTML pages and
  `covo-turnstile.js` changed.
  - Vercel auto-deploys on push to the production branch. Or Vercel Dashboard →
    project → **Deployments** → **Redeploy**.

**Recommended order to avoid any gap:**
1. Run the migration (step 4).
2. Deploy the Edge Function **without** `TURNSTILE_SECRET_KEY` yet — honeypot +
   validation + rate limiting go live; the site keeps working.
3. Deploy the frontend with the real **site key**.
4. Add `TURNSTILE_SECRET_KEY` (and `IP_HASH_SALT`) in Supabase and redeploy the
   `register` function. Turnstile enforcement is now on.

---

## 6. Test production safely

1. **Real user path:** Open a lab page (e.g. `/4-questions.html`) in a normal
   browser. You should see the Turnstile widget (often just a brief spinner).
   Register with a real email — you should get the confirmation email, and the
   admin notification should arrive if configured.
2. **Missing-token path:** Using a tool like the browser console or `curl`, POST
   to the `register` function **without** a `turnstile_token`. With the secret
   set, you should get HTTP 400 and
   *"We couldn't verify your submission. Please try again."*, and **no** row is
   created.
3. **Honeypot path:** Submit with `company_website` set to any value. You should
   get a normal-looking success response, but **no** registration and **no**
   email.
4. **Audit:** In Supabase → **Table Editor** → `registration_security_events`,
   confirm rows appear with outcomes like `turnstile_failed`, `honeypot_filled`,
   `accepted`. No raw IPs or emails should be present — only hashes.

---

## 7. Roll back

- **Turn Turnstile off (fastest):** In Supabase → Edge Functions → Secrets,
  **delete `TURNSTILE_SECRET_KEY`** and redeploy the `register` function.
  Enforcement stops immediately; the honeypot, validation, and rate limiting
  remain active and registrations keep working.
- **Full revert:** Redeploy the previous `register` function version (Supabase
  keeps prior deployments) and revert the frontend commit in Vercel
  (Deployments → previous deployment → **Promote to Production**). The
  `registration_security_events` table can be left in place harmlessly, or
  dropped if desired.

---

## Environment variables reference

| Where | Name | Purpose | Required |
|---|---|---|---|
| Frontend (`covo-turnstile.js`) | `SITE_KEY` constant | Public Turnstile site key | Yes (for enforcement) |
| Supabase Edge Function secret | `TURNSTILE_SECRET_KEY` | Server-side Turnstile verification; enables enforcement | Yes (production) |
| Supabase Edge Function secret | `IP_HASH_SALT` | Salts IP/email hashes in the audit log | Recommended |
| Supabase Edge Function secret | `TURNSTILE_DEV_BYPASS` | `"true"` to skip Turnstile locally without a secret | Dev only — never in prod |
| Supabase Edge Function secret | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `ADMIN_NOTIFY_EMAILS` | Existing email config (unchanged) | As before |

## Running the automated tests (optional, needs Deno)

```
deno test supabase/functions/_shared/spamProtection.test.ts
deno test supabase/functions/register/handler.test.ts
```

The tests use Cloudflare's documented behavior via mocked verification, so they
run offline and never call the live Turnstile API.
