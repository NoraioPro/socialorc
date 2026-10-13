# SocialOrc production plan: main @ 4f7aa87, read-only, 2026-10-13

> **Provenance.** Written 2026-10-13 by **Claude Opus** (`claude-new --model opus`, read-only) from
> `docs/AGENT-BRIEF.md`, `docs/AUDIT-2026-10-13.md`, `docs/FEATURE-REVIEW-2026-10-13.md` and
> `docs/ROADMAP-2.0.md`, then verified against the code. It ran no tests, builds or servers.
>
> **Three of its claims were re-verified by hand after it finished** (the ones a plan would be built
> on): the check-then-act race in `schedule/route.ts` — the read at `:43` guards APPROVED but the
> write at `:67-73` is `update({where:{id}})` with no status or `approvedAt` guard — is **real**;
> `ai.ts:265` is exactly `const ctx = brandContext || MOCK_BRAND_CONTEXT`, so the real model path gets
> the demo brand, is **real**; and `ai.ts:247-253` returns mock variants for `forceMock` with **no**
> `isMockAIAllowed()` check, is **real**. Its §1.1 correction (that `prisma7.config.ts` *is*
> auto-loaded) matches what this machine measured directly: a Vercel build with no `DATABASE_URL` dies
> in `postinstall -> prisma generate` on that config's throw.
>
> Status of the two audit findings it says are already fixed (`publish/route.ts` enforcing
> `publishBlockReason`, and the atomic PUBLISHING claim) — confirmed in the code on `main` today.
> §1 is the section that matters most: it is where the plan says what it could **not** reproduce.

I read every finding below in the code myself. I ran no tests, builds or servers and changed no files. "HERE" means it runs on this machine (unit / tsc / build / grep). "PG" means it needs a local Postgres through `E2E_DATABASE_URL`. Every "HERE" command needs `DATABASE_URL="file:./prisma/dev.db"` exported first, because Prisma auto-loads `prisma7.config.ts`, which throws when the variable is unset (`prisma7.config.ts:23-29`).

---

## §0 Verdict

**Not production-ready.**
- The gate holds against direct DRAFT→SCHEDULED, but a race lets edited, unapproved content become SCHEDULED (B1).
- No UI can schedule anything (B2).
- A crash after a send can still post twice (B10).

**Land first:**
1. B1: conditional status transitions, plus an `approvedAt` check in the worker.
2. PR0: the honesty pass.
3. B5 + B8: signed OAuth state, which also closes the Telegram CSRF.

---

## §1 What I could NOT reproduce, or found different

1. **`AGENT-BRIEF.md:98-99`: "`prisma7.config.ts` is not auto-loaded".** False. `node_modules/@prisma/config/dist/index.js` searches for `prisma7.config${ext}` and `.config/prisma7${ext}`. That is why a Preview build with no `DATABASE_URL` dies in `postinstall` (`package.json` `"postinstall": "prisma generate"`) on the throw at `prisma7.config.ts:23-29`.
2. **Feature review: `roles.e2e.mjs` "depends on the removed dev-login route" (:397-404).** It is worse than reported.
   - `loginAsRole` (`roles.e2e.mjs:105-118`) posts a `devRole` credentials field. Nothing in `src` handles it: `grep devRole src` finds only a comment at `src/lib/dev-login.ts:3`, and `roles.test.ts:229-242` asserts that file exports nothing. So every role session from :224 onward fails.
   - `:246-250` asserts CLIENT has exactly 1 permission, but `roles.ts:61,69` grant CLIENT `dashboard:view` and `engagement:view`, which is 2.
3. **Feature review §C: "Creator progress = `posts.length*10`".** The code is `Math.min(100, stats.total * 10)` (`feed/page.tsx:84`). The conclusion (an unlabelled heuristic) stands.
4. **Audit §5.1 / §6.1 / §8.1–8.3 (publish-route gate bypass, stranded PUBLISHING, non-atomic publish-now claim).** Already fixed, so they are not re-planned:
   - `publish/route.ts:52-66` enforces `publishBlockReason`, which requires `approvedAt` (`publish-gate.ts:31-39`).
   - The claim is an atomic `updateMany` (`:169-178`).
   - Lease recovery moves the post (`lease-recovery.ts:139-156`).
   - Residual defects are listed under B10.
5. **Feature review: "OAuth callback without `requirePermission` is defense in depth only".** Wrong; the code sides with the audit's §4.5. The state cookie is plain JSON (`connect/route.ts:79`), and `validateOAuthState` checks only userId, platform and TTL (`state.ts:72-101`). It does not compare against any server-held nonce, so a CLIENT can write their own cookie and finish a connect. The impact is narrower than the audit implies, though: it bypasses `accounts:connect` for the attacker's own session and is not a cross-user attack.
6. **Audit §4.9: "`decrypt` returns `""` on a wrong key, so publishing proceeds with an empty token".**
   - `encryption.ts:50-53` returns `bytes.toString(Utf8)`. Whether CryptoJS returns `""` or throws "Malformed UTF-8" for a wrong key is runtime behaviour: **UNVERIFIED**.
   - Nothing shows the publish succeeding. An empty token reaches the adapter and fails there.
   - Kept as hardening (S10), not as a blocker.
7. **`DEPLOY.md:114-116`: "a bad deploy cannot duplicate posts".** Contradicted by the code:
   - `cron/publish/route.ts:329` sends, and the DB write only happens at `:370-390`.
   - `lease-recovery.ts:23-27` itself admits the window.
   - `ROADMAP-2.0.md` §1 "Durable job queue … idempotency **Working**" overstates it the same way.
8. **Vercel env state.** The task says 25 Production-only variables; `PRODUCTION-READINESS-PLAN.md:39` says 14. I could not check either from here (Vercel connector not authorized, read-only rule) → **UNVERIFIED**. Both sources agree the Preview scope is empty.
9. **`ROADMAP-2.0.md:15` Telegram message ids 16/17/19** and the **"Supabase in production"** assumption (`migrate-deploy.mjs:10-13`). Neither can be reproduced from the repo → **UNVERIFIED**.
10. **Feature review: `/api/media` POST "will hit the serverless body limit".** The platform limit is **UNVERIFIED**.
11. **`ROADMAP-2.0.md` §1 mentions `npm run test:oauth` (18/18).** There is no such script in `package.json`.

---

## §2 Blockers (must fix before production)

Format: evidence · change · HERE · PG · effort · risk.

