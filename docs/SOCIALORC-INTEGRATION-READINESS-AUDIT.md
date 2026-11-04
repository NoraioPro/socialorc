# SocialOrc — Social Integrations Readiness Audit

**Date:** 1 November 2026
**Scope:** production deployment `www.socialork.com` (Vercel project `noraios-projects/socialorc`), branch `main` @ `57cccb36`, and its Supabase Postgres.
**Mode:** read-only investigation. Nothing was edited, migrated, deployed or published. No secret values appear in this document.

Evidence types used, and how to read them:

| Tag | Meaning |
|---|---|
| `CODE` | read from the repository at `origin/main` (file paths given) |
| `ENV` | `vercel env ls production` — **names only**, values never read or printed |
| `DB` | read-only SQL against the production database (aggregates, never row contents of secrets) |
| `PROVIDER` | requires the provider dashboard / review state — **not verifiable from this machine** |

---

## Part 1 — Executive Summary

### What already works (evidence)

1. **The intended shared-app architecture is what the code implements.** One deployment application per provider is read through `src/lib/platform-env.ts` + `src/lib/adapters/meta-app.ts`; customers never supply credentials. The custom-credential path (`WorkspacePlatformCredential`) exists as an optional override and **has never been used**: `DB` → `0 rows, 0 workspaces, 0 platforms`.
2. **Two platforms publish in production today, proven by real platform ids and URLs.** `DB` → Telegram: 9 published posts (`platformPostId` + `platformPostUrl` set on all 9, last `2026-10-31T21:37:21Z`); LinkedIn: 6 published (all with id + URL, last `2026-10-31T21:37:25Z`).
3. **A third platform has a real publish on record.** `DB` → YouTube: 1 post `PUBLISHED` with `https://www.youtube.com/watch?v=7LMtUUc_Nl8` on `2026-09-28`. It cannot publish now (see below).
4. **OAuth is complete, not stubbed.** `CODE` → a single shared callback handler (`src/lib/oauth/callback.ts`) with signed state cookies (`src/lib/oauth/state.ts`, validated for TTL + user + platform), PKCE in `tiktok.ts` and `twitter.ts`, token encryption at rest (`src/lib/encryption.ts`, `TOKEN_ENCRYPTION_KEY` present `ENV`), and per-account persistence (`src/lib/oauth/persist-account.ts`).
5. **Per-request workspace scoping exists and is used everywhere that matters.** `CODE` → `requireWorkspace(permission)` on every tenant-owned route; `withPlatformEnv(overridesForCurrentUser())` on `/api/social/connect` and all six callbacks; `DB` → `0` posts and `0` scheduled jobs without a workspace id.
6. **Publishing is a real worker, not a simulation.** `CODE` → `src/app/api/cron/publish/route.ts`: atomic `PENDING → PROCESSING` claim, account/workspace ownership check before decrypting any token, idempotency on `platformPostId`, classified retry/back-off, dead-lettering, lease recovery. `DB` → `ScheduledJob` 8 `COMPLETED` / 1 `FAILED`.
7. **Two different customers already hold separate accounts through the same app.** `DB` → LinkedIn 4 accounts across **2 workspaces**, Telegram 2 accounts across **2 workspaces** (same bot, different chat per account). This is the core SaaS isolation claim, demonstrated.

### What is partially implemented

| Area | State |
|---|---|
| X (Twitter) | OAuth works — an account is connected (`HassanNasrtm`). Publishing is **blocked by the provider**: `DB` → two `FAILED` posts, error `credits depleted` (2026-09-27), and that account's token expired `2026-09-27`. X write access is a paid tier. |
| YouTube | Adapter, OAuth and a proven publish exist, but **the production credentials are gone**: `ENV` has no `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`. The connected account's token expired `2026-10-29`, and without client credentials it cannot be refreshed. |
| TikTok | Adapter + PKCE + approval flags module exist (`src/lib/social/approval.ts`: `TIKTOK_DIRECT_POST_APPROVED`, `TIKTOK_UPLOAD_APPROVED`). No production credentials (`ENV`), no connected account (`DB`), no approval flags set → posts would be `SELF_ONLY` even if connected. |
| Workspace-admin vs platform-admin | No platform-admin concept exists anywhere in the code (`CODE` → grep for `platform admin` / `isPlatformAdmin` returns nothing). A workspace ADMIN is the highest role, scoped to their workspace. |

