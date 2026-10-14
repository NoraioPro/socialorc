# SocialOrc — handover report, 2026-10-15

For whoever picks this up next. It replaces `STATE-REPORT-2026-10-13.md`. Everything below was
measured on the `integration/finish` branch or read from the code, not estimated. Where something is
broken, unproven or undecided it says so in the same paragraph as the good news.

Nothing here has been run against a live social platform. Every publish and engagement test uses a
mock adapter or a stubbed `fetch`. That gap is the main open risk and §6 says what closes it.

---

## 1. Where things stand

| | |
|---|---|
| Branch | **`integration/finish`** (head `03a13b2` when this report was written) |
| Production | `main` was `03fa7ea` on 2026-10-13. This branch is not known to be deployed. Check `/api/health` after the next deploy |
| Type check | `tsc --noEmit` **0 errors** |
| Lint | `eslint` **0 errors**, 22 warnings |
| Build | `next build` succeeds |
| Unit tests | **748 / 748** passing (67 files under `tests/unit`) |
| e2e (sqlite, mock adapters) | publish **28/28** · engagement **15/15** · workspace isolation **50/50** · inbox **24/24** · brand knowledge **19/19** · route contracts **168/168** |
| Durability | **26/26** on a local Postgres |
| Migrations | sqlite **17** and postgres **11** migration directories. Both histories are **in sync** with their schemas (`prisma migrate diff` is empty). The 2026-10-13 report said 14 and 7; those figures did not match the directory listing, so the listing is used here |
| API routes / pages | 52 `route.ts` under `src/app/api` · 20 `page.tsx` |
| CI | `.github/workflows/ci.yml`, two jobs: **sqlite** (typecheck, lint, unit, e2e) and **postgres** (`migrate deploy` + `migrate status` + durability). **Not yet run on GitHub** |
| Roles e2e | `roles.e2e` **41/41** on the merged branch (2026-10-15). Not run: `live.sh` (needs real accounts) |

## 2. Getting it running

```bash
git clone git@github.com:NoraioPro/socialorc.git && cd socialorc
npm install                       # postinstall runs prisma generate
cp .env.example .env              # then fill DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL,
                                  #  TOKEN_ENCRYPTION_KEY, CRON_SECRET (see ENV.md; OAUTH_STATE_SECRET is optional)
npx prisma migrate deploy         # applies prisma/migrations (sqlite) or prisma/migrations-postgres
npm run dev                       # http://localhost:3000
```

⚠️ **`npm run build` is not a dry run.** It is
`prisma generate && node scripts/migrate-deploy.mjs && next build` — it applies migrations to
whatever `DATABASE_URL` points at. With production credentials in `.env` that means migrating
production. Point it at a local database unless that is what you mean.

Handy scripts: `npm run typecheck` · `npm run test:unit` (regenerates the sqlite client first, so it
never needs a Postgres) · `npm run test:e2e` · `npm run test:e2e:roles` · `npm run test:durability`
(needs a Postgres `DATABASE_URL`) · `npm run db:pg:schema`.

First account: registration is **invite-only** by default (`src/lib/signup-policy.ts`), but the
**first** account is always allowed, so a fresh database can claim its owner. For local work set
`ALLOW_PUBLIC_SIGNUP=true` to register more than one.

Every provider is optional locally: with `MOCK_SOCIAL_ADAPTERS=true` (honoured only outside
production) the publish path runs against a mock adapter and never touches a real platform, which is
how the e2e suites work.

## 3. What changed since 2026-10-13

Grouped by area. `git log` on `integration/finish` is the detailed record; this is the map.

### Tenancy: enforced, not just recorded

- Every API route and page resolves the caller's workspace through `requireWorkspace()`
  (`src/lib/tenancy/guard.ts`). The caller's role is re-read from the database on each request, not
  taken from the session.
- Any member holding `posts:approve` can approve any post in the workspace. The author-only rule from
  2026-10-13 is gone.
