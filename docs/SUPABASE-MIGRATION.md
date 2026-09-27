# Migrating SocialOrc to Supabase (Postgres)

Status: **staged and validated locally. Not yet cut over.** Today's SQLite
workflow is untouched — nothing changes until `DATABASE_URL` points at a
Postgres URL.

## Why

1. **SQLite cannot run on Vercel.** The filesystem is ephemeral, so `dev.db` is
   lost on every deploy. This is a hard production blocker.
2. **`dev.db` is tracked in git.** A binary database in version control rewrites
   on every schema change and conflicts on every merge. It has already caused
   branch damage on this repo.
3. **pgvector.** OrcBrain's embeddings are currently brute-force cosine search
   over SQLite, self-labelled `local-hash (degraded)`. Postgres + pgvector makes
   real vector search possible.

## What is already done

| Piece | Where |
|---|---|
| Postgres driver deps (`@prisma/adapter-pg`, `pg`) | `package.json` |
| Postgres schema variant | `prisma/schema.postgres.prisma` (generated) |
| Schema generator (keeps both in sync) | `scripts/make-postgres-schema.mjs` |
| Postgres baseline migration (656 lines, 24 tables, 3 native enums) | `prisma/migrations-postgres/0_init/` |
| Env-derived provider switch | `prisma7.config.ts` |
| Dual driver adapter (auto-detected) | `src/lib/prisma.ts` |

The two schemas differ **only** by datasource provider, and this is enforced:
`npm run db:pg:schema` regenerates the Postgres variant from the canonical
schema. Re-run it after any model change.

### How the provider is selected

`prisma7.config.ts` derives the target from `DATABASE_URL`, so no shell-specific
syntax is needed on any platform:

```
DATABASE_URL="file:./dev.db"              -> prisma/schema.prisma + prisma/migrations
DATABASE_URL="postgresql://...supabase"   -> prisma/schema.postgres.prisma + prisma/migrations-postgres
```

`PRISMA_TARGET=postgres` is an optional explicit override (needed for
`migrate diff`, or to generate the client before `DATABASE_URL` is switched).

## Validated locally (reproducible)

Validated against a throwaway **Postgres 17** (matching Supabase's PG17) in
Docker:

```bash
docker run -d --name socialorc-pg \
  -e POSTGRES_PASSWORD=socialorc_local_dev \
  -e POSTGRES_DB=socialorc \
  -p 55432:5432 postgres:17

export PG_URL="postgresql://postgres:socialorc_local_dev@127.0.0.1:55432/socialorc"

# 1. Baseline applies cleanly and Prisma tracks it
DATABASE_URL="$PG_URL" npx prisma migrate deploy    # -> 1 migration (prisma/migrations-postgres)
DATABASE_URL="$PG_URL" npx prisma migrate status    # -> "Database schema is up to date!"

# 2. The app's real client works end to end
DATABASE_URL="$PG_URL" npx prisma generate
DATABASE_URL="$PG_URL" npx tsx scripts/pg-smoke.ts  # -> PG SMOKE: PASS
```

Result: 24 application tables + the 3 native enum types (`Platform`,
`PostStatus`, `JobStatus`), matching the SQLite schema exactly. The smoke test
exercised TEXT/DateTime/Boolean/Json columns, both enums (write + transition),
relation reads, and `onDelete: Cascade`.

## Cutover steps

1. **Create the Supabase project** (owner/administrator required — a Developer
   role gets `403` on project creation).
2. Set in `.env` (and in Vercel's env for production):

   ```
   DATABASE_URL="postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
   ```

   Use the **pooler** host with `pgbouncer=true&connection_limit=1` — serverless
   functions open a connection per invocation and will exhaust Postgres
   otherwise. For migrations, use the **direct** (non-pooled) connection on port
   5432 instead, since PgBouncer's transaction mode does not support DDL.
3. Push the baseline:

   ```bash
   npx prisma migrate deploy
   ```
4. Generate the client against the Postgres schema:

   ```bash
   npx prisma generate
   ```
5. Untrack the old database:

   ```bash
   git rm --cached dev.db
   printf '\n# local SQLite database — use Postgres (see docs/SUPABASE-MIGRATION.md)\ndev.db\n' >> .gitignore
   ```
6. Delete the SQLite migration set once Postgres is confirmed good:
   `prisma/migrations/` (keep `prisma/migrations-postgres/`).

## Tests

The e2e harnesses (`tests/e2e/run.mjs`, `durability.mjs`, `roles.e2e.mjs`)
currently build **throwaway SQLite databases**. As the end state is
Postgres-only they need to target Postgres; the intended switch is an
`E2E_DATABASE_URL` env var that, when set, makes the harness reset a dedicated
Postgres schema and apply `prisma/migrations-postgres` instead of creating a
`.db` file.

**This is the remaining piece of the migration.** Note the constraint: Prisma
generates a provider-specific client, so the harnesses and the generated client
must agree — running e2e against Postgres requires
`DATABASE_URL=<pg> npx prisma generate` first.

⚠️ On the Supabase **free** plan there is no branching, so test isolation cannot
use preview branches. Use a local Postgres (above) or a second free project.

## Rollback

Nothing is destroyed by this staging. To revert to SQLite, point `DATABASE_URL`
back at `file:./dev.db` and run `npx prisma generate` — the config auto-detects
and the original migrations are untouched.

## Supabase free-plan caveats

- Projects **pause after 7 days of inactivity** — fine for dev, not viable as an
  always-on production database.
- No preview **branching**.
- The pooler + `connection_limit=1` settings above are required, not optional.