### What is not implemented in production

- **Facebook** and **Instagram**: adapter + OAuth code exist (`facebook.ts`, `instagram.ts` via one Meta app), but there is no Meta app id/secret in `ENV`, no connected account, and no published post.
- **No customer-facing path requires any of the missing configuration** — the Integrations screen simply reports the channel as unavailable (after the 1 Nov 2026 fix, ordinary members see "not enabled for your workspace", not env-var instructions).

### What is configured in production (`ENV`, names only)

Present: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_URL`, `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOW_PUBLIC_SIGNUP`.
Absent: `FACEBOOK_APP_ID`/`_SECRET`, `INSTAGRAM_APP_ID`/`_SECRET`, `YOUTUBE_CLIENT_ID`/`_SECRET`, `TIKTOK_CLIENT_KEY`/`_SECRET`, `TIKTOK_DIRECT_POST_APPROVED`, `TIKTOK_UPLOAD_APPROVED`, `MOCK_SOCIAL_ADAPTERS` (absent = real adapters, not the mock).

> `GOOGLE_CLIENT_ID/SECRET` are the **NextAuth sign-in** credentials. The YouTube connector does not read them — it reads `YOUTUBE_CLIENT_ID/SECRET` (`CODE` → `src/lib/adapters/youtube.ts`). This is the single most misleading thing in the current configuration.

### What blocks the intended SaaS experience

1. **Missing deployment app credentials** for Meta (FB+IG), YouTube, TikTok — operator action.
2. **Provider approvals** — Meta App Review + Business Verification, Google OAuth verification, TikTok content-posting audit. No code change helps.
3. **X requires a paid API tier** — commercial decision, already proven by the `credits depleted` failures.
4. **No platform-operator role** — "workspace admin" is the highest role, so customer admins can reach the per-workspace credential screen and the readiness API. Not a data-leak today (values are never returned), but it is the wrong trust boundary.
5. **RLS is decorative** — see Part 5. Tenant isolation is application-level only.

---

## Part 2 — Platform Status Matrix

| Platform | Shared App Implemented | OAuth Implemented | Production Credentials | Provider Approval | Own Customer Accounts | Real Publishing | Overall Status |
|---|---|---|---|---|---|---|---|
| Telegram | n/a (per-customer bot) | ✅ `CODE` | ✅ `TELEGRAM_BOT_TOKEN` `ENV` | none required | ✅ 2 accounts / 2 workspaces `DB` | ✅ 9 posts, ids + URLs `DB` | **VERIFIED** |
| LinkedIn | ✅ `CODE` | ✅ `CODE` | ✅ both vars `ENV` | not required for member posting; company pages need a separate product | ✅ 4 accounts / 2 workspaces `DB` | ✅ 6 posts, ids + URLs `DB` | **VERIFIED** (member profile only) |
| X (Twitter) | ✅ `CODE` | ✅ `CODE` (PKCE) | ✅ both vars `ENV` | paid write tier — not purchased | ✅ 1 account `DB` | ❌ `FAILED: credits depleted` `DB` | **PARTIALLY IMPLEMENTED** |
| YouTube | ✅ `CODE` | ✅ `CODE` | ❌ absent `ENV` | verification not started | ✅ 1 account (token expired 2026-10-29) `DB` | 1 historical publish 2026-09-28 `DB`; none possible now | **BLOCKED** |
| Facebook | ✅ `CODE` (one Meta app) | ✅ `CODE` | ❌ absent `ENV` | not started | ❌ 0 accounts `DB` | none | **BLOCKED** |
| Instagram | ✅ `CODE` (same Meta app) | ✅ `CODE` | ❌ absent `ENV` | not started (needs IG Business + linked Page) | ❌ 0 accounts `DB` | none | **BLOCKED** |
| TikTok | ✅ `CODE` (+ PKCE) | ✅ `CODE` | ❌ absent `ENV` | audit not started; flags unset | ❌ 0 accounts `DB` | none | **BLOCKED** |

Status vocabulary used exactly as requested. No cell is marked VERIFIED without a `DB`/`CODE` reference above.

---

## Part 3 — Platform-by-Platform Findings

### Telegram

- **Architecture.** No shared bot identity for customers: each workspace connects its own bot (`DB` shows the same `@Socialorl_bot` handle in two workspaces, each with its own stored token and its own `metadata.chatId`). `CODE` → `src/lib/adapters/telegram.ts`, `src/lib/adapters/destination.ts`, `src/app/api/social/telegram/connect/route.ts`.
- **Done.** Token encryption, per-account destination, connect-code proof of chat control, replies scoped to the account's chat, real publishing proven.
- **Missing.** Nothing blocking. `TELEGRAM_CHAT_ID` in env is only a default offered at connect time, not a runtime destination (`CODE`).
- **Customer experience.** Connect → paste BotFather token → pick chat. No review, works immediately.
- **Status: VERIFIED.**

### LinkedIn

- **Architecture.** Shared deployment app (`LINKEDIN_CLIENT_ID/SECRET`, `ENV`); each user authorises their own member identity (`DB`: 4 accounts, 2 workspaces, all `visibility = PRIVATE`, tokens valid to 2026-11-11 / 2026-12-30).
- **Done.** OAuth (shared handler), publishing (`DB`: 6 posts with real `urn:li:share` ids and URLs), token refresh path in the worker.
- **Missing.** Company-page publishing. `DB` → every account has `accountType = null` and `externalParentId = null`, i.e. only member profiles were ever connected. Posting as an organisation needs LinkedIn's Community Management API approval — a separate application, and `CODE` has no organisation-target branch in `linkedin.ts`.
- **Customer experience.** Connect works today for a personal profile.
- **Status: VERIFIED for member posting; NOT IMPLEMENTED for company pages.**

### X (Twitter)

- **Architecture.** Shared app (`TWITTER_CLIENT_ID/SECRET`), OAuth 2.0 with PKCE (`CODE` → `twitter.ts`).
- **Done.** Connection succeeded once; identity stored (`@HassanNasrtm`, token expired 2026-09-27).
- **Missing / blocking.** X's write endpoint requires a paid API tier. `DB` → 2 posts `FAILED` on 2026-09-27 with the provider's own message `credits depleted`. Nothing in the code can fix this.
- **Operator action.** Purchase a write-capable tier, then reconnect the account (its token is expired).
- **Status: PARTIALLY IMPLEMENTED — blocked on commercial tier.**

### YouTube

- **Architecture.** Shared app; `CODE` → `youtube.ts` reads `YOUTUBE_CLIENT_ID/SECRET` only.
- **Done.** OAuth worked; a real video publish exists: `https://www.youtube.com/watch?v=7LMtUUc_Nl8` (2026-09-28). Media requirements are enforced before sending (`DB` → 3 `FAILED` attempts with "YouTube requires a video file for posting", which is the adapter refusing text-only posts correctly).
- **Missing.** `ENV` has **no** `YOUTUBE_CLIENT_ID/SECRET` today → the adapter cannot resolve an app, and the connected account's access token expired 2026-10-29 → refresh impossible. Also unverified Google OAuth project → uploads land as **private** until verification.
- **Operator action.** Create the Google Cloud OAuth client, register `https://www.socialork.com/api/social/youtube/callback`, set both variables, reconnect the channel, submit for verification.
- **Status: BLOCKED (configuration + provider verification).**