- The feed is the workspace timeline. Brains and the brand brain are per workspace.
- Invitations join the **inviter's** workspace.
- `tests/unit/route-permissions.test.ts` fails the build if an API route has no workspace scope.
- The backfill migration (below) moves data between workspaces. Read §5 before running it.

### Removed: mock-only intelligence features

Deleted outright, with their routes, pages and fixtures: competitor, trends, localization, network
discovery, global map, campaign readiness, experiments, cultural intelligence. None of them had a real
data source. The 2026-10-13 report had listed them as "mount behind a label or delete".

### Honest labelling of mock output

- Create, AI Studio and cascade label mock AI text in the UI.
- Saved drafts that came from mock output are flagged. A mock variant cannot reach the publish path
  unmarked.

### Facebook and Instagram

- Long-lived token exchange. The stored credential is the chosen **Page's** access token, which does
  not expire. Revocation (password change, lost Page role, app removed) raises the reconnect banner.
- If the login manages several Pages or Instagram accounts, Settings shows a picker
  (`/api/social/pending`).
- Meta error codes are classified to decide when a reconnect is requested.
- Instagram publishes Reels and JPEG carousels. Container polling resumes across worker runs and never
  re-uploads.

### X (Twitter)

- Image, video and GIF via the v2 media upload with the same OAuth 2.0 token (scope `media.write`).
  Video is capped at 32 MB.
- Accounts connected before `media.write` must reconnect to attach media.

### TikTok

- Publish follows through: status polling, the post stays `PUBLISHING` until TikTok reports complete,
  no re-upload, 2-hour cap.
- The upload still buffers the whole file in memory.

### YouTube

- Video is streamed into the resumable session in 8 MiB chunks.
- One worker run is capped at 60 seconds. There is no resume across runs.

### LinkedIn

- Single MP4 video via the Videos API, in addition to text and single image.

### Telegram

- Replies are stored per chat. A reply can no longer leak across tenants.
- Connecting requires proving control of the chat with a one-time code posted in the chat. Group
  admin rights are required.
- There is **no environment-chat fallback**. `TELEGRAM_CHAT_ID` is only a suggestion pre-filled in the
  connect form.
- Publish-now sends the account's chat id. (On 2026-10-13 it did not, so it always failed.)
- Accounts are keyed `botId:chatId`. Existing accounts were re-keyed by migration but should be
  re-verified through the new code flow.

### Inbox: real for replies, not for everything

- Comments and replies on the 5 newest published posts per account, fetched through the engagement
  layer. Fan-out is bounded and each account reports its own status.
- Read and replied state is kept per account and comment id, so one account's state cannot hide
  another's.
- **Not covered:** direct messages, mentions, pagination, caching. The UI says so.

### Brand Brain knowledge

- Settings → Brand Brain → Knowledge adds text or a public https URL as a source. Sources can be
  listed and deleted.
- URL fetching is SSRF-safe: private and internal addresses refused at connect time, with redirects,
  time and size limited (3 redirects, 10 s, 2 MB).
- Embeddings use the account's own AI key with `AI_EMBED_MODEL` (default `text-embedding-3-small`).
- With no key, sources are indexed for BM25 keyword search instead. The UI labels this as keyword
  search.
- Top-k excerpts are injected into the create, AI Studio and cascade prompts.

### Security

- AI base URL egress is pinned at connect time. Redirects are refused. More non-public address ranges
  are blocked.
- Adapters download media only from this app's own Vercel Blob store (pinned by
  `BLOB_READ_WRITE_TOKEN`).
- The pending OAuth cookie is bound to its purpose and to the workspace.
- The upload-token route requires a workspace.
- Clients receive no raw provider error text.

### Correctness

- Retry and reschedule clear pending-publish state.
- In-flight uploads are fingerprinted. An edit made while an upload is in flight cannot publish stale
  media.
- Claiming a job re-checks `scheduledAt`.
- An account's platform must match the post's platform.
- If a send succeeds but its record cannot be written, the post is closed as "outcome unknown" rather
  than left ambiguous.