### B1. Status writes are check-then-act; an edit can turn unapproved content into SCHEDULED
- **Evidence:**
  - `schedule/route.ts:43` reads APPROVED, then `:67-81` updates `where:{id}` with no status or `approvedAt` guard.
  - PATCH resets to DRAFT and clears `approvedAt` with no status guard (`posts/[id]/route.ts:116-121`).
  - Interleaving the two gives `status=SCHEDULED, approvedAt=null`.
  - The worker checks only `status` (`cron/publish/route.ts:163`), then writes PUBLISHING unconditionally (`:225-228`). It would publish that row.
  - Same shape in `approve/route.ts:35`→`:43` and `retry/route.ts:45-46`→`:76-79`.
- **Change:**
  - New pure module `src/lib/posts/transitions.ts`: `scheduleBlockReason({status, approvedAt})` plus the expected-state `where` fragments.
  - schedule: an interactive `$transaction` with `post.updateMany({where:{id, userId, status:"APPROVED", approvedAt:{not:null}}})`. Return 409 when `count===0`; otherwise upsert the job.
  - worker `:225`: `updateMany({where:{id, status:"SCHEDULED", approvedAt:{not:null}}})`. When `count===0`, fail the job with "status changed".
  - approve and retry: the same pattern.
  - PATCH: `where status notIn [PUBLISHING, PUBLISHED]`.
- **HERE:** unit tests for `scheduleBlockReason` across every `PostStatus × approvedAt`, plus an FS-text check that schedule, cron and retry use `updateMany` with `approvedAt`. Then `npm run typecheck`.
- **PG:** new `publish.e2e.mjs` checks:
  - approve → PATCH → schedule ⇒ 400/409;
  - 20 concurrent PATCH+schedule pairs, then `SELECT count(*) FROM "Post" WHERE status='SCHEDULED' AND "approvedAt" IS NULL` = 0;
  - existing check 8 (DRAFT schedule → 400) still passes.
- **Effort:** M. **Risk:** touches the gate. The DRAFT→400 response must stay identical. This tightens the gate and never loosens it.

### B2. No UI can schedule a post (and the dormant component has a timezone bug)
- **Evidence:**
  - `ScheduleControl` is imported by nothing (`grep -rn ScheduleControl src` → only its own file).
  - The only POST `/schedule` caller is `schedule-control.tsx:53`; `queue/page.tsx:126` is a DELETE.
  - The component sends the raw `datetime-local` string (`schedule-control.tsx:56`). The route does `new Date(str)` (`schedule/route.ts:57`) with `z.string()` (`:10`), so the time is parsed in the server's timezone (server TZ **UNVERIFIED**, typically UTC). A user in Oslo would publish 1–2 h late.
- **Change:**
  - client sends `new Date(local).toISOString()`;
  - route uses `z.string().datetime({offset:true})`;
  - mount `<ScheduleControl>` in `post-card.tsx` next to `PublishNowButton` (`:196-201`), rendered only when `status==="APPROVED" && approvedAt` (the component already returns null unless APPROVED, `:34-42`);
  - `BestTimeChips` gets the H11 caption.
  - Depends on B1.
- **HERE:** unit test that the schema rejects an offsetless string; FS-text check that `post-card.tsx` imports `ScheduleControl`; `npx next build` exit 0.
- **PG:** e2e schedule with an ISO offset → 200 and `ScheduledJob.scheduledAt` equals the instant; offsetless → 400; DRAFT → 400. Manual: approved post → Schedule → it appears in `/dashboard/scheduled`.
- **Effort:** M. **Risk:** exposes the schedule route to every MANAGER/ADMIN click, so it must ship after B1.

### B3. Publish-now on Telegram always fails
- **Evidence:**
  - `publish/route.ts:186-196` builds `sendOptions` without `additionalOptions`; the worker passes `destinationForAccount(...)` (`cron:319`).
  - `telegram.ts:129-133` returns `MISSING_CHAT_ERROR` with code `NOT_FOUND`.
- **Change:** extract a pure `buildSendOptions(post, media, account)` into `src/lib/adapters/destination.ts` (or a sibling) and use it in both routes.
- **HERE:** unit test that `buildSendOptions` returns `additionalOptions.chatId` from `metadata.chatId`.
- **PG:** a `durability.mjs` case with `TELEGRAM_API_BASE` pointed at a stub: publish-now on an APPROVED Telegram post → 200, and the stub received `chat_id`.
- **Effort:** S. **Risk:** low.

### B4. Pre-send token failures never set `needsReconnect`
- **Evidence:**
  - `handleFailure` without `accountId` at `cron:264-272` (expired, cannot refresh) and `:294-302` (refresh threw).
  - The flag is set only when `accountId && exhausted && requiresReconnect(code)` (`:495`).
  - So the M0.10 banner cannot fire on the most common expiry paths. The outer catch `:411` has no account in scope; leave it.
- **Change:** pass `accountId: post.socialAccount.id` at both sites.
- **HERE:** FS-text test: each `handleFailure({` inside the job loop, except the outer catch, contains `accountId`.
- **PG:** `durability.mjs` case D (expired, non-refreshable) additionally asserts `SocialAccount.needsReconnect=true` and that `lastError` is set.
- **Effort:** S. **Risk:** low.

### B5. Unsigned OAuth state cookie; the callback skips `requirePermission`
- **Evidence:**
  - Cookie set as plain JSON at `connect/route.ts:79-82`; parsed at `state.ts:39-46,62-70,80`.
  - `callback.ts:42-46` checks only the session. `:65-68` validates only userId, platform and TTL. `:82` takes `brainId` from the cookie. `:178` deletes the cookie only on success.
  - `telegram/connect/route.ts:27-38` parses the same cookie unvalidated.
- **Change:**
  - `state.ts`: `sealState(data)` / `openState(raw)` = `base64url(json).base64url(HMAC-SHA256)` via `node:crypto`. The key is derived with HKDF from `NEXTAUTH_SECRET` (info `"oauth-state"`), so no new env var. Compare with `timingSafeEqual`.
  - `connect/route.ts` seals the state; `callback.ts` and `telegram/connect` open it.
  - `callback.ts` calls `requirePermission("accounts:connect")` after `resolveSessionUser`.
  - The `failure()` helper deletes the cookie too.
