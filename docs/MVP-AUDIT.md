# SocialOrc — MVP Integration & Functionality Gap Audit

**Audited at:** commit `e4605e5`, branch `main`
**Method:** every adapter, every API route, Prisma schema, `.env.example`, live production DB (Supabase) and live HTTP endpoints. No file modified.
**Scope:** functional MVP readiness only. Security hardening, rate limiting, monitoring, backups and refactoring deliberately excluded.

---

## 1. Verdict

| Area | Verdict |
|---|---|
| Core functionality | **~70%** |
| Integrations | **1 / 7 working** (LinkedIn) |
| AI | **MOCKED** (silently) |
| Media | **PARTIAL** |
| Scheduling | **WORKING** (worker proven firing) — but publish can fake-succeed |
| Real publishing | **PARTIAL** (1 of 7 platforms, text+single image only) |

The single most important structural finding: **the product can fake success.** Publishing falls back to a mock adapter when a platform has no credentials, marks the post `PUBLISHED`, and writes a `mock_post_*` id — so a broken integration looks like a working one.

---

## 2. The seven integrations

Redirect URI pattern: `https://www.socialork.com/api/social/<platform>/callback` (`src/lib/social/status.ts:93-97`, `src/lib/social/approval.ts:36`).

| Platform | Env vars | Code | Scopes (from code) | Console | Review needed | Media actually implemented | Status |
|---|---|---|---|---|---|---|---|
| **LinkedIn** | `LINKEDIN_CLIENT_ID/SECRET` | `linkedin.ts` (235 ln) | `openid profile email w_member_social` (`:42`) | LinkedIn Dev Portal | no | text + 1 image (`multiImage`). **video declared, not implemented** | **WORKING** |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `telegram.ts:108` + `telegram/connect/route.ts` | none (bot token) | @BotFather | no | text + 1 image (`sendPhoto`). **video declared, no `sendVideo`** | CONFIGURATION_MISSING |
| **YouTube** | `YOUTUBE_CLIENT_ID/SECRET` | `youtube.ts:181` | `youtube.upload`, `youtube.readonly`, `youtube.force-ssl` (`:54-55`) | Google Cloud (reuse existing project) | **YES** — restricted scope verification | video only (resumable upload) ✓ | CONFIGURATION_MISSING + EXTERNAL_REVIEW_REQUIRED |
| **Facebook** | `FACEBOOK_APP_ID/SECRET` | `facebook.ts:195` | `pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata, pages_manage_engagement` (`:56-57`) | Meta for Developers | **YES** — `pages_manage_posts` needs App Review | text + **1 image only** (`/photos`). **video declared, sent to /photos; carousel declared, extras dropped** | CONFIGURATION_MISSING + EXTERNAL_REVIEW_REQUIRED |
| **Instagram** | `INSTAGRAM_APP_ID/SECRET` | `instagram.ts:226` | `instagram_basic, instagram_content_publish, instagram_manage_comments, pages_read_engagement, pages_show_list` (`:52-53`) | Meta (same app) | **YES** — `instagram_content_publish` needs App Review | **image required** (`image_url` only). **video declared, not implemented; carousel declared, extras dropped** | CONFIGURATION_MISSING + EXTERNAL_REVIEW_REQUIRED |
| **X/Twitter** | `TWITTER_CLIENT_ID/SECRET` | `twitter.ts:197` | `tweet.read tweet.write users.read offline.access` (`:71`) | X Developer Portal | no formal review | **text only — media completely ignored (0 media lines in createPost)** | CONFIGURATION_MISSING + CODE_INCOMPLETE |
| **TikTok** | `TIKTOK_CLIENT_KEY/SECRET` (+ optional `TIKTOK_REDIRECT_URI`) | `tiktok.ts:495` | `user.info.basic, user.info.profile, video.upload, video.publish` | TikTok for Developers | **YES** — app audit; unaudited apps degrade to `SELF_ONLY` | video only ✓ (reads creator privacy options) | CONFIGURATION_MISSING + EXTERNAL_REVIEW_REQUIRED |