- Delete cannot race the worker.
- Malformed dates and bodies return 400.
- Facebook photo posts are recorded under their post id, not the photo id.
- Reschedule is guarded like the other transitions.
- The new route-contract suite found four route bugs. All four are fixed.

### Migrations added since 2026-10-13

| migration | what it does |
|---|---|
| `20261014120000_enforce_workspace_tenancy` | Adds `workspaceId` to `BrandBrain` and `Invitation`. Backfill: one deployment workspace for every user with no membership, with role mapping. Moves each invitee's personal workspace into the inviter's workspace, together with AI credentials, platform credentials, brand profile, brain data, conversations and agents. Stamps `workspaceId` everywhere and deletes orphaned jobs. Columns stay nullable |
| `20261014130000_pending_publish_and_telegram_replies` | Pending-publish state on posts; per-chat Telegram reply store |
| `20261015120000_inbox_item_state` | Read/replied state per account and comment |
| `20261015130000_telegram_chat_accounts` | Re-keys Telegram accounts as `botId:chatId` |
| `20261015140000_in_flight_content_fingerprint` | Fingerprint of content in flight, so edits never publish stale media |

## 4. Architecture notes a newcomer needs

- **Two Prisma schemas, two migration directories.** `prisma7.config.ts` picks by URL scheme:
  `file:` → `prisma/schema.prisma` + `prisma/migrations`; `postgresql://` →
  `prisma/schema.postgres.prisma` + `prisma/migrations-postgres`. The postgres schema is
  **generated** from the sqlite one (`npm run db:pg:schema`), so never edit it by hand. **Every schema
  change needs a migration in both directories**, and you can generate them without a Postgres
  server:
  ```bash
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.postgres.prisma --script
  ```
  (The first runs against a database built by the committed migrations. The second works against any
  live postgres; it is read-only introspection.)
- **The generated client follows `DATABASE_URL`.** Switching between sqlite and postgres needs
  `npx prisma generate` again, or the build dies in "Collecting page data" with a provider error.
- **Tenancy.** `requireWorkspace()` in `src/lib/tenancy/guard.ts` is the only way a route learns the
  caller's workspace. Queries filter by `workspaceId`. The nullable columns are a transitional state
  (see §6).
- **Permissions**: `src/lib/roles.ts` holds the matrix, `requirePermission(...)` enforces it, and
  `parseRole` normalises the stored string. Roles: ADMIN (everything incl. `users:manage`), MANAGER
  (approve, schedule, connect, media), EDITOR (create, submit, upload, feed, engagement), CLIENT (read
  only). The caller's role is re-read from the database on every request (see §3).
- **Transitions**: `src/lib/posts/transitions.ts`. Every status change is a guarded `updateMany` that
  restates the state it decided about. `count === 0` returns a 409. Add new transitions there, not
  inline.
- **Adapter pattern**: `src/lib/adapters/*` per platform, `mock.ts` for tests, `errors.ts` classifies
  failures and decides `requiresReconnect`. Publishing jobs carry attempts, backoff and a lease; a stale
  `PROCESSING` lease is reaped by `src/lib/jobs/lease-recovery.ts`.
- **Brand knowledge**: `src/lib/brain/*` (ingest, chunk, embed, fetch, retrieve). Vectors are stored
  base64 on `BrainChunk`, and cosine similarity is computed in the app over at most 2000 chunks. There
  is no pgvector.
- **Deploys**: pushing `main` deploys production. The build runs `scripts/migrate-deploy.mjs`, so a bad
  migration fails the deploy rather than the runtime. `/api/health`'s `commit` is the only reliable way
  to know what is live.

## 5. Traps worth knowing

1. **A bare `git push` pushes `main`.** Always `git push origin <branch>`.
2. **`npm run build` applies migrations** to `DATABASE_URL` (see §2). It is not a dry run.
3. **Backfill `20261014120000` moves data between workspaces.** It merges each invitee's personal
   workspace into the inviter's and assigns every membership-less user to one deployment workspace.
   Confirm the production user list is one team before it runs, or verify the result right after
   (see §6). Take a database backup first.
