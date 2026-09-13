# SocialOrc Production-Readiness Plan

Snapshot: production at commit `e4605e5`, https://www.socialork.com (canonical), auto-deploy from GitHub `main`. Written 2026-09-13. All file:line citations verified against repo code on this date; treat anything not re-verified after further commits as stale.

---

## 1. Definition of production-ready

Each line must be checkable by a command or HTTP response.

| # | Requirement | Check |
|---|---|---|
| D1 | All 7 connectors report `configured=true` | `GET /api/health` connector block |
| D2 | `MOCK_SOCIAL_ADAPTERS` unset or `false` in Production env scope | `vercel env ls production` |
| D3 | Media uploads use blob storage, not base64-in-Postgres | `BLOB_READ_WRITE_TOKEN` set; `media_assets.url` rows are `https://...blob.vercel-storage.com/...`, not `data:` URIs |
| D4 | AI features work end-to-end | `POST` to an AI-studio endpoint returns a real model completion, not the mock fallback |
| D5 | Registration is closed to the public | `ALLOW_PUBLIC_SIGNUP=false` (or unset) in Production; `SIGNUP_ALLOWLIST` populated |
| D6 | LinkedIn (and every connector) survives past current token expiry without manual reconnect | `SocialAccount.refreshToken` populated and cron successfully rotates before `expiresAt`, OR documented manual-reconnect runbook exists |
| D7 | Preview deployments have DB + auth | `vercel env ls preview` shows `DATABASE_URL`, `NEXTAUTH_URL`/`NEXTAUTH_SECRET` etc. present for Preview scope |
| D8 | Approval gate cannot be bypassed | Code review: `DRAFT -> SCHEDULED` direct transition absent; attempt via API returns 400 |
| D9 | Cron publish worker is observable | Failed/dead-lettered jobs visible somewhere other than Vercel function logs (e.g. an alert, a dashboard, or a queryable table) |
| D10 | Stuck `PROCESSING` jobs self-heal after a crash/deploy | A reclaim/lease-timeout mechanism exists and is exercised by test |
| D11 | Cron endpoint cannot be invoked unauthenticated | `CRON_SECRET` set in Production; `curl -X POST https://www.socialork.com/api/cron/publish` (no auth header) returns 401 |
| D12 | No secret ever committed | `git log -p -- .env* | grep -E 'sk-|Bearer|_SECRET='` empty; `.env.example` has no real values |
| D13 | API version pins are current, not retired | Each adapter's hardcoded version string cross-checked against platform's current supported-versions page |

---

## 2. Status table

| # | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | All connectors configured | MISSING | Live `/api/health`: only LINKEDIN `configured=true`; 6 platforms report missing env vars (see brief) |
| D2 | `MOCK_SOCIAL_ADAPTERS` correct | PARTIAL | Var is set in Production but NOT the string `"true"` (LinkedIn posts really published, so mock is effectively off) — but `.env.example:107-109` says it "MUST be unset or false in production"; current value is neither `unset` nor confirmed `"false"`. Needs an explicit check of the actual value, not just its effect. |
| D3 | Media storage | MISSING | `BLOB_READ_WRITE_TOKEN` unset. `src/app/api/media/route.ts:76-89`: `if (process.env.BLOB_READ_WRITE_TOKEN) { ...put()... } else { ...base64 data: URL... }`. `media_assets` count = 0 live, so no proof yet either way in prod data, but code path is confirmed. |
| D4 | AI features | MISSING | `OPENAI_API_KEY` unset. `src/lib/ai.ts:37-48` throws `"OpenAI API key not configured..."` when `getOpenAI()` is reached without a key; `isOpenAIAvailable()` (line 33-35) gates public entry points to a mock fallback instead, so today the app silently serves mock AI output rather than throwing — that's a hidden gap, not a crash. |
| D5 | Registration closed | MISSING (by design intent) | `ALLOW_PUBLIC_SIGNUP=true` currently set in Production. `src/lib/signup-policy.ts:54`: `(env.ALLOW_PUBLIC_SIGNUP ?? "").trim().toLowerCase() === "true"` — literally opens public signup. |
| D6 | Token refresh survives expiry | MISSING | 3 LinkedIn `SocialAccount` rows expire 2026-11-11 with no `refreshToken`. `schema.prisma:132` `refreshToken String?` is nullable; `linkedin.ts:77,114` stores `data.refresh_token || null`; LinkedIn scope requested (`linkedin.ts:42`: `"openid profile email w_member_social"`) does not include LinkedIn's offline/refresh product — refresh tokens are not obtainable under the current app tier without a separate LinkedIn "Refresh Token" partner program grant. |
| D7 | Preview env parity | MISSING | Brief states all 14 vars are Production-scope only — UNVERIFIED directly by this session (no Vercel CLI access), but consistent with default Vercel behavior when vars are added via dashboard without selecting Preview. |
| D8 | Approval gate intact | DONE | `src/app/api/posts/[id]/approve/route.ts:34` only allows `DRAFT`/`PENDING_APPROVAL` → `APPROVED`; `src/app/api/posts/[id]/schedule/route.ts:41-46` requires `status === APPROVED` before `SCHEDULED`; cron (`cron/publish/route.ts:124`) re-checks `SCHEDULED` before publishing. No direct `DRAFT -> SCHEDULED` path exists in code. |
| D9 | Cron observability | MISSING | Retry/dead-letter logic exists (`cron/publish/route.ts`, `MAX_ATTEMPTS=3`, exponential backoff) and is proven firing in prod, but no alerting/dashboard found — only Vercel function logs. |
| D10 | Crash-mid-job recovery | MISSING | `cron/publish/route.ts:79-86` flips job to `PROCESSING` before work; the query at 65-73 only selects `status: PENDING`, so a job orphaned in `PROCESSING` by a killed deploy is never picked up again. No lease timeout / `updatedAt` reclaim found. |
| D11 | Cron auth required | PARTIAL — MISSING by default | `cron/publish/route.ts:37-42`: `if (cronSecret && authHeader !== ...) return 401` — guard is skipped entirely if `CRON_SECRET` is unset. Brief states `CRON_SECRET` IS set in Production, so live behavior is DONE, but the code has an unsafe default that will silently disable auth if the var is ever removed. Flag as a code fix, not just a config fact. |
| D12 | No committed secrets | UNVERIFIED | Not checked in this pass — add to verification runbook (§7). |
| D13 | API versions current | PARTIAL | Instagram/Facebook already bumped: `instagram.ts:21-23`, `facebook.ts:25-27` both use `v25.0` (current as of this writing — verify against Meta's changelog periodically). LinkedIn adapter (`linkedin.ts:124`) uses undated `/v2/userinfo`, no `20240601`-style version header found in current code — suggests the earlier dead-lettered version was already fixed, but no version-drift *detection* mechanism exists for next time. |

---

## 3. Priority-ordered workstreams

Ordered by value-per-effort: no-review connectors first, then the one Meta app (unlocks 3 things), then X, then TikTok, interleaved with the zero-cost security/ops fixes that are pure code changes.

### W1 — Close public registration (today, no external dependency)
- Goal: stop uncontrolled signups.
- Files/vars: Vercel Production env `ALLOW_PUBLIC_SIGNUP`, `SIGNUP_ALLOWLIST`; code at `src/lib/signup-policy.ts:43-72`.
- Steps: set `ALLOW_PUBLIC_SIGNUP=false` in Vercel Production env; populate `SIGNUP_ALLOWLIST` with real emails/domains (comma-separated, `@domain.com` for domain match per line 31-36); redeploy or trigger env-only redeploy.
- Owner: human (Vercel dashboard access required) — an agent can prepare the exact CLI commands but should not flip production env vars without the owner's go-ahead given blast radius.
- Blast radius: locks out anyone not on the allowlist, including the owner if they typo their own email — verify allowlist entry before applying.
- Verify: attempt signup with a non-allowlisted email against `/api/auth/signup` (or equivalent), expect the invite-only rejection message (`signup-policy.ts:66-71`); attempt with an allowlisted email, expect success.

### W2 — Fix cron auth default + add job-reclaim (today, no external dependency)
- Goal: cron endpoint never silently unauthenticated; crashed jobs self-heal.
- Files: `src/app/api/cron/publish/route.ts:37-42` (auth), `:65-86` (claim query).
- Steps: change the guard to `if (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`) return 401` (fail closed instead of fail open); add a reclaim clause to the `findMany` — e.g. also select jobs where `status: PROCESSING AND updatedAt < now - LEASE_TIMEOUT`, and reset them to `PENDING` (or increment attempts and retry) before the main claim step.
- Owner: agent (fastify-backend equivalent here is a Next.js API route change) — small, contained, no design review needed given the AGENT-BRIEF constraint list is unaffected.
- Blast radius: low if done correctly; a wrong lease timeout could double-publish a post — mitigate by keeping the existing `platformPostId` idempotency check (`route.ts:111-121`) as the hard backstop, which already prevents re-publish of a post with a stored platform ID.
- Verify: `curl -X POST https://www.socialork.com/api/cron/publish` with no `Authorization` header now always returns 401 regardless of `CRON_SECRET` state; write a test that leaves a job in `PROCESSING` with a stale `updatedAt` and confirms the next cron tick reclaims it.