### OAuth lifecycle per platform
All seven have a callback route present: `social/{facebook,instagram,linkedin,telegram,tiktok,twitter,youtube}/callback` plus `social/mock/callback`. The shared handshake (`social/connect/route.ts`) correctly **refuses to start** for an unconfigured platform:

```ts
503 { error: "FACEBOOK credentials not configured", missing: ["FACEBOOK_APP_ID","FACEBOOK_APP_SECRET"] }
```

PKCE is supported and parked in the state cookie (`social/connect/route.ts:47-72`). LinkedIn's full round-trip is proven in production (3 accounts connected, real tokens, `tokenExpiresAt 2026-11-11`). Telegram uses a token-based handshake instead of OAuth and verifies the bot token against Telegram's API (`telegram/connect/route.ts:9-16`) — no OAuth review needed.

---

## 3. AI

**Verdict: MOCKED in production.**

- OpenAI is genuinely integrated: `src/lib/ai.ts:37-48` builds a real client, with `OPENAI_BASE_URL` (`:44`) and `OPENAI_MODEL` supported → **the provider and model are configurable**.
- `isOpenAIAvailable()` (`:33-35`) → `Boolean(process.env.OPENAI_API_KEY)`.
- **`src/lib/ai.ts:212` and `:369`:** `if (forceMock || !isOpenAIAvailable())` → returns **deterministic mock copy with no error and no UI indicator**.
- `OPENAI_API_KEY` is **absent from all Vercel scopes** (verified: 14 vars, none AI).
- The Brain module has a second path: `AI_API_KEY || OPENAI_API_KEY` (`src/lib/brain/ai.ts:55`), which *does* throw a clear error (`:31`), and `brain/embed.ts:135` silently disables embeddings without a key.
- AI endpoints: `/api/ai-studio`, `/api/posts/generate`, `/api/posts/[id]/cascade` (`lib/cascade.ts:238` `hasAICapability()`), brains, growth-brief, traction.

**Trace:** User → AI Studio → `/api/ai-studio` → `generateVariants()` → `isOpenAIAvailable()==false` → **mock generator** → DB/UI shows content that looks real.

**Separation:** REAL AI = none in production today. MOCK AI = all generation endpoints. BROKEN = embeddings (silently off).

---

## 4. Media

| Stage | State |
|---|---|
| Upload route | `src/app/api/media/route.ts` — auth ✓, 100 MB cap (`:51`), MIME allowlist jpeg/png/gif/webp/mp4/quicktime/webm (`:59-67`) |
| Storage | **Vercel Blob path exists but is OFF** (`:79`). Falls back to **base64 data URL stored in Postgres** (`:86-88`) |
| DB record | `MediaAsset` created either way (`:91-100`) |
| URL | `data:image/...;base64,...` without blob token — **not usable by social APIs** |
| To post | `postMedia` rows → `mediaUrls` → `adapter.createPost` (`posts/[id]/publish/route.ts:133-142`) |

**What prevents real publishing:**
1. **No `BLOB_READ_WRITE_TOKEN`** → data-URI media. Social platforms require a fetchable https URL; data URIs are rejected or far over size limits. `media_assets` is currently 0, so no migration debt yet.
2. **MIME validation silently skipped for data URLs** — `BasePlatformAdapter.inferMimeType()` (`base.ts:37-52`) infers from the URL *extension*; a `data:` URI yields `null`, and `validatePostContent` skips the check when `mime === null` (`:94`).
3. **Per-platform size limits never enforced** — `PLATFORM_CONFIGS` declares `maxImageSizeMb` (LinkedIn 5) / `maxVideoSizeMb` (LinkedIn 200) but nothing checks them; the only limit is the route's 100 MB.
4. **Video/carousel are declared but unimplemented** — see §2 per-platform, and §9.

---

## 5. Post lifecycle

`PostStatus` = `DRAFT → PENDING_APPROVAL → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED | FAILED` (`prisma/schema.prisma:265-273`).

