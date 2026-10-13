# SocialOrc — handover report, 2026-10-13

For whoever picks this up next. Everything below was measured on this machine or on the live
deployment, not estimated. Where something is broken, unproven or undecided it says so in the same
paragraph as the good news.

---

## 1. Where things stand

| | |
|---|---|
| `main` = production | **`03fa7ea`** (Vercel Ready; `/api/health` reports the same commit) |
| Today's work | **25 commits**, all pushed, working tree clean |
| API routes | 49 |
| Pages | 21 |
| Unit tests | **667 passing, 0 failing** (59 files) |
| e2e (real HTTP + real database) | publish **22/22** · engagement **15/15** · roles **41/41** |
| Type check / build | `tsc --noEmit` 0 errors · `next build` exit 0 |
| Migrations | sqlite **14**, postgres **7** — both **verified in sync** with their schema |

## 2. Getting it running

```bash
git clone git@github.com:NoraioPro/socialorc.git && cd socialorc
npm install                       # postinstall runs prisma generate
cp .env.example .env              # then fill DATABASE_URL + NEXTAUTH_SECRET + NEXTAUTH_URL
                                  #  + TOKEN_ENCRYPTION_KEY + CRON_SECRET (see §4)
npx prisma migrate deploy         # applies prisma/migrations (sqlite) or prisma/migrations-postgres
npm run dev                       # http://localhost:3000
```

⚠️ **`npm run build` is not a dry run.** It is
`prisma generate && node scripts/migrate-deploy.mjs && next build` — it applies migrations to
whatever `DATABASE_URL` points at. With production credentials in `.env` that means migrating
production. Point it at a local database unless that is what you mean.

Handy scripts: `npm run typecheck` · `npm run test:unit` (regenerates the sqlite client first, so it
never needs a Postgres) · `npm run test:e2e` · `npm run test:e2e:roles` · `npm run test:durability` ·
`npm run db:pg:schema`.

First account: registration is **invite-only** by default (`src/lib/signup-policy.ts`), but the
**first** account is always allowed, so a fresh database can claim its owner. For local work set
`ALLOW_PUBLIC_SIGNUP=true` to register more than one.

Every provider is optional locally: with `MOCK_SOCIAL_ADAPTERS=true` the publish path runs against a
mock adapter and never touches a real platform, which is how all the e2e suites work.

## 3. What changed today, and why

Grouped by area. Each of these is a separate commit with the reasoning in its message; `git log` is
the detailed record, this is the map.

### The publishing gate (highest-risk area, two open doors)

- `POST /publish` never checked approval — immediate publish accepted a draft (`cc36f32`).
- The queue had no concept of waiting for approval.
- Accounts the worker had flagged for reconnect were invisible in the UI; settings now shows a
  reconnect banner with the reason (`42af4d2`, M0.10).
- A crash mid-publish left posts stuck in `PUBLISHING` forever, unreachable by any retry (`4acaeb2`).

### The race that could publish unapproved content (`3d7e777`)

Every status change was check-then-act: read the post, decide it is APPROVED, then
`update({ where: { id } })`. An edit landing in between returns the post to DRAFT and clears
`approvedAt` — and the write put it back to `SCHEDULED` regardless. The worker only reads the status,
so it published content nobody had approved.

Now every transition is a guarded `updateMany` that restates the state it decided about, and
`count === 0` becomes a **409 "this post changed, reload"**. `approvedAt` is part of every
approval-dependent guard, because a status can outlive its stamp. The rules live in
`src/lib/posts/transitions.ts`; add new ones there, not inline.

### The worker (`c3014c6`, `d1d300a`, `a4648f1`)

- Immediate publish to Telegram could never work: the queue passed the account's destination (chat
  id) and that route did not, so the adapter refused every send with `MISSING_CHAT`.
- The reconnect flag could not be set on the expired-token path (the failure handler was called
  without the account id), which is exactly the case the banner exists for.
- A job whose run died mid-send was re-queued, re-arming the duplicate it might already have caused.
  It now fails with an explicit *outcome unknown — check the platform* note; the deliberate Retry
  button re-queues it.
