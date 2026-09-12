# Production readiness — SocialOrc on Supabase

State as verified, not assumed. Every claim below was exercised against the real
Supabase project (`mcgasezxvcubpdxfighb`, eu-central-1, PostgreSQL 17.6).

## Verified working

| Gate | Result |
|---|---|
| `next build` | exit 0 |
| Schema on Supabase | 28 app tables, `0_init` applied, drift check empty |
| Baseline from empty | `migrate deploy` on an empty database → 29 tables |
| Session pooler (5432) | connects, DDL-capable — used for migrations |
| **Transaction pooler (6543)** | write · read-back · delete · **8-way concurrency** — used at runtime |
| App on Supabase | `/api/health` → `reachable: true`, `appliedMigrations 2` |
| Auth gate | `/dashboard` → 307 to `/login`; `/login` → 200 |
| Cron | `vercel.json` runs `/api/cron/publish` every 5 minutes |

## Required before going live

### 1. Set the runtime `DATABASE_URL` to the transaction pooler

Serverless functions are many short-lived instances. The session pooler (5432)
holds a connection per instance and exhausts the pool under load, so production
runtime must use port **6543**:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Migrations are the opposite: PgBouncer's transaction mode cannot run DDL, so
`prisma migrate deploy` must go through **5432**.

### 2. `MOCK_SOCIAL_ADAPTERS` must be unset or `false`

This is the one setting that fails silently and badly. With it true the app marks
posts as published without publishing anything — a green dashboard and an empty
platform. Check it on every deployment.

### 3. `NEXTAUTH_URL` and `APP_URL` must be the real origin

They must match exactly what the browser uses, scheme included. A mismatch fails
sign-in with `MissingCSRF` (the login page names this error explicitly because it
is a common self-inflicted wound).

### 4. Generate real secrets

`NEXTAUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` must be new, random, and distinct
per environment — never the development values.

**Changing `TOKEN_ENCRYPTION_KEY` invalidates every stored social token.** All
connected accounts must then be reconnected by hand. Treat it as immutable once
live.

### 5. Configure at least one social platform

`/api/health` reports `0/7` platforms configured, so the product currently
publishes nowhere. Each platform needs its credentials plus
`<APP_URL>/api/social/<platform>/callback` registered as a redirect URI.

This is the last real blocker to a useful deployment, and it is configuration
rather than code.

### 6. Migrations run automatically at deploy

`build` runs `scripts/migrate-deploy.mjs`, which applies pending migrations
before `next build`. It uses `DIRECT_URL` — the session pooler on port **5432**,
since PgBouncer's transaction mode (6543) cannot run DDL. To run them by hand:

```bash
DATABASE_URL="<session pooler, port 5432>" npx prisma migrate deploy
```

A failing migration fails the deploy, so code never ships against a schema that
has not been migrated. Without `DIRECT_URL` the step is skipped with a note
rather than attempted against the pooler.

The Prisma client is generated during `npm install` (`postinstall`) and again at
the start of `build`, so the deployed client always matches the configured
database. `prisma7.config.ts` throws if `DATABASE_URL` is missing rather than
guessing — a guessed client would be sqlite, deploy cleanly, and fail at runtime.

## Registration is invite-only

The signup form is public but no longer hands out accounts, and never hands out
an admin. The first account always gets in and becomes the workspace owner
(`ADMIN`); every account after that needs `SIGNUP_ALLOWLIST` — or
`ALLOW_PUBLIC_SIGNUP=true` to open registration deliberately — and receives
`EDITOR`. See `src/lib/signup-policy.ts` and `src/lib/roles.ts`.

**Claim the owner account before sharing the URL**: whichever account registers
first becomes the owner, and the only way to get another admin after that is to
promote one deliberately.

## Social sign-in (Google / Facebook)

Both providers are config-gated: a provider renders a button on `/login` only when
*both* halves of its credentials exist, so an unconfigured provider can never show a
button that cannot work (see `src/lib/auth-providers.ts`).

| Provider | Variables | Accepted aliases |
| --- | --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` — the same Meta app serves the Facebook *connector*, so one app does both jobs |

Register these redirect URIs with each provider. The match is exact, `www` is
required (`socialork.com` 308-redirects to it) and a trailing slash breaks it:

```
https://www.socialork.com/api/auth/callback/google
https://www.socialork.com/api/auth/callback/facebook
```

Google needs no app review: the scopes used (`openid email profile`) are
non-sensitive. Facebook's app only lets admins/devs/testers in while it is in
**Development** mode — switch it to **Live** before the public uses it.

**The Graph API version.** `next-auth` 4 pins the Facebook consent dialog to Graph
API **v11.0**, which Meta has retired, so sign-in fails before a user can even
approve. `src/lib/auth.ts` overrides it to **v24.0** (supported until Feb 2028).
Meta removes a version roughly two years after release — check the "Versions" table
in Meta's Graph API changelog and bump it before then.

**Who gets in.**

- New OAuth users are created as `EDITOR`, never `ADMIN`. The Prisma adapter applies
  the schema default (`ADMIN`), so `events.createUser` corrects the row immediately;
  `OAUTH_SIGNUP_ROLE` overrides it deliberately.
- Signing in with an address that already has a *password* account is refused
  (`OAuthAccountNotLinked`). Silently merging those identities is exactly how someone
  with a matching address takes over an account.
- The one exception is Google, which **proves** the address is verified: the `signIn`
  callback links the account when `profile.email_verified === true`. That callback
  runs before NextAuth's collision check, which is what lets us avoid
  `allowDangerousEmailAccountLinking` — it is all-or-nothing and would also merge
  identities for a provider that never verified the address.
- Facebook is deliberately excluded from that linking: its Graph API returns no
  `email_verified` claim, so there is nothing to check.

## Known gaps

- **Test harnesses**: the e2e and durability suites need `E2E_DATABASE_URL`
  pointed at a disposable Postgres database. They refuse hosted hosts on purpose,
  because they write test rows wherever they are aimed.
- **Vestigial sqlite support**: `prisma/schema.postgres.prisma`, the sqlite
  migrations and the `@prisma/adapter-better-sqlite3` dependency remain, so
  cutting back to sqlite is a one-line change. Remove them if that is no longer
  wanted.
- **RLS**: enabled on every Supabase table with no policies. Prisma connects as
  the owner and bypasses it, so the app is unaffected — but `supabase-js` with an
  anon key would be denied everything.
- **No `.env` on the machine that deploys**: values must be set in the Vercel
  project, not committed.