| Transition | Route | State |
|---|---|---|
| create / DRAFT | `/api/posts`, `/dashboard/create` | ✓ |
| edit | `/dashboard/drafts/[id]` (`draft-edit-form.tsx`) | ✓ |
| submit for approval | `/api/posts/[id]/approve` `action:"submit"` (`posts:submit`) | ✓ |
| approve | same route, `posts:approve` | ✓ |
| schedule | `/api/posts/[id]/schedule` — requires `APPROVED` + creates `ScheduledJob` | ✓ |
| reschedule | `/api/posts/[id]/reschedule` (PATCH) | ✓ |
| publish now | `/api/posts/[id]/publish` (`publish-now-button.tsx`) | ✓ |
| retry failed | `/api/posts/[id]/retry` (`retry-failed-button.tsx`, `lib/failed-retry.ts`) | ✓ |
| cron publish | `/api/cron/publish` | ✓ |
| UI pages | `create`, `drafts/[id]`, `approvals`, `queue`, `calendar`, `ai-studio`, `feed` | ✓ |

**No transition is missing.** The gate is intact (approve → schedule → cron each re-check status). Two functional defects:
- **`PUBLISHING` is not terminal-recoverable** — a crash/deploy mid-job leaves the post stuck in `PUBLISHING` forever (§6).
- **Publish can fake-succeed** via the mock adapter (§9, P0-1).

---

## 6. Scheduling & publishing worker

- **Selection:** `ScheduledJob` where `status=PENDING`, `scheduledAt <= now`, `attempts < 3`, oldest first, `take: 10` (`cron/publish/route.ts:65-73`).
- **Trigger:** Vercel cron `*/5 * * * *` on `/api/cron/publish` (`vercel.json:1-8`) — **registered and proven firing** (a job was attempted 3× and dead-lettered 2026-09-12 16:55).
- **Claim:** flips to `PROCESSING` + `attempts++` before work (`:79-86`).
- **Adapter call:** `getAdapter(post.platform, { useMockIfUnconfigured: true })` (`:163`) → **mock fallback (P0-1)**.
- **Token handling:** refresh-before-send when near expiry; non-refreshable + expired → `handleFailure` (`:173-216`).
- **Failures:** exponential backoff 30s → 1m → dead-letter after 3 (`MAX_ATTEMPTS=3`, `:29-33`).
- **Success:** writes `PUBLISHED` + `platformPostId` + `platformPostUrl`; idempotency via the stored `platformPostId` (`:111-121`).
- **Stuck posts:** **yes possible** — nothing ever reclaims `PROCESSING`; a deploy landing mid-publish orphans the job permanently (0 orphans right now).

**Can a user schedule a post and have it appear on the real platform today?** Only for **LinkedIn** — proven: 4 real posts, ids `urn:li:share:7504588533593063424` etc. For the other six: no (no credentials). And if credentials vanish while an account row remains, the worker would report success without publishing anywhere.

---

## 7. Environment variable matrix

Legend: **SET** = present in Vercel Production · **MISSING** = required, absent · **OPT** = optional.