### W3 — Telegram connector (no app review, fastest win)
- Goal: 7th platform live with least friction — Telegram requires no OAuth review.
- Vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (`credentials.ts:79-98`).
- Steps: create bot via @BotFather (human, needs a Telegram account) → get token; add bot to target channel/group, fetch chat ID (e.g. via `getUpdates`); set both vars in Vercel Production (and Preview, per D7 fix).
- Scopes: none — bot-token auth (`telegram.ts:79`: literal `"bot"`, not a real OAuth scope).
- Owner: human for bot creation (needs Telegram account + channel admin rights), agent for env var wiring.
- Blast radius: low — isolated to one connector.
- Verify: `GET /api/health` shows TELEGRAM `configured=true`; test post via the app's compose flow with `MOCK_SOCIAL_ADAPTERS` off reaches the real Telegram chat.

### W4 — YouTube connector (reuse existing Google Cloud project)
- Goal: add YouTube using the same Google Cloud project already used for Google sign-in — no new account review needed to *start*, though publish scope still needs verification (see landmine below).
- Vars: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` (`credentials.ts:289-308`).
- Redirect URI to register: `https://www.socialork.com/api/social/youtube/callback` (pattern from `status.ts:93-97`).
- Scopes requested (`youtube.ts:54-55`): `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`.
- Steps: in the existing Google Cloud Console project (used for `GOOGLE_CLIENT_ID`), enable YouTube Data API v3 → create a new OAuth client (or reuse — separate client recommended for clarity) → add the redirect URI above → set both vars in Vercel.
- Owner: human (Google Cloud Console access) for API enablement + OAuth client creation; agent for env wiring.
- Blast radius: low.
- Known landmine: `youtube.upload` scope requires the OAuth consent screen to pass Google's "restricted scopes" verification before going out of testing mode for external users — if the app is in "Testing" publish status, only allowlisted test users (max 100) can authorize. Flag for owner: may need to submit for verification before real (non-test) users connect YouTube.
- Verify: `GET /api/health` YOUTUBE `configured=true`; connect flow round-trips through `/api/social/youtube/callback` and stores a token; a real (small, throwaway) video upload succeeds with `MOCK_SOCIAL_ADAPTERS` off.

### W5 — Meta app (Facebook + Instagram + Facebook sign-in, one app)
- Goal: single Meta app unlocks 3 things at once — confirmed by code: NextAuth Facebook provider (`src/lib/auth-providers.ts:64-66,92-94`) falls back to `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` if `FACEBOOK_CLIENT_ID`/`FACEBOOK_CLIENT_SECRET` are unset — so setting only the connector vars also lights up sign-in.
- Vars: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (do not also set `FACEBOOK_CLIENT_ID`/`SECRET` unless intentionally using a different app for sign-in — redundant here); `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (Instagram Graph API uses the same Meta app's App ID/Secret in current Meta API — verify at app-creation time whether Instagram needs its own product config or literally the same ID/secret pair; `.env.example` treats them as separate vars, so populate both even if values end up identical).
- Redirect URIs to register in Meta App > Facebook Login product: `https://www.socialork.com/api/social/facebook/callback`, `https://www.socialork.com/api/social/instagram/callback`, and `https://www.socialork.com/api/auth/callback/facebook` (sign-in).
- Scopes requested — Facebook (`facebook.ts:56-57`): `pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_engagement`. Instagram (`instagram.ts:52-53`): `instagram_basic,instagram_content_publish,instagram_manage_comments,pages_read_engagement,pages_show_list`.
- API version pin: both adapters hardcode `v25.0` (`facebook.ts:25-27`, `instagram.ts:21-23`) — current as of writing; Meta retires versions on a ~2-year cycle, build the version-drift check from §4 landmine note.
- Requires app review: YES for both `pages_manage_posts` and `instagram_content_publish` — these are restricted permissions requiring Meta App Review with a screencast + use-case justification before *any* non-admin/non-tester account can use them in Live mode. In Development mode, only users with a role on the app (Admin/Developer/Tester) can authorize.
- Owner: human (Meta Business account, app creation, App Review submission — this is a multi-day external review, not agent-executable).
- Blast radius: none until submitted; once Live, misconfigured scopes could get the app rejected or rate-limited — no destructive risk.
- Verify: `/api/health` FACEBOOK and INSTAGRAM `configured=true`; Facebook sign-in button completes login; a real post to a test Page succeeds with `MOCK_SOCIAL_ADAPTERS` off, in Development mode with a Tester-role account, before submitting for App Review.

