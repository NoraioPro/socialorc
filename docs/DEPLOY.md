# Deploy Runbook — SocialOrc

> **Status:** pre-deploy. M0.3 (real connector) and M0.4 (stable origin) both need
> this run, and the database decision below is the one open question.
> **Verification at every step:** `GET /api/health` — see "Checking a deploy" at the end.

---

## 0. The one decision: where does the database live?

The current datasource is **SQLite via `better-sqlite3`**, which cannot run on
Vercel serverless (no writable filesystem per invocation). `docs/PRD.md`
specifies PostgreSQL for production. Two viable paths:

| | **A. Postgres + Vercel** (recommended, matches the PRD) | **B. Container / VPS** |
|---|---|---|
| Work | switch provider to `postgresql` + `@prisma/adapter-pg`, regenerate migrations for Postgres, deploy | keep SQLite, run the app and the cron worker on a host with a disk |
| Database | Vercel Postgres / Neon / Supabase — create it first | the existing `dev.db` file (back it up) |
| Cron | Vercel Cron via `vercel.json` (already configured, every 5 min) | host cron or systemd timer hitting `/api/cron/publish` |
| Risk | migration dialect differences (SQLite SQL ≠ Postgres SQL) — regenerate the baseline, don't copy it | you own uptime, backups and TLS |

**Not yet verified on this machine:** no Docker CLI and no local Postgres are
installed, so the Postgres path could not be rehearsed here. Do not treat it as
tested until `migrate deploy` has run against a real Postgres instance.

---

## 1. Required environment variables

Non-negotiable for any deploy:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (path A) or `file:./prod.db` (path B) |
| `NEXTAUTH_URL` | the public HTTPS origin, exactly — OAuth redirects are built from it |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — **changing it invalidates every stored token** |
| `CRON_SECRET` | `openssl rand -hex 24`; the worker requires it as a bearer token |
| `NODE_ENV` | `production` |

Per connector (only the ones you are enabling): `LINKEDIN_CLIENT_ID` /
`_SECRET`, `TWITTER_CLIENT_ID` / `_SECRET`, `INSTAGRAM_APP_ID` / `_SECRET`,
`FACEBOOK_APP_ID` / `_SECRET`, `TIKTOK_CLIENT_KEY` / `_SECRET`,
`YOUTUBE_CLIENT_ID` / `_SECRET`, `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.
`GET /api/health` lists exactly which are still missing, by name.

Optional: `OPENAI_API_KEY` (AI drafting), `BLOB_READ_WRITE_TOKEN` (media),
`TELEGRAM_API_BASE` (self-hosted Bot API).
Optional P2 experiment flags (stub, on by default): `EXPERIMENTS_ENABLED="false"`
turns every flag off, `EXPERIMENTS_KILL_SWITCH="true"` forces all decisions off and
says so in `GET /api/experiments`. Neither can affect the approval gate.
`MOCK_SOCIAL_ADAPTERS` must be **`false`** in production.

---

## 2. Redirect URIs to register with each provider

All six connectors share one callback shape:

```
https://<your-origin>/api/social/<platform>/callback
```

LinkedIn is the priority: `https://<your-origin>/api/social/linkedin/callback`.
A stable origin is required — providers reject `http://localhost`, and an
ephemeral tunnel means re-registering the URI every restart.

---

## 3. Deploy steps (path A)

1. **Create the database** (Vercel Postgres, Neon or Supabase) and copy the
   connection string.
2. **Switch the schema provider** to `postgresql` and add `@prisma/adapter-pg`;
   swap the adapter in `src/lib/prisma.ts`.
3. **Regenerate migrations for Postgres** — do not reuse the SQLite baseline:
   ```bash
   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script \
     > prisma/migrations/0_init_postgres/migration.sql
   DATABASE_URL=... npx prisma migrate deploy
   ```
4. **Deploy** with the variables from §1 set for the Production environment.
5. **Confirm the cron** is registered (Vercel → Settings → Cron Jobs) and that
   `vercel.json` still targets `/api/cron/publish`.
6. **Connect accounts**: sign in, then `/settings/accounts` → connect. The
   browser flow exercises the callback routes end to end for the first time.

---

## 4. Checking a deploy

```bash
curl -s https://<your-origin>/api/health | python -m json.tool
```

Expect `"status": "ok"` with `database.reachable: true`,
`database.appliedMigrations >= 1`, and a `platforms` block naming what is still
unconfigured. `"status": "degraded"` means the database is reachable but
unmigrated; `"error"` means the database is unreachable (HTTP 503).

Then, in the app: create a draft → approve → schedule two minutes out → and
either wait for the cron or call it manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-origin>/api/cron/publish
```

`processed/published/failed` in the response tells you exactly what the worker
did. A `permanent` count above zero means a credentials problem — the account is
flagged `needsReconnect` with the reason stored in `lastError`.

---

## 5. Rollback

- The worker never publishes content that is not `SCHEDULED`, and never re-sends
  a post that already has a `platformPostId`, so a bad deploy cannot duplicate posts.
- Failed publishes dead-letter with the platform error attached; nothing is lost silently.
- `TOKEN_ENCRYPTION_KEY` must not change across deploys, or every connected
  account needs reconnecting.