| Group | Variable | Status | Purpose |
|---|---|---|---|
| Database | `DATABASE_URL` | SET | runtime (transaction pooler 6543) |
| Database | `DIRECT_URL` | SET | migrations (session pooler 5432) |
| Auth | `NEXTAUTH_SECRET` | SET | session signing |
| Auth | `NEXTAUTH_URL` | SET | canonical origin |
| Auth | `APP_URL` | SET | approval links |
| Auth | `TOKEN_ENCRYPTION_KEY` | SET | encrypts stored social tokens |
| Auth | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | SET | Google sign-in (live) |
| Cron | `CRON_SECRET` | SET | worker auth |
| Signup | `ALLOW_PUBLIC_SIGNUP` | SET (`true`) | currently open |
| Signup | `SIGNUP_ALLOWLIST` | SET | invites |
| Safety | `MOCK_SOCIAL_ADAPTERS` | SET (not `"true"`) | mock switch |
| **AI** | **`OPENAI_API_KEY`** | **MISSING** | all AI generation |
| AI | `OPENAI_MODEL`, `OPENAI_BASE_URL`, `AI_API_KEY` | OPT / unset | model + provider override |
| **Storage** | **`BLOB_READ_WRITE_TOKEN`** | **MISSING** | media hosting |
| LinkedIn | `LINKEDIN_CLIENT_ID/SECRET` | SET | ✓ working |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | **MISSING** | bot connector |
| **YouTube** | `YOUTUBE_CLIENT_ID/SECRET` | **MISSING** | video |
| **Facebook** | `FACEBOOK_APP_ID/SECRET` | **MISSING** | page publishing + FB sign-in |
| **Instagram** | `INSTAGRAM_APP_ID/SECRET` | **MISSING** | image publishing |
| **X/Twitter** | `TWITTER_CLIENT_ID/SECRET` | **MISSING** | text posts |
| **TikTok** | `TIKTOK_CLIENT_KEY/SECRET` | **MISSING** | video |
| TikTok | `TIKTOK_REDIRECT_URI` | OPT | redirect override |
| Auth (FB) | `FACEBOOK_CLIENT_ID/SECRET` | OPT | falls back to `FACEBOOK_APP_ID/SECRET` (`auth-providers.ts`) |
| Dev | `NEXT_PUBLIC_DEV_ROLE_LOGIN`, `ALLOW_DEV_ROLE_LOGIN` | unset | role login, 404 unless enabled |

All 14 set vars are **Production scope only** — no Preview scope exists.

---

## 8. External setup vs code changes

| Kind | Required for |
|---|---|
| **CODE CHANGE** | P0-1 mock publish fallback · P0-3 video branches · P0-4 carousel · P0-5 media validation/size · P0-6 `PROCESSING` reclaim |
| **ENV CONFIG (Vercel)** | `BLOB_READ_WRITE_TOKEN`, `OPENAI_API_KEY`, all 12 connector vars, preview-scope parity |
| **TELEGRAM BOT SETUP** | @BotFather → `/newbot` → token; add bot to channel → chat id |
| **GOOGLE CLOUD CONFIG** | enable YouTube Data API v3; new OAuth client; add `/api/social/youtube/callback`; submit for verification (restricted scope) |
| **META CONFIG** | create app; add Facebook Login; add all three redirect URIs; App Review for `pages_manage_posts` + `instagram_content_publish`; an IG Business/Creator account linked to a FB Page |
| **X DEVELOPER CONFIG** | create app; OAuth 2.0 client; add `/api/social/twitter/callback`; confirm write access tier |
| **TIKTOK DEVELOPER CONFIG** | create app; add `/api/social/tiktok/callback`; request `video.publish`; submit audit |
| **OPENAI CONFIG** | create API key (billing required beyond trial credit) |
| **VERCEL CONFIG** | create Blob store; decide preview database strategy |
| **SUPABASE CONFIG** | optional: separate branch/database for preview |

**Nothing else needs a code change to become functional** — all seven connectors are implemented and would work once credentials exist.

---

## 9. Mock & fake-success inventory