### W6 — X/Twitter connector
- Goal: add X — scoped after Meta since it needs a developer account tier decision.
- Vars: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` (`credentials.ts:149-168`).
- Redirect URI: `https://www.socialork.com/api/social/twitter/callback`.
- Scopes requested (`twitter.ts:71`): `tweet.read tweet.write users.read offline.access`.
- Requires review: no formal app review for OAuth 2.0 user-context posting, but `tweet.write` requires at minimum the Free tier's "Write" access level (available) — however the Free tier has a very low monthly post cap (historically ~1,500 tweets/month, app-wide) and no Search; if volume exceeds that, Basic tier is $200/mo. Flag as a paid-plan risk per the no-paid-plans constraint — do not upgrade without owner sign-off.
- Owner: human (X Developer Portal account, app creation) for setup; agent for env wiring and adapter testing.
- Blast radius: low; rate-limit exhaustion just blocks posting until reset, no data risk.
- Verify: `/api/health` TWITTER `configured=true`; real test post via `MOCK_SOCIAL_ADAPTERS` off publishes and shows in X API response with a tweet ID.

### W7 — TikTok connector (last — heaviest review)
- Goal: add TikTok — placed last because it has the strictest content-posting audit.
- Vars: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (`credentials.ts:254-273`).
- Redirect URI: overridable via `TIKTOK_REDIRECT_URI`, else default pattern `https://www.socialork.com/api/social/tiktok/callback`.
- Scopes requested (`src/lib/social/tiktok/constants.ts:40-53`, joined in `tiktok.ts:141`): `user.info.basic, user.info.profile, video.upload, video.publish`.
- Requires review: YES — TikTok's `video.publish` scope requires app audit before it works outside a small set of registered test users (sandbox mode), and TikTok additionally reviews content-posting apps for compliance with their Community Guidelines before allowing direct-publish (unaudited apps get "SELF_ONLY" / draft-only posting instead of direct publish).
- Owner: human (TikTok for Developers account, app registration, audit submission).
- Blast radius: none pre-launch; post-audit, a rejected audit just leaves the connector unusable, no destructive effect.
- Verify: `/api/health` TIKTOK `configured=true`; in sandbox, a registered test-user account completes OAuth and a test video reaches `video.publish` (may land as draft/private until audited).

### W8 — Media storage (parallel with any of the above, no dependency)
- Goal: stop base64-in-Postgres.
- Var: `BLOB_READ_WRITE_TOKEN`. File: `src/app/api/media/route.ts:76-89` already supports the blob path — no code change needed, only the env var.
- Steps: create a Vercel Blob store (Vercel dashboard, free tier available) → copy the read-write token → set `BLOB_READ_WRITE_TOKEN` in Vercel Production + Preview.
- Owner: human (Vercel dashboard) for store creation; trivial.
- Blast radius: none — existing base64 rows are unaffected; only new uploads switch path.
- Verify: upload a new media asset, confirm `media_assets.url` (or via `/api/media` response) is an `https://*.blob.vercel-storage.com/...` URL, not `data:`.