### Facebook

- **Architecture.** Shared Meta app; `CODE` → `facebook.ts` resolves credentials through `metaAppId()` / `metaAppSecret()` in `src/lib/adapters/meta-app.ts`, which accepts `FACEBOOK_APP_ID | INSTAGRAM_APP_ID | FACEBOOK_CLIENT_ID | META_APP_ID` (and secret equivalents) so one Meta app serves both Facebook and Instagram.
- **Done.** Adapter, OAuth, media rules (4 photos or 1 video, never mixed — `CODE`), page-vs-profile handling in the adapter.
- **Missing.** No Meta app credentials in production; no connected account ever; no App Review / Business Verification.
- **Customer experience today.** Card shows the channel as unavailable to ordinary members; admins see what is missing (fixed 1 Nov 2026).
- **Status: BLOCKED.**

### Instagram

- Same Meta app and same credentials as Facebook (`metaAppId`). Additionally requires an Instagram **Business/Creator** account linked to a Facebook Page, and `instagram_content_publish` approval.
- `DB` → 0 accounts, 0 publishes.
- **Status: BLOCKED.**

### TikTok

- **Architecture.** Shared app; `CODE` → `src/lib/social/approval.ts` (`tiktokCredentials`) reads `TIKTOK_CLIENT_KEY/SECRET`, PKCE is implemented in `tiktok.ts`, and the two approval flags default to **false** by design ("an optimistic default is how publish ends up broken in production").
- **Done.** Adapter, PKCE, audit-aware capability reporting.
- **Missing.** No credentials in `ENV`, no account, no audit. Even when connected, posts are created `SELF_ONLY` until the audit passes.
- **Status: BLOCKED.**