4. **Next 16 allows one `next dev` per directory.** The e2e harness boots its own server, so stop any
   dev server first, and stop the harness before starting yours.
5. **Production env vars are scoped to Production** in the Vercel project, so PRs have no working
   preview build (`DATABASE_URL is not set` at `postinstall`). Any preview needs its own database,
   because the build applies migrations.
6. **`db push` hides drift.** It is what let the sqlite history rot. Use `migrate deploy`.
7. **The harness sets `ALLOW_PUBLIC_SIGNUP=true` and `SIGNUP_ROLE=ADMIN` for its own run only**, which
   is why its users can drive flows that real signups cannot.
8. **`TELEGRAM_CHAT_ID` is not a fallback.** Setting it does not make Telegram publish anywhere. Each
   account's own chat is the only destination.
9. `tests/e2e/roles.e2e.mjs` needs a server with signups open and **no** `SIGNUP_ROLE`, or every user
   is ADMIN and there is no lower role to assert against:
   ```bash
   ALLOW_PUBLIC_SIGNUP=true npx next dev -p 3200     # separate database, migrations applied
   ROLES_BASE_URL=http://localhost:3200 npm run test:e2e:roles
   ```

## 6. What is still missing

### Owner actions (only a person can do these)

1. **Vercel Preview**: add the env vars and a separate preview database so PRs get previews.
2. **First real publish on each platform.** No live platform has been driven from this code. Every
   test uses mocks or stubs. Start with one real account in a staging workspace, one post per platform.
3. **Platform app reviews**: Meta App Review for `pages_manage_posts`, `pages_show_list` and
   `instagram_content_publish`; Google verification for YouTube; LinkedIn Share/Videos product
   approval; the X API tier that includes `media.write`; TikTok audit for public posts.
4. **Reconnects**: X accounts connected before `media.write` must reconnect to attach media. Telegram
   accounts were re-keyed but should be re-verified through the new code flow.
5. **Tenancy backfill**: confirm production users are one team **before** the backfill (it puts every
   membership-less user in one workspace), or check the result after deploy.
6. **Self-signups**: allowlisted self-signups after 2026-10-04 each have a personal workspace. They are
   not merged automatically.

### Known limits (code, not decisions)

- `workspaceId` is still **nullable** on the migrated tables. A NOT NULL migration comes later, once
  there are verified no nulls.
- `SocialAccount` uniqueness is **global**. The same platform account cannot be connected in two
  workspaces.
- TikTok upload buffers the whole file in memory.
- YouTube: one run is capped at 60 seconds and nothing resumes across runs.
- Inbox: reads the 5 newest published posts per account. No DMs, mentions, pagination or caching.
- Brand knowledge: no PDF or DOCX upload. URL sources are not refreshed after they are added.
  Embedding happens inside the request.
- The `Friendship` table is unused but kept.
- The `POST /api/media` legacy route and its 100 MB cap were not re-examined in this pass.

## 7. The documents

| file | what it is |
|---|---|
| `docs/STATE-REPORT-2026-10-15.md` | this handover |
| `docs/STATE-REPORT-2026-10-13.md` | previous handover, superseded by this one |
| `docs/PRODUCTION-PLAN-2026-10-13.md` | production plan; PR0–PR8 landed, §5 is the decision list (not re-checked in this update) |
| `docs/FEATURE-REVIEW-2026-10-13.md` | feature-by-feature status of the surfaces, with dated updates from 2026-10-15 |
| `docs/AUDIT-2026-10-13.md` | codebase audit |
| `docs/ROADMAP-2.0.md` | roadmap |
| `docs/AGENT-BRIEF.md`, `docs/SAAS-PLAN.md` | pre-existing brief and the tenancy plan |
| `CHANGELOG.md` | user-facing change log |
| `ENV.md`, `.env.example` | environment variables |