### W9 — AI key (parallel, no dependency)
- Goal: real AI generation instead of silent mock fallback.
- Var: `OPENAI_API_KEY`; optional `OPENAI_MODEL` (defaults `gpt-4o-mini`, `ai.ts:274,379`).
- Steps: create/reuse an OpenAI API key (owner's OpenAI account, has a free trial credit or pay-as-you-go — flag as a real cost if usage grows) → set in Vercel Production + Preview.
- Owner: human (OpenAI account, billing).
- Blast radius: low; if the key is exhausted/invalid, `isOpenAIAvailable()` gate (`ai.ts:33-35`) still falls back to mock rather than crashing user-facing flows — confirm this fallback stays intact.
- Verify: call the AI generation endpoint and confirm output is not the deterministic mock text (compare against mock generator output at `ai.ts:212,369`).

### W10 — LinkedIn token longevity (before 2026-11-11)
- Goal: don't lose 3 connected LinkedIn accounts silently at expiry.
- Files: `src/lib/adapters/linkedin.ts:42` (scope), `:77,114` (refresh storage), `schema.prisma:132`.
- Steps: LinkedIn's standard 3-legged OAuth access tokens (60-day, refresh tokens 1-year) require the app to be granted the "Programmatic Refresh" (formerly "Marketing Developer Platform"-adjacent) access — this is a LinkedIn Developer Portal product-access request, not a code change. If that access is not obtainable, plan for a scheduled reminder well before 2026-11-11 to have each of the 3 connected users manually re-authorize.
- Owner: human (LinkedIn Developer Portal, app review for refresh-token product) — outcome uncertain, LinkedIn may deny it depending on app review tier.
- Blast radius: none — worst case is the current manual-reconnect status quo.
- Verify: after any grant, a test account's token refresh actually rotates `SocialAccount.refreshToken`/`expiresAt` via a cron-triggered refresh path (add one if none exists — NOT FOUND in this pass, so likely MISSING entirely and worth its own small workstream if LinkedIn grants refresh access).

### W11 — Preview environment parity (parallel, no dependency)
- Goal: PR previews get DB + auth for real testing.
- Steps: for each of the 14 existing Production vars, add to Preview scope too (`vercel env add <NAME> preview`, or dashboard checkbox) — consider a separate preview database/branch (Supabase supports branching) rather than pointing previews at the production DB.
- Owner: human (Vercel + Supabase access) given the blast radius below.
- Blast radius: MEDIUM if Preview is pointed at the same `DATABASE_URL` as Production — a bad PR could write test data into production tables. Strongly prefer a separate Supabase branch/database for Preview.
- Verify: open a PR, confirm the preview deployment can log in and read real-shaped data from its own (non-production) database.

---

## 4. Per-connector specification

| Platform | Env vars | Console | Redirect URI | Scopes (from code) | Review needed? | Free tier limit | Landmine |
|---|---|---|---|---|---|---|---|
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | LinkedIn Developer Portal | `/api/social/linkedin/callback` | `openid profile email w_member_social` (`linkedin.ts:42`) | Standard tier works for `w_member_social`; refresh-token product needs separate grant | Not publicly documented; historically generous for basic posting | Already burned once: `20240601`-dated API version was dead-lettered in prod. No refresh token obtainable without extra grant — accounts expire and need manual reconnect (W10). Add a scheduled check against LinkedIn's version deprecation calendar. |
| Twitter/X | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | X Developer Portal | `/api/social/twitter/callback` | `tweet.read tweet.write users.read offline.access` (`twitter.ts:71`) | No formal review for OAuth 2.0 write access, but tier gating applies | Free tier: very low monthly post cap, app-wide | Volume growth forces a paid tier ($200/mo Basic) — flag to owner before hitting cap, per no-paid-plans constraint. |
| Instagram | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Meta for Developers (same app as Facebook, W5) | `/api/social/instagram/callback` | `instagram_basic,instagram_content_publish,instagram_manage_comments,pages_read_engagement,pages_show_list` (`instagram.ts:52-53`) | YES — `instagram_content_publish` is restricted, requires Meta App Review | Standard Graph API rate limits, no special cap for basic posting | Requires a connected Facebook Page (Instagram posting via Graph API goes through the linked Page) — verify each user has one before promising Instagram support. |
| Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Meta for Developers (same app as Instagram, W5) | `/api/social/facebook/callback` (+ `/api/auth/callback/facebook` for sign-in) | `pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata,pages_manage_engagement` (`facebook.ts:56-57`) | YES — `pages_manage_posts` restricted, requires App Review | Standard Graph API limits | API version hardcoded `v25.0` (`facebook.ts:25-27`) — already burned once on retired `v11.0`; add version-drift detection (below). |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (optional `TIKTOK_REDIRECT_URI` override) | TikTok for Developers | `/api/social/tiktok/callback` (or override) | `user.info.basic, user.info.profile, video.upload, video.publish` (`tiktok/constants.ts:40-53`) | YES — content-posting audit; unaudited apps limited to sandbox/self-only visibility | Sandbox: fixed small test-user list | Direct publish silently degrades to "SELF_ONLY"/draft if unaudited — don't promise public posting until audit passes. |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Google Cloud Console (reuse existing project) | `/api/social/youtube/callback` | `youtube.upload, youtube.readonly, youtube.force-ssl` (`youtube.ts:54-55`) | YES for restricted-scope verification once out of Testing mode (100-user cap in Testing) | YouTube Data API v3 default quota: 10,000 units/day (a single upload costs ~1,600 units — roughly 6 uploads/day before quota exhaustion) | Quota is shared with any other API use in the same Google Cloud project — check current Google sign-in usage doesn't already consume it. |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | @BotFather (Telegram app) | none (bot-token auth, `telegram.ts:79` literal `"bot"`) | none (not OAuth) | No | Telegram Bot API: generous, no hard published post-rate cap for normal use | Bot must be added as admin to target channel/group or `getUpdates`/send calls fail silently with a permissions error. |

**API-version-drift detection (applies to LinkedIn, Facebook, Instagram at minimum):** add a lightweight scheduled check (weekly cron or manual quarterly task) that calls each hardcoded versioned endpoint and confirms a non-error response, or subscribes to each platform's developer changelog. Concretely: a small script hitting `GRAPH_API_URL` (`facebook.ts:23`, `instagram.ts:23`) with a harmless read call, alerting if Meta returns a deprecation warning header or 400.

---

## 5. Operational readiness

- **Media storage**: MISSING blob token (W8) — base64-in-Postgres today; no `media_assets` rows yet in prod so no migration debt exists *yet*, but block image/video publishing features until fixed.
- **AI keys**: MISSING (W9) — currently silently serving mock content, which could reach real users without their knowledge; treat as a correctness bug, not just a missing feature.
- **Error visibility**: no error-tracking integration (e.g. Sentry) found in this pass — UNVERIFIED, worth a quick `grep -r "sentry\|@sentry" src/` to confirm one way or the other before deciding whether to add one.
- **Scheduled-job observability**: cron retry/dead-letter logic is solid (3 attempts, exponential backoff) but invisible outside Vercel logs (D9, MISSING) — cheapest fix is a Slack/email webhook fired from `handleFailure()` (`cron/publish/route.ts:349-414`) on final dead-letter.
- **Token rotation/refresh**: no refresh cron found for any platform in this pass — LinkedIn (W10) is the immediate concrete risk (2026-11-11); the other 6 platforms will have the same problem once connected, so build one generic refresh-check cron rather than one-off fixes per platform.
- **Backups**: Supabase Postgres — UNVERIFIED whether point-in-time recovery or scheduled backups are enabled on the current (non-paid, per constraint 7) Supabase plan; Supabase's free tier does NOT include PITR — flag to owner as an accepted risk or a reason to reconsider the no-paid-org constraint specifically for backups, not general compute.
- **Idempotency on deploy-mid-job**: MISSING reclaim mechanism (D10) — real risk window is any deploy that lands while a job is `PROCESSING`. The `platformPostId` check (`route.ts:111-121`) is a correctness backstop against double-publish, but the job itself will simply never retry (silent stall) until W2 lands.

---

## 6. Security posture

- **Registration policy**: currently open (`ALLOW_PUBLIC_SIGNUP=true` in Production) despite this being a private workspace tool — close it (W1) before any wider rollout; this is the single highest-priority security fix.
- **Role model**: 11 users, 2 ADMIN / 1 MANAGER / 7 EDITOR / 1 CLIENT (live DB) — role enforcement itself was not audited in this pass; recommend a `security` agent pass specifically on role-gated routes (`/api/posts/*`, admin endpoints) before opening registration further.
- **Secret handling**: `TOKEN_ENCRYPTION_KEY` is used to encrypt stored social tokens (`.env.example:35-36` warns changing it invalidates every stored token) — confirm this key itself is backed up outside Vercel env (e.g. a password manager), since losing it means every connected account needs reconnecting.
- **Cron endpoint fail-open bug**: `cron/publish/route.ts:37-42` only checks the bearer token *if* `CRON_SECRET` is set — this is a live footgun even though `CRON_SECRET` is currently set in prod; fix in W2 regardless of current safety, since a future env var removal would silently disable auth with no warning.
- **What must close before real users arrive**: W1 (open registration) and W2 (cron auth fail-open) are both should-fix-now items independent of any connector work — neither depends on a third party.
- **Undisclosed finding for the owner**: the AI mock-fallback behavior (`ai.ts:33-35`) means that with `OPENAI_API_KEY` unset, users calling AI-assisted content generation today are silently receiving deterministic mock text with no error or warning surfaced to them — this could be mistaken for genuine AI output. Recommend either surfacing a "mock mode" banner in the UI or prioritizing W9.

---

## 7. Verification runbook

Run in order. Each step's "expected" is what should be true once the plan lands; run baseline first to know current state.

```bash
# 1. Health / connector status
curl -s https://www.socialork.com/api/health | jq .
# expect (target state): all 7 connectors configured=true

# 2. Cron auth (before W2 fix, this may currently be safe only because CRON_SECRET is set — verify it stays 401)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.socialork.com/api/cron/publish
# expect: 401

curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.socialork.com/api/cron/publish -H "Authorization: Bearer $CRON_SECRET"
# expect: 200 (do not run against prod without knowing what jobs are queued — this actually executes publishing)

# 3. Registration gate
curl -s -X POST https://www.socialork.com/api/auth/signup -H "Content-Type: application/json" \
  -d '{"email":"not-on-allowlist@example.com","password":"..."}'
# expect (post-W1): 4xx with invite-only message from signup-policy.ts:66-71

# 4. Approval gate — attempt to bypass (should be impossible via UI, confirm via API)
# create a DRAFT post, then attempt schedule endpoint directly:
curl -s -X POST https://www.socialork.com/api/posts/<id>/schedule -H "Authorization: Bearer <session>"
# expect: 400 "Post must be approved before scheduling. Current status: DRAFT"

# 5. Media storage
# upload a file via the app UI, then check the stored URL:
psql "$DATABASE_URL" -c "select url from media_assets order by \"createdAt\" desc limit 1;"
# expect (post-W8): url starts with https://*.blob.vercel-storage.com/, not data:

# 6. Secrets never committed
git log -p --all -- .env .env.local .env.production 2>/dev/null | grep -E "sk-|_SECRET=[^ ]|_TOKEN=[^ ]" | head
# expect: no output (only .env.example with blank/placeholder values should exist in history)

# 7. Preview env parity (post-W11)
vercel env ls preview
# expect: same 14+ var names present as `vercel env ls production`

# 8. Per-connector live test (repeat per platform after each workstream, MOCK_SOCIAL_ADAPTERS off)
curl -s https://www.socialork.com/api/health | jq '.connectors.linkedin, .connectors.telegram, .connectors.youtube, .connectors.facebook, .connectors.instagram, .connectors.twitter, .connectors.tiktok'
# expect: configured=true for each as it's completed; then a real post through the compose UI shows a platform post ID in the posts table
```

---

## 8. Open questions for the owner

1. Is a **separate Supabase branch/database for Preview** acceptable, or must Preview stay on production data despite the blast-radius risk noted in W11?
2. Does the owner want to pursue **LinkedIn's refresh-token product** (W10), or is a scheduled manual-reconnect reminder for the 3 existing accounts (and any future ones) an acceptable permanent posture?
3. For **X/Twitter**, is the Free tier's low monthly post cap acceptable long-term, or should the owner budget for Basic ($200/mo) if usage grows — this is a real paid-plan decision the plan cannot make unilaterally per constraint 6.
4. Should **Instagram/Facebook App Review** be submitted immediately (multi-day external process, human-only), or held until other workstreams land, given it's the single biggest unlock (3 things at once)?
5. Is **Supabase's free-tier backup/PITR gap** an accepted risk, or does it change the "no paid Supabase org" constraint specifically for backup purposes (as opposed to compute/storage)?
6. Should the AI mock-fallback (`ai.ts:33-35`) get a **visible "mock mode" UI indicator** now, independent of when `OPENAI_API_KEY` is actually added, so current users aren't silently served fake AI output?