---

## Part 4 — Production Environment Variables

Only names and verification status. No values were read or printed.

| Variable | Status | Platform | Required in prod | Shared / custom |
|---|---|---|---|---|
| `LINKEDIN_CLIENT_ID` | configured | LinkedIn | yes | shared |
| `LINKEDIN_CLIENT_SECRET` | configured | LinkedIn | yes | shared |
| `TWITTER_CLIENT_ID` | configured | X | yes | shared |
| `TWITTER_CLIENT_SECRET` | configured | X | yes | shared |
| `TELEGRAM_BOT_TOKEN` | configured | Telegram | default bot only | shared (default at connect time) |
| `FACEBOOK_APP_ID` | **missing** | Facebook | yes | shared (or per-workspace) |
| `FACEBOOK_APP_SECRET` | **missing** | Facebook | yes | shared |
| `INSTAGRAM_APP_ID` | **missing** (alias of the Meta app) | Instagram | yes | shared |
| `INSTAGRAM_APP_SECRET` | **missing** | Instagram | yes | shared |
| `YOUTUBE_CLIENT_ID` | **missing** | YouTube | yes | shared |
| `YOUTUBE_CLIENT_SECRET` | **missing** | YouTube | yes | shared |
| `TIKTOK_CLIENT_KEY` | **missing** | TikTok | yes | shared |
| `TIKTOK_CLIENT_SECRET` | **missing** | TikTok | yes | shared |
| `TIKTOK_DIRECT_POST_APPROVED` | **missing** (defaults false) | TikTok | after audit | shared |
| `TIKTOK_UPLOAD_APPROVED` | **missing** (defaults false) | TikTok | after audit | shared |
| `TOKEN_ENCRYPTION_KEY` | configured | all connectors | yes | shared |
| `CRON_SECRET` | configured | worker | yes | shared |
| `APP_URL` / `NEXTAUTH_URL` | configured | redirect URI origin | yes | shared |
| `DATABASE_URL` / `DIRECT_URL` | configured | Postgres + migrations | yes | shared |
| `BLOB_READ_WRITE_TOKEN` | configured | media uploads | yes | shared |
| `MOCK_SOCIAL_ADAPTERS` | absent (correct) | all | must stay `false`/absent in prod | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | configured — **NextAuth sign-in only, not YouTube** | sign-in | yes (for sign-in) | shared |

Provider-side state (app created? mode? review submitted/approved? business verified? production access?) is **not observable from this machine**: `PROVIDER = UNKNOWN — operator verification required` for Meta, Google, TikTok, and X's tier.

---

## Part 5 — Multi-Tenant Security

### What is enforced (evidence)