- Both publish routes declare a function ceiling and the worker stops claiming work it cannot finish.
  `maxDuration = 60` is what every Vercel plan allows; raise it in one line on Pro.

### Security (`78747de`, `a4648f1`, `54cb05e`, `bdc4f6f`)

- **The OAuth state cookie was plain JSON** — any client could mint one naming another user.
  It is now signed (`hmac.base64url`, `timingSafeEqual`) and verified on every callback.
  **Set `OAUTH_STATE_SECRET`** (falls back to `NEXTAUTH_SECRET`).
- **Telegram's connect endpoint** is a GET a victim can be made to open, and it accepted a chat id
  from the query. That now requires a verified state cookie belonging to the same session.
- **Fourteen write paths were session-only** (media, brains, brand brain, feed, inbox replies — the
  one place a reply reaches a real platform). They check a permission now, and
  `tests/unit/route-permissions.test.ts` walks the API tree so a *new* unprotected mutating route
  fails the build. Deliberate exceptions are listed there with reasons.
- **`/api/health` no longer describes the deployment to strangers.** Anonymous callers get
  `{status, commit, environment, timestamp}`; the rest needs the cron bearer token.
- **Rate limiting** (`src/lib/rate-limit.ts` + store + guard): login 10/15min per address, register
  10/h per IP, AI 60/h per user, upload 120/h per user. Sign-in checks the budget and spends it only
  on a failed attempt, so an attacker cannot lock a real user out. Refusals are 429 + `Retry-After`.

### Making the product reachable (`1b5ccda`, `22f792a`, `3a4639c`, `0d09149`)

- `ScheduleControl` existed and nothing imported it: approve → schedule, the pipeline the worker runs
  on, was unreachable from the UI. It is now on the post card.
- The control sent a raw `datetime-local` wall clock, so the server resolved it in *its* timezone
  (UTC on Vercel) — a 14:30 Cairo schedule went out at 17:30. The browser now sends an ISO instant.
- The marketing page opened with invented numbers presented as measurements. Labelled sample data.
- **Only ADMIN and EDITOR could ever exist**: signup produced those two and nothing could assign
  anything else, so MANAGER and CLIENT were in the permission matrix and in no database. There is now
  an invitation API (`/api/workspace/invitations`, ADMIN only) whose token is stored **hashed**, shown
  once, admits one address for a week, plus role changes that refuse self-changes and refuse to
  demote the last admin. The settings **Team** tab drives it.
- The Brand Brain was write-only: all fourteen fields saved, nothing read them, and generation fell
  back to a hard-coded demo brand ("SocialOrc Demo Brand") that it presented as the customer's.
  The routes now load the stored brain (`src/lib/brand-context.ts`) and an empty brain yields a
  prompt with **no** brand section. `forceMock` is refused unless mock output is allowed at all.
- `/api/workspaces` did not exist and the AI settings page called it, so that tab was dead. Added.

### Tests (`eb5c6b7`, `8636e26`)

- The e2e harness built its database with `db push`, which syncs the schema instead of applying the
  migrations — and it was hiding real drift: the sqlite history was missing the profile columns and
  the feed tables. Fixed, and the harness now uses `migrate deploy` on both providers.
- Two of its assumptions had gone stale (invite-only signup, least-privilege roles) and made every
  check fail on 403/401, which looked like a broken app.
- `roles.e2e` drove a dev-only role-minting endpoint that no longer exists — and must not. Rewritten
  against the real signup policy; it also asserts that endpoint stays **404**.

## 4. Architecture notes a newcomer needs

- **Two Prisma schemas, two migration directories.** `prisma7.config.ts` picks by URL scheme:
  `file:` → `prisma/schema.prisma` + `prisma/migrations`; `postgresql://` →
  `prisma/schema.postgres.prisma` + `prisma/migrations-postgres`. The postgres schema is
  **generated** from the sqlite one (`npm run db:pg:schema`) — never edit it by hand.
  **Every schema change needs a migration in both directories**, and you can generate them without a
  Postgres server:
  ```bash
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.postgres.prisma --script
  ```
  (the first against a database built by the committed migrations; the second works against any live
  postgres — it is read-only introspection).
