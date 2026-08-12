# Deployment - 0wave Studio

0wave Studio is a Next.js app with local-first persistence. Supabase is
optional: with no credentials it runs fully offline in `PUBLIC_LOCAL` mode
(IndexedDB). This document covers Vercel deployment, Supabase setup, the
three access modes, and what must be true before a public launch.

## 1. Access modes

One env var selects the persistence backend:

| Mode | Behavior | Supabase needed | Middleware gate |
|---|---|---|---|
| `PUBLIC_LOCAL` (default) | IndexedDB only; no backend, no accounts | no | none |
| `ANONYMOUS_CLOUD` | Supabase with anonymous sessions; user can also sign in with an email magic link later | yes | none |
| `ACCOUNT_REQUIRED` | Supabase with email magic-link sign-in; `/studio` and `/playground` redirect to `/login` until a session exists | yes | `/studio`, `/playground` |

The mode is read from `NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE`; any value outside
the three above falls back to `PUBLIC_LOCAL`.

### Local fallback behavior

If the mode is `ANONYMOUS_CLOUD` or `ACCOUNT_REQUIRED` but
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing or
empty, the app degrades to `PUBLIC_LOCAL` everywhere:

- the repository factory returns the IndexedDB repository
  (`src/lib/persistence/repository.ts`), so saving keeps working;
- the proxy gate is disabled, so local development is never bricked;
- `/login` shows an explicit config-missing state instead of a dead form.

The app never throws for a missing backend. Cloud saves fail with clear
errors only when a cloud mode is active and a session is absent or the
Supabase project is unreachable.

## 2. Environment variables

| Variable | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_ZEROWAVE_ACCESS_MODE` | all (optional) | `PUBLIC_LOCAL` \| `ANONYMOUS_CLOUD` \| `ACCOUNT_REQUIRED` |
| `NEXT_PUBLIC_SUPABASE_URL` | cloud modes | Project Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cloud modes | Project Settings -> API -> anon public key |

Rules:

- Only the **anon** key is used client-side. The `service_role` key must
  never appear in any `NEXT_PUBLIC_*` variable, the client bundle, or the
  repo. See `supabase/migrations/0001_init.sql` grants: the anon role has no
  table access, RLS restricts everything to the authenticated user.
- Vercel env vars must be set with the exact names above (no leading
  `NEXT_PUBLIC_` stripping: the prefix is required for client exposure).

## 3. Supabase project setup

1. Create a project at supabase.com. Note the Project URL and anon key.
2. Open **SQL Editor** and run `supabase/migrations/0001_init.sql`. It is
   idempotent: creates `profiles`, `projects`, `sounds`, `audio_assets`,
   the `updated_at` trigger function, indexes, RLS policies and grants.
3. Create the private storage bucket:
   `supabase/storage.md` section 1 (SQL) or Storage -> New bucket,
   name `audio-assets`, public = **off**.
4. Run the storage RLS policies: `supabase/storage.md` section 3 (SQL).
5. Auth settings (dashboard -> Authentication):
   - **Email**: enable "Email" provider so magic links work.
   - **Anonymous sign-ins**: enable only if you run `ANONYMOUS_CLOUD`.
   - **Redirect URLs**: add the deployed origin plus `http://localhost:3000`
     (magic links land on `/studio` via `emailRedirectTo`).

### RLS verification (before you trust it)

With the policies applied, open the SQL editor and confirm that the anon
role sees nothing and each user sees only their own rows:

```sql
-- Should return 0 rows (anon has no table grants, RLS denies everything):
set role anon;
select * from public.projects;
reset role;

-- Should return only the signed-in user's rows; insert/update/delete on a
-- row owned by another user must fail:
select auth.uid(), count(*) from public.projects group by 1;
```

Also verify storage: from a signed-in browser session, listing
`audio-assets` must only show the current user's folder, and downloading
another user's object path must 404.

## 4. Vercel deployment

1. Push the repository to GitHub/GitLab and import it in Vercel.
2. Framework preset: Next.js (auto-detected). Build command `pnpm build`,
   output directory default. Root directory: repository root.
3. Add the environment variables from section 2 (Production, Preview, and
   Development environments as appropriate).
4. Deploy. The first build succeeds with **zero** env vars set: the app runs
   in `PUBLIC_LOCAL` mode and needs no backend.

## 5. Production checklist (required before a public launch)

- [ ] **HTTPS is required for `getUserMedia`**: Vercel serves HTTPS on
      `*.vercel.app` and custom domains automatically. Confirm no browser
      console error about insecure context on the deployed origin before
      enabling microphone recording. Recording on localhost is fine for
      development.
- [ ] **RLS verified** against the live project (section 3). Run the
      verification queries after any policy edit.
- [ ] **Email provider configured** and magic links land correctly on the
      production origin (Authentication -> Redirect URLs).
- [ ] **Anonymous sign-ins**: if `ANONYMOUS_CLOUD` is the public mode,
      enable anonymous sign-ins **and** rate limiting / CAPTCHA before
      launch. Without rate limits, anonymous sign-in endpoints can be abused
      to burn auth quota or store junk data. Add:
      - Supabase Auth rate limits: raise/configure the "Token Refresh",
        "Signup" (anonymous signup counts here) and "Magic Link" limits for
        the production project (Authentication -> Rate Limits).
      - A CAPTCHA provider (hCaptcha) in Authentication -> Bot and Abuse
        Protection, and pass the CAPTCHA token through
        `auth.signInAnonymously` / `auth.signInWithOtp` calls, otherwise the
        endpoints are open to scripted abuse.
      - A storage quota policy (Storage -> Settings -> max file size, and
        project add-ons for volume) so a single user cannot fill the bucket.
      These are launch prerequisites, not post-launch niceties.
- [ ] **Project naming**: the product name is `0wave Studio` (zero, capital
      S) everywhere visible.

## 6. Conflict strategy: last-write-wins

Declared (ADR-008, `supabase/migrations/0001_init.sql`,
`src/lib/persistence/supabase/repository.ts`):

- The `Project` document is the unit of truth and is stored whole in
  `projects.state_json`; there is no field-level merge.
- Every table has an `updated_at` column maintained by the
  `handle_updated_at()` trigger (server clock, not client clock).
- When two clients write the same project, the row with the newer
  `updated_at` wins. The sync layer writes the full current document on
  every save, so the winner's state is complete.
- Blobs are stored under `{user_id}/{project_id}/{asset_id}` with
  upsert-on-save: the newest upload replaces the older object, matching the
  document-level last-write-wins rule.
- Deleting a project removes its storage folder explicitly (database rows
  cascade via foreign keys; storage objects do not) and its blobs are gone
  with it.