- **Every tenant-owned route resolves its workspace per request** (`CODE` → `src/lib/tenancy/guard.ts`, `requireWorkspace`), and a row belonging to another workspace is returned as **404, not 403**, so ids cannot be probed.
- **No orphaned rows:** `DB` → `Post` 49/49 and `ScheduledJob` 9/9 carry a workspace; `SocialAccount` 8/8 carry a workspace (0 null).
- **Tokens are encrypted at rest:** `DB` → all 11 stored access tokens are longer than 60 characters (ciphertext, not raw tokens); Telegram rows correctly have no expiry/refresh token.
- **The worker refuses a cross-tenant account before decrypting anything:** `CODE` → `src/app/api/cron/publish/route.ts` compares `post.socialAccount.workspaceId` with `post.workspaceId` and fails the post permanently if they differ. It also refuses an account whose platform differs from the post's platform.
- **Disconnect scopes to the caller's workspace** (`CODE` → `src/app/api/accounts/[id]/route.ts` via `requireWorkspace`).
- **A shared app never shares an identity:** the two-workspace LinkedIn and Telegram rows are the proof — same app, different authorisations, different rows.

### What is NOT true (and should stop being claimed)

**Row-Level Security exists but enforces nothing.**

- `DB` → RLS is enabled on `Post`, `SocialAccount`, `ScheduledJob`, `PostMedia`, `MediaAsset`, `Workspace`, `WorkspaceMember`, `WorkspacePlatformCredential`.
- `DB` → **`select count(*) from pg_policies` = 0**. There are no policies anywhere in the database.
- `DB` → the application's own connection role is `postgres` with `rolbypassrls = true`.

So: every table has RLS switched on and no policy to evaluate, and the app bypasses RLS anyway. Tenant isolation is **100% application-level** (`workspaceId` filters + `requireWorkspace`). That is defensible — and it is what actually protects the data today — but any statement of the form "the database enforces tenant isolation" is false. If a future query forgets its `workspaceId` filter, RLS will not catch it.

**No platform-operator role.** `CODE` → no `platform admin`/`isPlatformAdmin` anywhere. `POST /api/platform-credentials` is guarded by `requireWorkspace("accounts:connect")`, which includes **EDITOR**, not just ADMIN/MANAGER. A customer-side editor can therefore store credentials for their own workspace — harmless (it is their tenant, secrets are encrypted, values are never returned) — but it is not the same thing as a SocialOrc operator.

**Readiness names leak to any member.** `CODE` → `GET /api/social/status` is guarded by `dashboard:view` (every role) and returns `missing[]` — environment variable **names**. Names only, never values; low severity, worth tightening.

---

## Part 6 — App Credentials Assessment

**Verdict: the code follows the shared-app SaaS model. The customer never needs credentials.**

- **Default flow uses shared credentials.** `CODE` → `platformEnv(name)` returns `overrides?.[name] ?? process.env[name]`, and the override map is empty for every workspace that has not stored a credential. `DB` → `WorkspacePlatformCredential` has **0 rows**, so in practice every connect and every publish in production has already used the deployment app.
- **Custom credentials are an optional override**, applied per request through `withPlatformEnv(overridesForCurrentUser())` — never by mutating `process.env`, so one tenant's app cannot leak into another's concurrent request (`CODE`, `src/lib/platform-env.ts`).
- **What the feature configures:** an app id + encrypted app secret per platform per workspace, used for that workspace's connect flow and callbacks, with the deployment app as fallback.
- **Is it required for normal OAuth?** No. Removing it would not affect any customer today.
- **Customer-facing exposure:** the **App credentials tab is visible to every workspace member** (`CODE` → `TABS` in `settings-shell.tsx` includes it unconditionally). On 1 Nov 2026 the *text* of the setup block was gated to admins, but the tab itself is still open. Saving requires `accounts:connect`, so a CLIENT cannot store one; an EDITOR can, for their own workspace.
- **Could hiding the tab be bypassed?** Yes — `POST/PATCH/DELETE /api/platform-credentials` remain reachable directly by anyone holding `accounts:connect`. Hiding a tab is presentation; the guard is the boundary. If SocialOrc wants operator-only credential management, the route needs a platform-level authorisation, not a hidden tab.