- **The generated client follows `DATABASE_URL`.** Switching between sqlite and postgres needs
  `npx prisma generate` again, or the build dies in "Collecting page data" with a provider error.
  This bites after running the e2e harness.
- **Permissions**: `src/lib/roles.ts` holds the matrix, `requirePermission(...)` enforces it, and
  `parseRole` normalises the stored string. Roles: ADMIN (everything incl. `users:manage`), MANAGER
  (approve/schedule/connect/media), EDITOR (create/submit/upload/feed/engagement), CLIENT (read only).
- **Adapter pattern**: `src/lib/adapters/*` per platform, `mock.ts` for tests, `errors.ts`
  classifies failures and decides `requiresReconnect`. Publishing jobs carry attempts, backoff and a
  lease; a stale `PROCESSING` lease is reaped by `src/lib/jobs/lease-recovery.ts`.
- **Tenancy is not enforced.** `src/lib/workspace.ts` says so itself, and rows now carry tenant keys
  that nothing reads. `PATCH`/`GET` scope by `userId`, not workspace.
- **Deploys**: pushing `main` deploys production; the build runs `scripts/migrate-deploy.mjs`, so a
  bad migration fails the deploy rather than the runtime. `/api/health`'s `commit` is the only honest
  way to know what is live.

## 5. Traps worth knowing (all hit today)

1. **A bare `git push` pushes `main`.** Always `git push origin <branch>`.
2. **`npm run build` applies migrations** to `DATABASE_URL` (see §2). It is not a dry run, and the
   same command runs on every production deploy — which is why a broken migration fails a deploy
   instead of the runtime.
3. **Next 16 allows one `next dev` per directory.** The e2e harness boots its own server, so stop any
   dev server first, and stop the harness before starting yours.
4. **Production env vars are all scoped to Production** in the Vercel project, so no PR has ever had a
   working preview build (`DATABASE_URL is not set` at `postinstall`). Any preview needs its own
   database — the build applies migrations.
5. **`db push` hides drift.** It is what let the sqlite history rot. Use `migrate deploy` for anything
   you intend to trust.
6. **The harness sets `ALLOW_PUBLIC_SIGNUP=true` and `SIGNUP_ROLE=ADMIN` for its own run only** — that
   is why its users can drive flows that real signups cannot.
7. `tests/e2e/roles.e2e.mjs` needs a server with signups open and **no** `SIGNUP_ROLE`, or every user
   is ADMIN and there is no lower role to assert against:
   ```bash
   ALLOW_PUBLIC_SIGNUP=true npx next dev -p 3200     # separate database, migrations applied
   ROLES_BASE_URL=http://localhost:3200 npm run test:e2e:roles
   ```

## 6. What is still missing

**Decisions, not code** (each changes the product, so they are the owner's call):

1. **Tenancy**: enforce workspace filtering (large: queries + a data migration) or delete the tenant
   fields and the plan with them.
2. **Inbox**: build the real per-platform adapters (large, per platform) or take it out of the nav.
3. **The five intelligence panels** (competitor, trends, localization, network, global map): mount
   them behind honest "sample data" labels, or delete them as dead code.

**Work pending, no decision needed:**

4. **Vercel Preview environment** — add the env vars (and a separate database) so PRs get previews and
   the e2e suite can run in CI.
5. **No real platform has ever been driven.** Every send in every test goes through the mock adapter,
   so the first real publish on each connector is unproven. The fastest path to confidence: connect
   one real account in a staging workspace and publish one post.
6. The durability suite has not been run against a Postgres instance.

## 7. The documents

| file | what it is |
|---|---|
| `docs/STATE-REPORT-2026-10-13.md` | this handover |
| `docs/PRODUCTION-PLAN-2026-10-13.md` | Claude Opus's production plan; PR0–PR8 landed, §5 is the decision list |
| `docs/FEATURE-REVIEW-2026-10-13.md` | feature-by-feature status of all 22 surfaces |
| `docs/AUDIT-2026-10-13.md` | codebase audit |
| `docs/ROADMAP-2.0.md` | roadmap; §5 records today's work and the two defects found |
| `docs/AGENT-BRIEF.md`, `docs/SAAS-PLAN.md` | pre-existing brief and the tenancy plan |