- **HERE:** `oauth-state.test.ts`: round-trip, tampered payload, wrong key, truncated MAC and expired state are each rejected.
- **PG:** roles e2e (after B17): a CLIENT hits `/api/social/linkedin/callback?code=x&state=y` with a hand-built cookie → redirected with `error=invalid_state`, and `SocialAccount` has 0 new rows.
- **Effort:** M. **Risk:** connects in flight at deploy time (≤10 min TTL) fail once. Every connector breaks if `NEXTAUTH_SECRET` is absent (it is already required).

### B6. Session-only mutating routes
- **Evidence** (`getAuthSession` only, no `requirePermission`):
  - media: `media/route.ts:41` POST, `:138` DELETE; `media/finalize/route.ts:32`; `media/upload-token/route.ts:21` (tokens up to 500 MB, `blob-upload.ts:32`);
  - inbox: `inbox/route.ts:83` PATCH;
  - brains: `brains/route.ts:34` POST; `brains/[id]/route.ts:10` PATCH and `:43` DELETE (DELETE re-homes all of the workspace's accounts);
  - brand-brain: `brand-brain/route.ts:81` POST and `:129` PUT.
- **Change** (mapping follows `roles.ts:60-73`):
  - media writes and brand-brain writes → `posts:create`;
  - inbox PATCH → `engagement:reply`;
  - brains writes → `accounts:connect`.
  - Add a guard-scanner unit test: every exported POST/PUT/PATCH/DELETE in `src/app/api/**/route.ts` calls `requirePermission` or appears on an explicit allowlist (`auth/*`, `auth/register`, `cron/publish`, `feed/*`, `profile`, `settings/profile`, each with the reason).
- **HERE:** the scanner test, plus `typecheck`.
- **PG:** roles e2e: CLIENT gets 403 on each route above; EDITOR gets 200 on media and 403 on brains.
- **Effort:** M. **Risk:** EDITOR loses brain create/rename. That is a product call, flagged in D1's notes.

### B7. No inbound rate limiting
- **Evidence:** a `grep -i "rate.?limit|throttl" src` hits only outbound handling (`cron/publish/route.ts`, `engagement-api.ts`, `adapters/errors.ts`, `social/errors.ts`). The unthrottled surfaces are:
  - credentials `authorize` (`auth.ts:128`);
  - `auth/register`;
  - `posts/generate`, `ai-studio`, `cascade` (these spend the customer's own AI key);
  - `media/upload-token`;
  - `social/connect`.
- **Change:** the mechanism needs an owner decision (D9). An in-memory counter is useless across serverless instances, so reject it. If Postgres is chosen:
  - model `RateLimitHit(key, windowStart, count)` with `@@id([key, windowStart])`;
  - one `INSERT … ON CONFLICT DO UPDATE SET count = count+1 RETURNING count`;
  - a helper `src/lib/rate-limit.ts` that takes an injectable client;
  - key = route + IP + (email when present);
  - 429 with `Retry-After`.
- **HERE:** unit test of the limiter with a fake client (window math, threshold, `Retry-After`).
- **PG:** e2e: the 11th bad login within 60 s → 429, and a different IP is unaffected.
- **Effort:** L (migration in both histories + `db:pg:schema`). **Risk:** shared-NAT lockouts; the table grows unless pruned (prune old windows in the cron).

### B8. `telegram/connect` is a state-changing GET with an attacker-chosen chat
- **Evidence:**
  - GET handler at `telegram/connect/route.ts:20`;
  - `chatId` comes from the query (`:76-77`) and is accepted when `getChat` succeeds (`:97-103`);
  - the update overwrites `metadata.chatId` (`:147-155`).
  - The UI never sends `chatId`: `settings/accounts/page.tsx:170` calls only `/api/social/connect`.
  - Exploit: a link to `/api/social/telegram/connect?chatId=<attacker group containing the shared bot>` silently redirects an ADMIN/MANAGER's future Telegram posts into the attacker's chat.
- **Change:** builds on B5.
  - require `openState` + `validateOAuthState(userId, "TELEGRAM")`, else redirect with `error=invalid_state`;
  - read `chatId` only from the sealed state (the gated connect route may accept a `chatId` param and seal it) or from the env default, never from this route's query;
  - delete the cookie after use.
  - GET stays, because the route is a redirect target. CSRF is closed because the attacker cannot know the state nonce.
- **HERE:** a pure `telegramConnectInput(query, openedState, env)` unit test: a query `chatId` is ignored.
- **PG:** GET with `chatId` and no state cookie → `error=invalid_state`, and `metadata.chatId` is unchanged.
- **Effort:** M (ships with B5). **Risk:** changing the chat now has to go through the connect flow.

### B9. `/api/health` discloses internals to anonymous callers
- **Evidence:** `health/route.ts:16`, no auth. It returns:
  - `appliedMigrations` (`:28`), `pendingJobs` (`:35`);
  - per-connector missing env var NAMES (`:52`);
  - `capabilities` (mock flags, `tokenEncryptionKeySet`) (`:61-80`).
- **Change:**
  - anonymous callers get `{status, commit, timestamp}` with the same 200/503;
  - the full body requires `isAuthorizedCronRequest(authorization, CRON_SECRET)` or an ADMIN session;
  - `commit` stays public because §8 needs it;
  - update `tests/e2e/live.sh` and `health.test.ts`.
- **HERE:** unit test of a pure `publicHealthView(report)` that returns exactly those 3 keys.
- **PG:** `curl /api/health | jq 'keys'` → `["commit","status","timestamp"]`; with a bearer → full report.
- **Effort:** S. **Risk:** external monitors parsing fields need the bearer.

### B10. Double-send window (worker and publish-now); `PublishingJob.idempotencyKey` unused
- **Evidence:**
  - In the worker, PUBLISHING is set at `:225`, the send happens at `:329`, and the DB write at `:370-390`.
  - An exception after a successful send lands in the outer catch (`:407-419`) → `handleFailure` → post SCHEDULED, job PENDING (`:477,:486`) → re-send.
  - Lease recovery resumes PUBLISHING→SCHEDULED (`lease-recovery.ts:139-146`), which re-sends (admitted at `:23-27`).
  - Publish-now: if the update at `:239-248` throws, or the function is killed after the claim (`:169-178`), the post stays PUBLISHING forever. Recovery scans only `ScheduledJob` (`lease-recovery.ts:105-108`).
  - No adapter carries an idempotency key (`grep idempotenc src/lib/adapters` → none).
  - `PublishingJob` (`schema.prisma:340-353`) has no reference in `src`, `scripts` or `tests`.
- **Change** (no migration). This implements `AGENT-BRIEF.md:83-84`: "a reclaim that asks for review instead of auto-resending".
  1. Recovery: a stale job whose post is PUBLISHING with no `platformPostId` → job FAILED, post FAILED, with "Outcome unknown: check <platform> before retrying". The existing Retry button (`post-card.tsx:192-194`, FAILED + `approvedAt`) is the human re-arm.
  2. Worker: a local `sent=true` after `createPost` returns success. When `sent`, the outer catch writes the `platformPostId` best-effort and marks the job FAILED "published, not recorded". It never retries.
  3. Publish-now: the same wrap around `:239`.
  4. A stale-PUBLISHING sweep in the cron: `post.updateMany({where:{status:"PUBLISHING", updatedAt:{lt:cutoff}, scheduledJob:null}})` → FAILED with the unknown-outcome message (`Post.updatedAt` exists).
  - Platform-native idempotency keys: per-platform support is **UNVERIFIED** and out of scope. `PublishingJob` → decision D10.
- **HERE:** extend the fake-client tests in `mvp-honesty.test.ts`: a retryable stale job plus a PUBLISHING post ⇒ `resumed=0`, post FAILED; a sweep test.
- **PG:** set a job PROCESSING with `startedAt = now()-11min` and its post PUBLISHING via SQL, run the cron ⇒ the Telegram stub received 0 sends and the post is FAILED with the message.
- **Effort:** M. **Risk:** reverses the auto-resume shipped in `4acaeb2`. A crash now costs a manual retry instead of risking a duplicate. Watch the `stranded` counter.

### B11. No `maxDuration` on the worker
- **Evidence:**
  - `grep maxDuration src` → only `social/media.ts` (an unrelated video field).
  - The worker is serial, 10 jobs per run (`cron:94-102`), with YouTube buffered in memory.
  - The lease is 10 min (`lease-recovery.ts:39`). Plan timeout limits are **UNVERIFIED**.
- **Change:**
  - `export const maxDuration = 300;` (a literal, as Next segment config requires) in `cron/publish/route.ts` and `posts/[id]/publish/route.ts`;
  - in the loop, stop claiming new jobs once elapsed time exceeds `maxDuration − 60 s`;
  - keep `PROCESSING_LEASE_MS` above `maxDuration`.
- **HERE:** FS-text test that both routes export a literal `maxDuration`, plus an assertion that `PROCESSING_LEASE_MS > maxDuration*1000`.
- **PG:** none meaningful. Post-deploy check: `vercel inspect <url>` shows the function limit (**UNVERIFIED** output format).
- **Effort:** S. **Risk:** the build fails if 300 exceeds the plan cap. Lower it then.

### B12. `BrandBrain` is written but never read
- **Evidence:**
  - `prisma.brandBrain` appears only in `api/brand-brain/route.ts`; other matches are `settings/brand-brain/page.tsx` state variables.
  - Generation uses a client-supplied `brandContext` (`ai-studio/route.ts:154,163`).
- **Change:** decision D7. The interim label is in PR0 (H16). If D7 is "wire it": a pure `brandBrainToContext(row)`, loaded server-side in `ai-studio` and `posts/generate` when the body has none.
- **HERE:** unit test of the mapper.
- **PG:** e2e (dev mode, mock AI): save a brand brain with name "Acme", then generate ⇒ variants contain "Acme" (the mock uses `ctx.profile?.name`, `ai.ts:215-216`).
- **Effort:** M. **Risk:** low.

### B13. `MOCK_BRAND_CONTEXT` is injected into real prompts
- **Evidence:** `ai.ts:265` `const ctx = brandContext || MOCK_BRAND_CONTEXT`, which feeds the real model "SocialOrc Demo Brand" (`types/brand-brain.ts:73`). The UI shows "Using Defaults" (`ai-studio/page.tsx:370`).
- **Change:** `const brandPrompt = brandContext ? buildBrandContextPrompt(brandContext) : undefined;`. Badge text → "No brand context". The mock path (`:215`, development only) is untouched.
- **HERE:** unit test of the exported `brandPromptFor(undefined) === ""` and that no output contains "Demo Brand".
- **PG:** e2e stores an AI credential whose `baseUrl` points at a local stub that records request bodies, then generates ⇒ the recorded system prompt does not contain "Demo Brand".
- **Effort:** S. **Risk:** none.

### B14. Mock AI text can be saved as a real draft, including in production
- **Evidence:**
  - `forceMock` is honoured unconditionally: `ai.ts:247-253` (aiStudioGenerate), `ai.ts:419` (improveContent), and `cascade.ts:244,248` (skips the production check when forceMock is set).
  - The API accepts it from any `posts:create` caller: `ai-studio/route.ts:154`, `posts/generate/route.ts:47,54,86,130`.
  - The save paths drop the flag: `ai-studio/page.tsx:193-199`, and `create/page.tsx:94-99` ignores `usedMock`.
  - Cascade falls back to mock text with `usedMock` false (`cascade.ts:265-274`); that path is non-production only.
- **Change:**
  - `ai.ts` and `cascade.ts`: throw `AINotConfiguredError` when `forceMock && !isMockAIAllowed()`;
  - cascade: `usedMock = useMock || anyFallback`;
  - create and ai-studio: show a "Mock text, not AI output" banner and disable Save when `usedMock`.
  - The gate is unaffected: saved drafts still need approval.
- **HERE:** unit test with `NODE_ENV=production`: `aiStudioGenerate({forceMock:true})` and `cascadeContent(..., true)` throw (no network).
- **PG:** contract check in e2e (dev): generate with `forceMock` → `usedMock:true`. Production behaviour is covered only by the HERE test.
- **Effort:** S–M. **Risk:** low.

### B15. `/api/workspaces` is fetched but does not exist
- **Evidence:** `settings/ai/page.tsx:72-79`; the tab is disabled at `:199`; `src/app/api/workspaces` is absent. The API's workspace scope works (`ai/credentials/route.ts:91-106`), but no UI can reach it.
- **Change:** per D11, either add `GET /api/workspaces` returning `{workspaces:[{id,name,role}]}` from `WorkspaceMember` for the session user (~25 lines), or delete the tab and the fetch.
- **HERE:** build lists the route (or grep shows the fetch removed).
- **PG:** e2e: register, then GET returns 1 workspace (register creates one best-effort).
- **Effort:** S. **Risk:** low.

### B16. `schedule-gate.test.ts` is a tautology
- **Evidence:** `tests/unit/schedule-gate.test.ts:5-11` defines its own `canSchedule`/`canReschedule` and imports nothing from `src`.
- **Change:** delete it and replace it with tests against `transitions.ts` (B1).
- **HERE:** `grep -L "src/lib/posts" tests/unit/schedule-gate.test.ts` returns nothing.
- **PG:** e2e check 8 (DRAFT → 400) stays the real enforcement.
- **Effort:** S. **Risk:** none.

### B17. The `roles.e2e.mjs` harness cannot pass
- **Evidence:** see §1.2 (`:105-118`, `:224-234`, `:246-250`, `:397-404`).
- **Change:**
  - add a `ROLES_DATABASE_URL` input (local only, reusing `assertThrowawayDatabase` from `run.mjs:38-49`);
  - register 4 users (server booted with `SIGNUP_ALLOWLIST`), set `User.role` via `pg` (already a dependency), log in with passwords;
  - fix the CLIENT assertion to match `permissionsFor("CLIENT")`;
  - delete `:397-404`;
  - add cross-user negatives: user B gets 404 on user A's post, media and account.
- **HERE:** `node --check tests/e2e/roles.e2e.mjs`; `grep -c "devRole\|login-as" tests/e2e/roles.e2e.mjs` = 0.
- **PG:** `ROLES_BASE_URL=… ROLES_DATABASE_URL=… npm run test:e2e:roles` → all checks pass.
- **Effort:** M. **Risk:** none to the product. It is the PG exit for B5, B6 and S6.

---

## §3 Production preparation

**3.1 Preview builds fail.**
- Mechanism: Vercel install → `postinstall: prisma generate` → auto-loaded `prisma7.config.ts:23-29` throws "DATABASE_URL is not set".
- This is a configuration fix, not a code fix. Do not soften the throw: it exists so a build never silently generates a sqlite client.

Preview-scope variables (names only; every value must differ from Production):

| Var | Why |
|---|---|
| `DATABASE_URL` | preview database, transaction pooler (`migrate-deploy.mjs:10-13`) |
| `DIRECT_URL` | the same preview database, DDL-capable, so previews migrate **their own** database |
| `NEXTAUTH_SECRET` | sessions; also keys the B5 state HMAC |
| `TOKEN_ENCRYPTION_KEY` | must differ from Production so a preview cannot decrypt production tokens |
| `CRON_SECRET` | health bearer (B9). Vercel crons call production only (**UNVERIFIED** for this project) |
| `NEXTAUTH_URL`, `APP_URL` | see below |
| optional: `BLOB_READ_WRITE_TOKEN` (separate store), `TELEGRAM_BOT_TOKEN` (a test bot), `SIGNUP_ALLOWLIST` | testers |

Never in Preview:
- provider client IDs/secrets for the production apps;
- `MOCK_SOCIAL_ADAPTERS` (refused under `NODE_ENV=production` anyway, `adapters/index.ts:38-40`).

**A separate preview database is mandatory.**
- `build` runs `scripts/migrate-deploy.mjs` (`package.json` build script). With `DIRECT_URL` set, it runs `prisma migrate deploy` (`:71`).
- A PR's unmerged migration would be applied to production, forward-only (`SAAS-PLAN.md:251`), and recorded in `_prisma_migrations`. That leaves `main` in drift and puts preview test rows in production tables.
- Without `DIRECT_URL`, a preview only warns and skips (`migrate-deploy.mjs:32-39,57-59`), and then runs new code against an unmigrated database.
- Open PRs with divergent migrations will collide on one preview database. It is disposable, so reset it (drop schema, then `migrate deploy`) when that happens.

**Redirect agreement.**
- `appOrigin()` = `APP_URL || NEXTAUTH_URL || "http://localhost:3000"` (`social/approval.ts:23-25`). Unset in a preview means OAuth redirect URIs point at localhost.
- Per-deployment preview URLs cannot be registered with providers. The options are in D14.
- Minimum: set both to one stable preview alias so login cookies and redirects agree.
- `tests/unit/redirect-uri-agreement.test.ts` already guards the path shape.

**3.2 Migrations at build time.**
- They run before the new deployment takes traffic, while the old code is still serving, and Prisma has no down migrations. So every migration must be expand-only and compatible with the previous code.
- A coupled change needs expand/contract across ≥2 deploys. Example: widening `SocialAccount @@unique([platform, platformUserId])` (`schema.prisma:173`) to include `workspaceId`. The compound key `platform_platformUserId` is used by `callback.ts:148-153,162-170` and `telegram/connect/route.ts:110-118,127-133`; dropping it before the code moves breaks connects on the old deployment.
- Every schema change needs both `prisma/migrations` and `prisma/migrations-postgres`, plus `npm run db:pg:schema` (`SAAS-PLAN.md:248-250`).
- **HERE** consistency check: `grep -c "CREATE TABLE"` across `migrations-postgres` gives 28+1+1 = 30, matching 30 models today.
- **PG** check: `npx prisma migrate diff --from-migrations prisma/migrations-postgres --to-schema prisma/schema.postgres.prisma --script --shadow-database-url "$SHADOW_URL"` → empty.
- A failed migration fails the build (`migrate-deploy.mjs:76-82`) and the old deployment keeps serving. Repair with `prisma migrate resolve`.

**3.3 Observability.**
- Exists:
  - `/api/health` (database, migrations, queue depth, connectors);
  - cron JSON counters (`cron:423-428`) and the lease log line (`:88-91`);
  - `Post.errorMessage`, `ScheduledJob.errorMessage`, `SocialAccount.lastError`.
- Missing:
  - error tracking (no Sentry or equivalent in `package.json`);
  - any alert when the cron returns 500 or dead-letters;
  - an uptime check;
  - log retention or a drain;
  - a dead-letter metric.
- Minimum before go-live, without adding dependencies:
  1. an external uptime monitor on `/api/health` (anonymous view after B9);
  2. a daily owner query: `SELECT count(*) FROM "ScheduledJob" WHERE status='FAILED' AND "completedAt" > now()-interval '24 hours'`;
  3. Vercel log drain or retention per the owner's plan (**UNVERIFIED** availability).

**3.4 Rollback.**
- Code: promote the previous deployment (`vercel rollback` / promote in the dashboard). This is safe only because of the 3.2 expand-only rule.
- Database: forward-only; a rollback is a new migration.
- Never rotate `TOKEN_ENCRYPTION_KEY` without re-encryption (`DEPLOY.md:116-118`).
- During a rollback the old worker still publishes only SCHEDULED posts (`cron:163`).

**3.5 Backup and restore.**
- Supabase plan backups and PITR are **UNVERIFIED** (`PRODUCTION-READINESS-PLAN.md:176`). The free plan pauses after 7 days idle (`SUPABASE-MIGRATION.md:131`), so see D12.
- Plan-independent backup: a nightly `pg_dump --format=custom --no-owner "$DIRECT_URL" > socialorc-$(date +%F).dump`, run off-box. This machine has no Postgres client, so the location is **UNVERIFIED**.
- Store dumps encrypted, and never next to `TOKEN_ENCRYPTION_KEY`.
- Restore drill, monthly:
  1. `pg_restore --clean --no-owner -d "$RESTORE_URL" <dump>`
  2. `DATABASE_URL="$RESTORE_URL" npx prisma migrate status` → "Database schema is up to date"
  3. Row counts of `Post`, `SocialAccount` and `ScheduledJob` match the source.

**3.6 Cron cadence.**
- `vercel.json:4-5` runs `*/5 * * * *`. If the project is on a plan that limits cron frequency, the deploy is rejected or the job is throttled. Plan tier **UNVERIFIED**; check before the first deploy.

---

## §4 Security hardening (ordered)

| # | Exploit shape | Files | Fix | Regression test |
|---|---|---|---|---|
| S1 | A CLIENT forges the state cookie and connects an account without `accounts:connect` | `state.ts:72-101`, `callback.ts:42-68` | B5 | `oauth-state.test.ts` tamper cases (HERE); roles e2e forged cookie (PG) |
| S2 | A CSRF link re-points an ADMIN's Telegram account to the attacker's chat | `telegram/connect/route.ts:20,76-77,147-155` | B8 | `telegramConnectInput` unit (HERE); state-less GET → `invalid_state` (PG) |
| S3 | A PATCH racing a schedule makes unapproved content SCHEDULED and publishable | `schedule/route.ts:43→67`, `cron:163→225` | B1 | transitions unit (HERE); concurrency SQL check (PG) |
| S4 | A CLIENT mints 500 MB upload tokens, deletes brains, edits brand voice | B6 list | B6 | guard-scanner unit (HERE); roles e2e 403s (PG) |
| S5 | Credential stuffing on login; register reveals whether an email exists; the first-user race | `auth.ts:128`; `register/route.ts:49-53` ("already exists" 400 vs invite-only 403); `:61`→`:81` count-then-create | B7. Register returns the same 403 text for "exists" and "not invited". First-user role inside a `$transaction` with `pg_advisory_xact_lock` (Postgres only) | limiter unit (HERE); 429 on the 11th attempt plus 2 parallel first signups → exactly 1 ADMIN (PG) |
| S6 | A demoted user keeps rights for the JWT lifetime; a malformed role token falls back to ADMIN | `auth.ts:52-54` (no `maxAge`, NextAuth default; 30 days **UNVERIFIED** for 4.24.15), `:241-249` (role set only at sign-in), `:234` (`DEFAULT_ROLE`, which is ADMIN) | `:234` → `FALLBACK_ROLE`. The jwt callback re-reads `User.role` when `token.roleCheckedAt` is older than 5 min | call `authOptions.callbacks.session` with an invalid role ⇒ CLIENT (HERE); demote via SQL, then approve → 403 (PG) |
| S7 | Anonymous reconnaissance of config gaps and queue depth | `health/route.ts:16-80` | B9 | `publicHealthView` unit (HERE); curl keys (PG) |
| S8 | Tenant A's engagement view lists replies from any chat on the shared bot; `getUpdates` offsets consume other tenants' updates | `telegram.ts:254-320` (filters only `reply_to_message.message_id`; the type at ~`:290` has no `chat`) | add `chat.id` to the type and filter `message.chat.id === chatId` | stubbed-fetch unit, following `engagement-api.test.ts` (HERE); Telegram stub in durability (PG) |
| S9 | Deleted media stays publicly reachable | `media/route.ts:136-160` (row deleted; only `put` imported at `:5`, no `del`) | `del(asset.url)` when `blobPath` is set, before the row delete | FS-text check that `del` is called (HERE); PG: none without a Blob token, so verify manually in staging |
| S10 | Unauthenticated CBC ciphertext; a wrong key gives an undefined outcome | `encryption.ts:50-53` | `v2:` AES-256-GCM via `node:crypto`; decrypt v1 and v2; re-encrypt on write; throw on failure. **No schema change.** Separate PR | round-trip, CryptoJS v1 fixture and tamper-throws unit (HERE); durability publish after a v2 write (PG) |
| S11 | SSRF through a user-supplied AI `baseUrl` (exploitability **UNVERIFIED**) | `ai/credentials/route.ts:46` (`optionalText(300)`) | require `https:`; reject IP-literal private, loopback and link-local hosts | unit on the validator (HERE); PUT with `http://169.254.169.254` → 400 (PG) |
| S12 | Timing side-channel on the cron secret (low) | `cron-auth.ts:12` | `timingSafeEqual` on equal-length buffers | `cron-auth.test.ts` (HERE); live 401 (PG) |
| S13 | Inbox PATCH acts through the first account for a platform, not the owner of `itemId` | `inbox/route.ts:98-109` | moot while replies return "Not implemented" (`inbox/adapters.ts`, 7×); fix together with D4 | — |

**Schema and migration consequences:**
- S1–S9 and S11–S12 need **no migration**.
- B7 (Postgres option) adds one table. It is additive, so it is safe to ship together with its code.
- S10 needs no schema change.
- A tenancy-widening unique key is coupled: three deploys (add the new unique → move the code → drop the old one).
- Dropping `PublishingJob` (D10) is a contract step and ships on its own.

---

## §5 Product decisions needed from the owner

| # | Decision | Options and cost | Today, if nobody decides |
|---|---|---|---|
| D1 | Cross-user approval / tenancy | (a) workspace-scope approve/schedule/reschedule/retry/list and use `WorkspaceMember.role`: L, touches every post query; (b) single-user product, drop "team/workspace" copy: S | Only the author can approve their own post (`approve/route.ts:27-29`); a MANAGER gets 404 on an EDITOR's post; EDITOR loses brain writes under B6 |
| D2 | Maker-checker (approver ≠ author) | (a) refuse in `approve` when `post.userId === guard.userId`: S, but blocks solo users; (b) no rule | Self-approval allowed |
| D3 | Signup | (a) invite-only and the landing page says "Request access": S; (b) public via `ALLOW_PUBLIC_SIGNUP`: requires B7, and there is no email verification | 403 for everyone after the first user (`register/route.ts:70-73`), while the landing page says "Start free · No credit card required" (`landing-v1.tsx:27`) |
| D4 | Inbox | (a) relabel and point to Engagement: S; (b) implement per-platform fetch/reply: L each; (c) remove from navigation: S | Production shows "No messages yet" forever |
| D5 | Five unmounted intelligence panels plus Global Map | (a) delete components, libs and tests: S, removes maintenance; (b) mount with existing mock badges: M; (c) leave as is | Unmounted; Global Map rendered with a fixture banner |
| D6 | `/api/traction`, `/api/growth-brief`, `/api/experiments` (no UI caller) | (a) delete: S; (b) mount, relabelled "activity score from your post counts": M | Reachable only by API; not rendered |
| D7 | Brand Brain | (a) wire into generation (B12): M; (b) keep the "not yet used" label: S | Saved and ignored |
| D8 | Feed / network (nothing creates `Friendship`) | (a) remove Feed from navigation: S; (b) build follow/friend: L | Own posts only; "Post to timeline" creates a DRAFT |
| D9 | Rate-limit mechanism | (a) Postgres table: L, migration, no vendor; (b) Vercel WAF rules: no code, plan-dependent, **UNVERIFIED**; (c) hosted KV: new vendor and dependency | None |
| D10 | `PublishingJob` model | (a) drop (contract migration): S; (b) adopt as a send-intent record: L | Dead schema |
| D11 | Workspace AI keys tab | (a) add `/api/workspaces`: S; (b) remove the tab: S | Tab disabled |
| D12 | Production database tier | free Supabase (pauses, backups **UNVERIFIED**) / paid / other Postgres | **UNVERIFIED** which one runs |
| D13 | OAuth in previews | (a) stable preview alias plus separate provider dev apps: owner effort; (b) no OAuth in previews (connect returns 503): none | Previews do not build at all |
| D14 | Landing-page "LIVE COMMAND CENTER" | (a) label "Example": S (PR0 default); (b) replace with a real screenshot; (c) remove | Invented metrics shown as live |

---

## §6 Honesty pass (verified row by row)

| # | Claim (file:line) | Data, or its absence | Smallest change that makes it true |
|---|---|---|---|
| H1 | "LIVE COMMAND CENTER", 7 / 12 / +24% / 3, "GOOD MORNING, HASSAN", "LinkedIn audience is 34% more responsive" (`landing-v1.tsx:23`) | static literals in the same line | eyebrow → "EXAMPLE DASHBOARD"; caption "Illustrative data" |
| H2 | "Voice learned / Audience learned …" (`landing-v1.tsx:21`) | `BrandBrain` unread (grep); `src/lib/brain` has no caller | "You provide: voice, audience …"; drop "learned" |
| H3 | "Start free", "No credit card required" (`landing-v1.tsx:27`) | invite-only (`register/route.ts:70-73`) | per D3; default "Request access" |
| H4 | "Live totals from your workspace" (`dashboard/page.tsx:135`) | `getStats(session.user.id)` (`:43`), user-scoped | "Your totals" |
| H5 | "COMMANDER RANK", "{xp} XP earned" (`dashboard/page.tsx:61,120`) | `drafts*10+pending*20+scheduled*40+published*100` (`:44-45`) | append "· activity points from your post counts" |
| H6 | "Creator progress … % toward your next milestone" (`feed/page.tsx:84`) | `min(100, stats.total*10)` | "{n} posts created" |
| H7 | "Post to timeline" (`feed/page.tsx:103`); "Publish your first thought above" (`:105`) | `posts/route.ts:137` forces DRAFT | "Save as draft" / "Draft your first thought above" |
| H8 | "All your comments, mentions, and messages in one place" (`inbox/page.tsx:129`) | `inbox/adapters.ts`: 7 × "Not implemented", 0 `fetch(` | outside mock mode: "Platform inbox isn't available yet; comments are in Engagement" |
| H9 | "schedule with best-time tips" (`drafts/page.tsx:39`) | no schedule UI until B2 | "Manage drafts and approved posts"; restore after B2 |
| H10 | "It is ready to schedule from Drafts." (`approvals/page.tsx:49`) | same | "Post approved." until B2 |
| H11 | Best-time chips scored 95/92/90/88/85 (shipped with B2) | static table (`ai.ts:463-469`); no disclaimer in `best-time-chips.tsx` | caption "Generic suggestions, not from your audience"; hide the score |
| H12 | "Based on platform user growth rates in the region" / "Average engagement rates across all platforms" (`global-map/page.tsx:349,355`) | hand-typed fixtures (`global-map/fixtures.ts:297-306`) | prefix "In this placeholder data:" |
| H13 | "Using Defaults" (`ai-studio/page.tsx:370`) plus the demo brand in the prompt | `ai.ts:265` | B13 one-liner; badge "No brand context" |
| H14 | Create page shows no mock marker (`create/page.tsx:94-99`) | `usedMock` returned by `posts/generate` | banner when `data.usedMock` (B14 client half) |
| H15 | Cascade "mock" banner missing after a fallback (`cascade-dialog.tsx:237`) | `cascade.ts:265-274` returns `usedMock=useMock` | `usedMock ||= anyFallback` |
| H16 | Brand Brain page implies the data is used | `prisma.brandBrain` only in its own route | "Saved. Not yet used by AI generation." (until D7) |
| H17 | "Excellent traction!" (`traction-score.ts:103`); "Your readiness to launch paid amplification" (`campaign-readiness.tsx:215`) | own post counts only | **not rendered** today, so no PR0 change. Relabel required if D5/D6 mounts them |
| H18 | Docs: `DEPLOY.md:114-116` ("cannot duplicate"); `ROADMAP-2.0.md` §1 queue "idempotency Working"; M1.5 inbox ✅; `AGENT-BRIEF.md:98` config not auto-loaded; `npm run test:oauth` | §1.1, §1.7, §1.11 | correct the text and link B10 |

---

## §7 Sequencing

Order and dependencies (→ means "must merge before"):

- **PR0 honesty**: H1–H10, H12–H16, H18, plus B13. Copy and labels, plus two one-line code changes that make claims true (`ai.ts:265`, `cascade.ts` `usedMock`). No gate or worker code, no schema. **Ships first and alone.** HERE: typecheck, unit, build. PG: e2e unchanged and green.
- **PR1 gate transitions**: B1 + B16. → PR2, PR3, PR4.
- **PR2 worker small fixes**: B3 + B4 + B11. Touches `cron/publish/route.ts` and `posts/[id]/publish/route.ts` after PR1.
- **PR3 unknown-outcome recovery**: B10. After PR2 (same files). Keep it separate so a recovery regression is attributable.
- **PR4 schedule UI**: B2 + H11 (+ restore H9/H10 copy). After PR1.
- **PR5 OAuth state**: B5 + B8 (+ S12). Independent; parallel with PR1–PR4.
- **PR6 permissions**: B6 + guard-scanner test. Parallel.
- **PR7 health**: B9. Parallel. Update §8 monitors in the same PR.
- **PR8 harness**: B17 + the cross-user suite. Parallel. → it is the PG exit for PR5, PR6 and S6, so PR5/PR6 cannot claim their PG exits before PR8 merges.
- **PR9 AI**: B14 server half + B15 (per D11) + B12 (per D7).
- **PR10 rate limit**: B7. Migration plus code, which may ship together because the table is additive and expand-only.
- **PR11 hardening**: S5 (register text + first-user lock), S6, S8, S9, S11.
- **PR12 encryption v2**: S10 alone.
- **Owner actions, parallel and blocking deploy:** §3.1 Preview env + preview database, D12 database tier, D3 signup, backups (§3.5).

Parallel lanes, one worktree each per `AGENT-BRIEF.md` §0:
- {PR1→PR2→PR3, PR1→PR4}
- {PR5}
- {PR6}
- {PR7}
- {PR8}
- {PR0}

**Must NOT ship together:**
- Any contract migration (drop/rename: the `SocialAccount` unique widening, the `PublishingJob` drop) with the code that stops using the old shape. Use expand → code → contract across separate deploys.
- PR12 (encryption) with any `TOKEN_ENCRYPTION_KEY` change.
- PR0 with any behaviour change beyond B13 and H15, so the honesty PR stays reviewable as copy.
- PR3 with PR4. Both change what a user sees after a failure or schedule; ship them apart so a regression is attributable.

---

## §8 Definition of production-ready (deploy-day checklist)

**On this machine (HERE)**, with `export DATABASE_URL="file:./prisma/dev.db"`:

- [ ] `git status --short` → empty; `git rev-parse HEAD` → note the SHA
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run lint` → 0 errors
- [ ] `npm run test:unit` → `fail 0`. The suite includes the transitions, guard-scanner, oauth-state tamper, `publicHealthView` and lease-recovery unknown-outcome tests.
- [ ] `npx next build` → exit 0 (migrate-deploy skips locally: not CI, not production)
- [ ] `grep -n "|| MOCK_BRAND_CONTEXT" src/lib/ai.ts` → only the mock generator (`:215`)
- [ ] `grep -rn "ScheduleControl" src --include=*.tsx | grep -v schedule-control.tsx` → ≥1 hit

**With a local Postgres (CI or a Docker host):**

- [ ] `E2E_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/socialorc_e2e npm run test:e2e` → all pass, including "schedule DRAFT → 400" and "publish DRAFT → 400"
- [ ] `npm run test:durability` → all pass, including the unknown-outcome and `needsReconnect` cases
- [ ] `ROLES_BASE_URL=… ROLES_DATABASE_URL=… npm run test:e2e:roles` → all pass, including the cross-user 404s and CLIENT 403s
- [ ] `prisma migrate diff --from-migrations prisma/migrations-postgres --to-schema prisma/schema.postgres.prisma --script --shadow-database-url …` → empty

**Vercel configuration** (owner; prints names only):

- [ ] `vercel env ls production` includes `DATABASE_URL DIRECT_URL NEXTAUTH_SECRET NEXTAUTH_URL APP_URL TOKEN_ENCRYPTION_KEY CRON_SECRET` plus the provider and `BLOB_READ_WRITE_TOKEN` names in use
- [ ] `vercel env ls preview` includes the §3.1 set. The owner confirms in the dashboard that the Preview `DATABASE_URL` host is not the Production host (do not print values).
- [ ] A PR preview build log shows `[migrate-deploy] migrations are up to date` against the **preview** database

**Live production checks after the first deploy:**

1. **Build log** contains `[migrate-deploy] migrations are up to date` (`migrate-deploy.mjs:84`).
2. **Anonymous health:** `curl -s https://<prod>/api/health | jq -r .commit` must equal `git rev-parse HEAD`. `.status` must be `"ok"`.
3. **Full health:**
   - Enter the cron secret into a shell variable without echoing it (`read -rs CS`). Then run `curl -s -H "Authorization: Bearer $CS" https://<prod>/api/health | jq '.database.appliedMigrations, .capabilities'`. Never paste the secret into logs or chat.
   - `appliedMigrations` must equal `ls -d prisma/migrations-postgres/*/ | wc -l` (5 today).
   - Expect `mockAdaptersAllowed:false`, `mockAIAllowed:false`, `tokenEncryptionKeySet:true`.
4. **Cron auth:** `curl -s -o /dev/null -w '%{http_code}' https://<prod>/api/cron/publish` → `401`.
5. **Gate:** as a signed-in MANAGER, create a draft, then `POST /api/posts/<id>/schedule` with `{"scheduledFor":"<future ISO>"}` → `400 "Post must be approved before scheduling…"`. `POST /api/posts/<id>/publish` → `400 APPROVAL_REQUIRED`.
6. **Real connect round trip** (owner-approved, Rule 3): connect Telegram through Settings → Accounts. Confirm the row exists and `metadata.chatId` is the intended chat. Disconnect and reconnect; `needsReconnect=false`.
7. **One real publish** (owner-approved): draft → approve → schedule from the UI (B2) 10 min ahead. Then check:
   - the post becomes PUBLISHED with a `platformPostId`;
   - the message is visible in the chat;
   - the cron response showed `published: 1`;
   - a second cron tick shows `deduped`, or `processed: 0`.
8. **Failure path:** temporarily break the target chat (remove the bot), schedule one approved post, and wait for the cron run. Expect the post FAILED with the platform reason and the job FAILED; no duplicate appears once the bot is restored and Retry is pressed once.
9. **Backups:** the first `pg_dump` exists, and a restore drill into a scratch database passed `prisma migrate status`.
10. **Monitoring:** the uptime monitor is green on `/api/health`, and the owner has the dead-letter query from §3.3.

**Production-ready = every box above ticked, every §2 blocker merged, and decisions D1, D3, D9 and D12 recorded in `ROADMAP-2.0.md` with their evidence.**