**Recommended product position:** keep shared apps as the only customer-facing path; move the App-credentials tab behind a platform-operator capability (or an explicit "advanced" flag on the workspace), and leave the route guard as defence in depth.

---

## Part 7 — Remaining Work

### P0 — Blockers of the intended SaaS experience

| # | Issue | Evidence | Action | Owner | Depends on |
|---|---|---|---|---|---|
| P0-1 | No Meta app credentials in production → Facebook and Instagram cannot be connected at all | `ENV` absent | Create one Meta (Business) app; set `FACEBOOK_APP_ID/SECRET`; register both callbacks | **Operator** | none |
| P0-2 | No YouTube credentials in production → the connected channel cannot publish or refresh | `ENV` absent; token expired 2026-10-29; historical publish 2026-09-28 proves it once worked | Google Cloud OAuth client + `YOUTUBE_CLIENT_ID/SECRET`; reconnect | **Operator** | none |
| P0-3 | X publishing fails on the provider's paid tier | `DB` → `credits depleted` ×2 | Purchase a write-capable X tier, then reconnect | **Operator / commercial** | none |
| P0-4 | No TikTok credentials → channel unavailable | `ENV` absent; `DB` 0 accounts | Set `TIKTOK_CLIENT_KEY/SECRET`, submit content-posting audit | **Operator** | audit |
| P0-5 | RLS enabled with zero policies while the app role bypasses RLS — tenant isolation is application-only | `DB` → `pg_policies` = 0; role `postgres`, `rolbypassrls = true` | Either write real policies and use a non-bypass role, or stop claiming DB-level isolation and keep the application guards as the documented boundary | **Code decision** | none |

### P1 — Platform configuration and approvals

| # | Issue | Owner | Depends on |
|---|---|---|---|
| P1-1 | Meta App Review for `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish` + Business Verification | Operator | P0-1 |
| P1-2 | Google OAuth verification for `youtube.upload` (until then uploads are private) | Operator | P0-2 |
| P1-3 | TikTok content-posting audit; then set `TIKTOK_DIRECT_POST_APPROVED=true` | Operator | P0-4 |
| P1-4 | LinkedIn Community Management API, only if company-page posting is required | Operator / product | decision |

### P2 — Missing integration implementation

| # | Issue | Evidence | Action | Owner |
|---|---|---|---|---|
| P2-1 | LinkedIn company-page publishing does not exist | `DB` → every account `accountType = null`, `externalParentId = null`; no org branch in `linkedin.ts` | Implement organisation targeting + community-management scopes | Code |
| P2-2 | No platform-operator role; `accounts:connect` (incl. EDITOR) can manage per-workspace credentials | `CODE` → grep finds no platform admin; `requireWorkspace("accounts:connect")` on `/api/platform-credentials` | Add an operator capability and gate the credential routes + tab on it | Code |
| P2-3 | A new customer's Integrations screen cannot distinguish "unavailable" from "you need to do something" | by design after the 1 Nov 2026 fix | Keep; verify copy in each state | Code (small) |

### P3 — Optional improvements

| # | Issue | Action |
|---|---|---|
| P3-1 | `GET /api/social/status` returns env variable names to any member | Restrict to admins, or drop `missing[]` for non-admins |
| P3-2 | The App-credentials tab stays visible to all members | Hide it once P2-2 exists |
| P3-3 | `GOOGLE_CLIENT_ID/SECRET` look like YouTube configuration but are NextAuth-only | Rename in docs/UI, or document explicitly next to the YouTube card |

---

## Part 8 — Final Acceptance Checklist

A brand-new customer, today, in production:

| # | Step | Result | Evidence |
|---|---|---|---|
| 1 | Sign up | **PASS** | `ALLOW_PUBLIC_SIGNUP` configured `ENV`; signup route exists `CODE` |
| 2 | Get an independent workspace | **PASS** | self-signup creates and owns a workspace (`createWorkspaceForNewUser`, `CODE`); `DB` 3 workspaces / 20 members |
| 3 | Open Integrations | **PASS** | `/socialork/settings` renders Connections `CODE` |
| 4 | Connect Facebook using SocialOrc's app | **BLOCKED** | no `FACEBOOK_APP_ID` `ENV`; 0 accounts `DB` |
| 5 | Connect Instagram using SocialOrc's app | **BLOCKED** | no Meta app id `ENV`; 0 accounts `DB` |
| 6 | Connect YouTube using SocialOrc's app | **BLOCKED** | no `YOUTUBE_CLIENT_ID` `ENV`; existing token expired `DB` |
| 7 | Connect TikTok using SocialOrc's app | **BLOCKED** | no `TIKTOK_CLIENT_KEY` `ENV`; 0 accounts `DB` |
| 8 | Connect LinkedIn using SocialOrc's app | **PASS** | 4 accounts / 2 workspaces `DB`; 6 real publishes `DB` |
| 9 | Connect X using SocialOrc's app | **PASS (connect) / FAIL (publish)** | 1 account `DB`; `FAILED: credits depleted` `DB` |
| 10 | Connect Telegram with their own bot | **PASS** | 2 accounts / 2 workspaces `DB`; 9 real publishes `DB` |
| 11 | Publish through their own connected accounts | **PASS for Telegram + LinkedIn**, BLOCKED for the rest | `DB` publish rows above |
| 12 | Schedule posts successfully | **PASS** | `DB` 8 `COMPLETED` jobs; worker hardened `CODE` |
| 13 | Disconnect without affecting other customers | **PASS** | disconnect is workspace-scoped `CODE`; accounts already isolated per workspace `DB` |

---

## The direct answer

**How far is SocialOrc from the intended SaaS experience?**

The *architecture* is already the intended one: one shared application per provider, customer authorises their own identity, tokens encrypted per workspace, publishing worker tenant-safe, and the custom-credentials feature is unused (0 rows) and therefore genuinely optional.

What is missing is **not code for four of the seven platforms — it is configuration and provider approval**:

- **Working today, proven by real publishes:** Telegram (9), LinkedIn (6, member profiles).
- **One paid decision away:** X (a write-capable API tier; the code path already produced a correct `credits depleted` failure).
- **Configuration only, then a re-submission:** YouTube (create the Google client, set two variables, reconnect; a real publish from 2026-09-28 proves the code path), TikTok (same, plus the audit).
- **Full provider programme:** Facebook + Instagram (one Meta app + App Review + Business Verification).

**What I must do myself (operator, cannot be delegated to code):**

1. Create the Meta app and set `FACEBOOK_APP_ID/SECRET`, register both callbacks, then submit App Review + Business Verification.
2. Create the Google OAuth client, set `YOUTUBE_CLIENT_ID/SECRET`, register the callback, reconnect the channel, submit verification.
3. Set `TIKTOK_CLIENT_KEY/SECRET` and submit the content-posting audit; set `TIKTOK_DIRECT_POST_APPROVED=true` once approved.
4. Buy a write-capable X tier and reconnect the X account.
5. Optionally apply for LinkedIn's Community Management API if organisation posting is required.

**What needs code changes (and nothing else can fix):**

1. **P0-5:** decide and act on RLS — either implement policies + a non-bypass role, or document that isolation is application-level (today the database protects nothing).
2. **P2-2:** introduce a platform-operator capability so workspace admins stop being the ceiling for credential management (and hide the tab behind it — P3-2).
3. **P2-1:** LinkedIn company-page publishing, if the product promises organisation posting.
4. **P3-1/P3-3:** stop returning env var names to every member; stop letting `GOOGLE_*` look like YouTube config.

**Customer-side work: none.** No customer ever needs to create a developer app, a cloud project, a redirect URI, a client id, or an approval — provided the operator finishes P0-1 … P0-4.

**Time, once the operator work is submitted:** X is same-day (payment). YouTube re-connect is minutes after the variables are set; verification is 2–6 weeks for public uploads. TikTok 1–2 weeks after the audit. Meta 1–3 weeks after Business Verification (verification itself 1–3 business days). LinkedIn and Telegram are already done.