| # | File:line | What is mocked | Activates when | Disable by | Affects production? |
|---|---|---|---|---|---|
| 1 | `src/lib/adapters/index.ts:12,38-40` | Entire adapter set replaced by `MockAdapter` | `MOCK_SOCIAL_ADAPTERS === "true"` | set var to `false`/unset | **No** (var isn't `"true"`) |
| 2 | **`src/app/api/posts/[id]/publish/route.ts:77`** | **Publish succeeds against mock** when platform credentials missing | platform unconfigured **and** an account row exists | remove `useMockIfUnconfigured` | **YES — latent fake success** |
| 3 | **`src/app/api/cron/publish/route.ts:163`** | **Scheduled publish fake-succeeds** | same | same | **YES — latent** |
| 4 | `src/lib/social/engagement-api.ts:143` | Engagement API against mock | platform unconfigured | same | **YES — latent** |
| 5 | `src/app/api/social/engagement/capabilities/route.ts:27` | Capability report from mock | platform unconfigured | same | YES — latent |
| 6 | `src/lib/adapters/mock.ts:44-46` | `validateCredentials()` always returns `valid: true` | whenever mock is selected | — | only via #1–#5 |
| 7 | `src/lib/adapters/mock.ts:92,99-102,94` | Fabricates `platformPostId: mock_post_<PLATFORM>_<ts>`, URL `https://mock.<platform>.com/post/...`, logs `[MOCK …]` | mock selected | — | only via #1–#5 |
| 8 | `src/app/api/social/mock/callback/route.ts:15` | Fake OAuth account creation | `MOCK_SOCIAL_ADAPTERS === "true"` | var off | **No** (redirects with `error=mock_mode_disabled`) |
| 9 | `src/lib/inbox/adapters.ts` (many: `:105,145,180,215,250,285,320`) | Real-platform inbox = `Not implemented`; returns mock data when `MOCK_MODE` | always for real platforms | implement, or use mock mode | **YES** — inbox is stubbed for real accounts |
| 10 | `src/lib/ai.ts:212,369` | Deterministic AI copy | `!OPENAI_API_KEY` | set the key | **YES — AI is mocked today** |
| 11 | `src/lib/cascade.ts:238` | Cascade uses mock when no AI | no AI key | set the key | **YES** |
| 12 | `src/app/api/dev/login-as/route.ts:15-17` | Dev role login | `ALLOW_DEV_ROLE_LOGIN` enabled (404 otherwise) | leave unset | No |
| 13 | `src/lib/inbox/mock-data.ts` | Fake inbox content | mock paths | — | only via #9 |
| 14 | `src/components/dashboard/competitor-cards.tsx:61` | "Stub competitive intel" | always | — | Yes (cosmetic/stub) |
| 15 | `src/components/dashboard/locale-variants.tsx:25`, `src/lib/localization/types.ts:14` | "Stub localization … never a live translation API" | always | — | Yes (stub feature) |
| 16 | `src/lib/experiments.ts:2,21,519,541` | P2 experiment framework stub | always | — | Yes (stub) |

**Fake-success fingerprint:** `Post.platformPostId LIKE 'mock_post_%'` or `platformPostUrl LIKE '%mock.%'`. Live check: **0 occurrences** (all 4 published posts carry real `urn:li:share:` ids) — the hazard exists but has not yet fired.

---

## 10. End-to-end MVP test matrix

| # | Flow | Steps | Expected | Current result |
|---|---|---|---|---|
| T1 | LinkedIn text post | create → approve → schedule +2min → wait cron → check profile | post visible, id `urn:li:share:*` | **PASS** (4 real posts) |
| T2 | LinkedIn image post | upload image + attach → publish now | image post live | NOT TESTED (needs blob token) |
| T3 | LinkedIn video post | attach mp4 → publish | video post live | **FAIL BY DESIGN** — no video branch |
| T4 | Telegram text | connect bot → publish | message in chat | BLOCKED (no token) |
| T5 | Telegram video | attach mp4 → publish | video in chat | **FAIL** — `sendPhoto` only |
| T6 | X text | connect → publish | tweet id | BLOCKED (no credentials) |
| T7 | X image | attach image → publish | tweet with image | **FAIL** — media dropped silently |
| T8 | Facebook text | connect → publish | FB post id | BLOCKED (no creds + App Review) |
| T9 | Facebook image | attach image | photo post | BLOCKED + only 1 image supported |
| T10 | Facebook video | attach mp4 | video post | **FAIL** — sent to `/photos` |
| T11 | Instagram image | attach image | IG post | BLOCKED (no creds + review) |
| T12 | Instagram carousel | attach 3 images | carousel | **FAIL** — only `mediaUrls[0]` used |
| T13 | YouTube video | attach mp4 | upload | BLOCKED (no creds + verification) |
| T14 | TikTok video | attach mp4 | post (or SELF_ONLY) | BLOCKED (no creds + audit) |
| T15 | AI generate | AI Studio → generate | real model output | **FAIL** — mock output |
| T16 | Media upload | upload png | `https://*.blob.vercel-storage.com/...` | **FAIL** — base64 data URL |
| T17 | Schedule + auto-publish | schedule → wait | auto PUBLISHED | **PASS** path exists; worker proven firing |
| T18 | Retry a failed post | mark FAILED → retry | re-queued | code path present |
| T19 | Publish unconfigured platform | publish to FB now | error | **RISK** — would fake-succeed if an account row exists |
| T20 | Crash mid-job | kill worker during publish | job reclaimed | **FAIL** — stuck `PROCESSING` forever |

---

## 11. MVP GAPS

### P0 — Must fix before the MVP works

**P0-1 · Publishing can silently fake-succeed**
- **Problem:** publish resolves the adapter with `useMockIfUnconfigured: true`; when a platform has no credentials but an account row exists, the mock adapter returns `success: true` with `platformPostId: mock_post_*` and a `mock.<platform>.com` URL. The post is marked `PUBLISHED`.
- **Why it matters:** the product lies. A user sees "Published" for a post that reached no platform — the exact "configured=true but broken" failure mode.
- **Exact file/code:** `src/app/api/posts/[id]/publish/route.ts:77`; `src/app/api/cron/publish/route.ts:163`; `src/lib/social/engagement-api.ts:143`; `src/app/api/social/engagement/capabilities/route.ts:27`
- **Env vars:** none
- **External setup:** none
- **Recommended fix:** drop `useMockIfUnconfigured` at all four call sites (fail loudly with the platform's missing vars). If a mock path is still wanted for dev, gate it on `NODE_ENV !== "production"`.
- **Verify:** publish to an unconfigured platform → expect an explicit error, never `PUBLISHED`; `select count(*) from "Post" where "platformPostId" like 'mock_%'` = 0.

**P0-2 · Only 1 of 7 platforms can actually publish**
- **Problem:** six connectors lack credentials; three of them additionally cannot post publicly for non-admin users until external review passes.
- **Why it matters:** a multi-platform scheduler publishing to one platform is not an MVP.
- **Exact file/code:** `src/lib/adapters/credentials.ts:79-290` (validation per platform)
- **Env vars:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `YOUTUBE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`, `INSTAGRAM_APP_ID/SECRET`, `TWITTER_CLIENT_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`
- **External setup:** see P1-1 … P1-4
- **Recommended fix:** configure the no-review connectors first (Telegram, X), start the review-gated ones immediately because they queue in days.
- **Verify:** `GET /api/health` → `configured=true` per platform, then a real post id in the DB.

**P0-3 · Video is offered on 5 platforms that cannot publish video**
- **Problem:** `PLATFORM_CONFIGS` declares `video: true` and allowlists `video/mp4` for **all seven** platforms, so validation accepts a video. Only TikTok and YouTube implement it. LinkedIn (multiImage), Facebook (`/photos`), Instagram (`image_url`), Telegram (`sendPhoto`) mis-send it; **X drops the file entirely and posts text**.
- **Why it matters:** a user gets a broken post or a silent content loss with no error — on their real account.
- **Exact file/code:** `src/types/platform.ts:332+` (`PLATFORM_CONFIGS`), `src/lib/adapters/base.ts:91-98` (validation), then `linkedin.ts:176`, `twitter.ts:204-215`, `facebook.ts:~220`, `instagram.ts:246-250`, `telegram.ts:125-130`
- **Env vars:** none
- **External setup:** none
- **Recommended fix:** either implement the video branch per platform (Facebook `/videos`, Instagram `media_type=REELS` + `video_url`, LinkedIn video URN, Telegram `sendVideo`) or set `video: false` and drop `video/mp4` from `supportedMediaTypes` so the UI and validation refuse honestly. Do the honest downgrade first — it is 5 one-line changes and removes the silent-loss failure.
- **Verify:** attach an mp4 for each platform → either a real video post or a clear "not supported" error; never a text-only post.

**P0-4 · Carousel declared for Facebook + Instagram but only the first image is sent**
- **Problem:** both declare `carousel: true`, so multiple images pass validation; `createPost` sends only `mediaUrls[0]` and silently discards the rest.
- **Why it matters:** silent content loss on a paid-ads-adjacent feature users expect.
- **Exact file/code:** `facebook.ts` (single `/photos`) and `instagram.ts:246-247` (`containerParams.image_url = options.mediaUrls[0]`)
- **Recommended fix:** implement (`attached_media` for FB, `is_carousel_item` children for IG) or set `carousel: false` to fail honestly.
- **Verify:** attach 3 images → either a 3-image carousel or a clear refusal.

**P0-5 · Media cannot reach the platforms without Vercel Blob**
- **Problem:** with `BLOB_READ_WRITE_TOKEN` unset, uploads are stored as **base64 data URLs inside Postgres**; social APIs need a fetchable https URL, and data URIs are rejected or wildly over size limits. Secondary: MIME validation is skipped for data URLs (`base.ts:37-52,94`), and per-platform size limits (`maxImageSizeMb`, `maxVideoSizeMb`) are never enforced — only the route's 100 MB.
- **Why it matters:** every image/video post is unpublishable today, and the DB takes the payload.
- **Exact file/code:** `src/app/api/media/route.ts:79-89` (fallback), `src/lib/adapters/base.ts:37-52,91-98`
- **Env vars:** `BLOB_READ_WRITE_TOKEN`
- **External setup:** VERCEL CONFIG — create a Blob store, copy the read-write token
- **Recommended fix:** set the token; additionally make the base64 fallback throw in production, and enforce `PLATFORM_CONFIGS` size limits in `validatePostContent`.
- **Verify:** upload → URL starts `https://…blob.vercel-storage.com/`; `media_assets.url` never `data:`.

**P0-6 · A crashed or deployed-over publish leaves the post stuck forever**
- **Problem:** jobs are flipped to `PROCESSING` (`cron/publish/route.ts:79-86`) but the claim query only selects `PENDING` (`:65-73`). Nothing reclaims `PROCESSING`, so an interrupted run orphans the job and its post sits in `PUBLISHING` permanently, never retried.
- **Why it matters:** every deploy risks a permanently stuck post with no user-visible recovery.
- **Exact file/code:** `src/app/api/cron/publish/route.ts:65-86`
- **Env vars:** none
- **Recommended fix:** add a lease timeout — reclaim `PROCESSING` jobs whose `startedAt`/`updatedAt` is older than N minutes back to `PENDING` (attempts already increment, so the existing 3-attempt backoff and the `platformPostId` idempotency check both still protect against double-posting).
- **Verify:** force a job to `PROCESSING` with a stale timestamp → next tick reclaims it; 0 rows stuck in `PROCESSING`.

**P0-7 · AI is mocked in production with no indication**
- **Problem:** `OPENAI_API_KEY` absent + `if (forceMock || !isOpenAIAvailable())` → deterministic mock copy, no error, no badge.
- **Why it matters:** if AI Studio is part of the MVP, the feature is fake and users cannot tell.
- **Exact file/code:** `src/lib/ai.ts:212`, `:369`; `src/lib/cascade.ts:238`; `src/lib/brain/embed.ts:135`
- **Env vars:** `OPENAI_API_KEY` (optional `OPENAI_MODEL`, `OPENAI_BASE_URL`)
- **External setup:** OPENAI CONFIG — API key with billing
- **Recommended fix:** set the key; and surface mock mode in the UI when no key is present so fake output can never be mistaken for real.
- **Verify:** AI Studio generation returns non-deterministic model output.

### P1 — Required integration setup (external)

**P1-1 · Telegram** — @BotFather `/newbot` → `TELEGRAM_BOT_TOKEN`; add bot to the channel/group → `TELEGRAM_CHAT_ID`. No review. **Fastest win.**
**P1-2 · X/Twitter** — X Developer Portal app, OAuth 2.0 client, redirect `https://www.socialork.com/api/social/twitter/callback`, `TWITTER_CLIENT_ID/SECRET`. Confirm write access on the chosen tier.
**P1-3 · Google/YouTube** — reuse the existing Google Cloud project: enable YouTube Data API v3, new OAuth client, redirect `…/api/social/youtube/callback`, set `YOUTUBE_CLIENT_ID/SECRET`, then submit for **restricted-scope verification** (until then only test users can connect).
**P1-4 · Meta (one app → Facebook + Instagram + FB sign-in)** — create the app, add Facebook Login, register `…/api/social/facebook/callback`, `…/api/social/instagram/callback`, `…/api/auth/callback/facebook`; set `FACEBOOK_APP_ID/SECRET` + `INSTAGRAM_APP_ID/SECRET`; submit **App Review** for `pages_manage_posts` and `instagram_content_publish`. Requires a Facebook Page (publishing) and an IG Business/Creator account linked to it.
**P1-5 · TikTok** — TikTok for Developers app, redirect `…/api/social/tiktok/callback`, request `video.publish`, **submit audit** (unaudited = `SELF_ONLY`).
**P1-6 · Vercel Blob** — create store → `BLOB_READ_WRITE_TOKEN` (see P0-5).
**P1-7 · OpenAI** — API key with billing (see P0-7).

### P2 — Nice to have

- **P2-1 · Engagement inbox is stubbed for real platforms** — `src/lib/inbox/adapters.ts:105,145,180,215,250,285,320` return `Not implemented`; only mock mode produces data.
- **P2-2 · Cron auth fails open** — `cron/publish/route.ts:40`: the guard is skipped entirely when `CRON_SECRET` is unset. Currently safe (verified live 401s), but make it fail closed.
- **P2-3 · Dead-letter jobs are invisible** — no alert/dashboard; only Vercel logs. `handleFailure` at `cron/publish/route.ts:349-414` is the natural hook.
- **P2-4 · No error tracking** (no Sentry or equivalent anywhere in the repo).
- **P2-5 · Preview deployments have no DB/auth** — all 14 vars are Production-scope; add Preview scope (point at a separate DB).
- **P2-6 · LinkedIn tokens expire 2026-11-11 with no refresh token** — all three connections need manual re-auth, or LinkedIn's refresh-token product.
- **P2-7 · Unimplemented/placeholder surfaces** — competitive intel stub (`competitor-cards.tsx:61`), localization stub (`locale-variants.tsx:25`, `localization/types.ts:14`), experiments stub (`experiments.ts`).
- **P2-8 · Minor inconsistencies** — LinkedIn implements `multiImage` while declaring `carousel: false` (dead path); `MOCK_SOCIAL_ADAPTERS` is set in Vercel but is neither `"true"` nor confirmed `"false"`.

---

## 12. MVP completion estimate

| Area | Value |
|---|---|
| Core functionality | **~70%** |
| Integrations | **1 / 7** |
| AI | **MOCKED** |
| Media | **PARTIAL** |
| Scheduling | **WORKING** (with a stuck-job defect) |
| Real publishing | **PARTIAL** (1 of 7; text + 1 image) |

---

## 13. Shortest path to a functional MVP

**Step 1 — make failure honest (code, no external dependency).** Remove `useMockIfUnconfigured` from the four call sites (P0-1); set `video: false` for LinkedIn/Facebook/Instagram/Telegram and `carousel: false` for Facebook/Instagram — or implement them (P0-3, P0-4); add the `PROCESSING` reclaim lease (P0-6). Now nothing fake-succeeds and no post gets stuck.

**Step 2 — turn on storage and AI.** Create the Vercel Blob store → `BLOB_READ_WRITE_TOKEN`; create the OpenAI key → `OPENAI_API_KEY` (P0-5, P0-7). This makes images publishable and AI real, with no third-party review.

**Step 3 — add the two connectors that need no review.** Telegram (@BotFather, 2 minutes) and X (developer portal). This takes integrations from 1/7 to 3/7 the same day.

**Step 4 — start the two review queues now, in parallel.** Submit the Meta app for App Review (unlocks Facebook + Instagram + Facebook sign-in at once) and enable YouTube + submit for restricted-scope verification. These are calendar-bound, so they must start before the code work finishes, not after.

**Step 5 — TikTok last.** Longest audit; nothing else depends on it.

**Step 6 — verify end to end.** Run the T1–T20 matrix; the MVP is functional when every row that should pass does, and every row that cannot pass returns an honest error instead of a fake success.

*Result after steps 1–3: 3/7 platforms live, real media, real AI, no fake success. After step 4 completes: 6/7. TikTok completes 7/7.*
