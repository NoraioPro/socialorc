# Integrations runbook — making all seven channels work

Everything the code needs already exists: one connect route, one shared OAuth
callback, one adapter per platform, one publish worker. What is missing for six of
the seven is **credentials and approval on the platform side**, which is owner
work, not engineering work.

Prove the current state at any time:

```bash
cd ~/Desktop/Projects/WEB/socialorc-design
set -a; . ./.env; set +a          # the script reads process env, not .env
npx tsx scripts/connect-readiness.ts
```

It prints, per platform: state (`ready` / `needs_setup`), the auth method, the
exact **redirect URI** to register, and the **names** of missing variables (never
values). Exit code 0 means nothing is missing.

---

## What "works" means per platform

| Platform | Connect | Publish | Gate you cannot code around |
|---|---|---|---|
| Telegram | bot token | **works today** | none — the only channel that needs no review |
| LinkedIn | OAuth | works after scopes | app products + (for company pages) Community Management approval |
| X | OAuth 2 + PKCE | works after tier | write access is on a paid API tier |
| Facebook Page | OAuth | works after review | App Review for `pages_manage_posts` on pages you do not admin |
| Instagram | OAuth | works after review | Business account + linked Page + App Review |
| YouTube | OAuth | works after verification | unverified apps upload **private** only |
| TikTok | OAuth | `SELF_ONLY` until audit | Content Posting API audit |

The approval defaults in `src/lib/social/approval.ts` are `false` on purpose: an
optimistic default is how "publish" ends up broken in production. Set the TikTok
flags once the audit passes.

---

## The one origin rule (this bites everyone)

`NEXTAUTH_URL` and `APP_URL` **must be the same origin**, and that origin must be
public HTTPS for OAuth. Locally that means a tunnel, not `localhost`:

```
NEXTAUTH_URL=https://<your-host>
APP_URL=https://<your-host>
```

Register **both** URIs in every portal — the production one and, if you test
locally, the tunnel one:

```
https://<your-host>/api/social/<platform>/callback
```

A trailing slash difference is the classic "the user approved it and nothing
happened" failure.

---

## Telegram — do this first (15 minutes, no review)

1. In Telegram, talk to **@BotFather** → `/newbot` → copy the token.
2. Add **the bot** as an administrator of the channel/group it should post to.
3. Store the token for a workspace account:
   - `TELEGRAM_BOT_TOKEN` in the deployment env (default offered at connect), or
   - per account: **Settings → Connections → Telegram → Connect** and paste the
     token; the chat id is captured per account (`SocialAccount.metadata.chatId`).
4. Publish a post through SocialOrk. A successful publish stores
   `platformPostId`; a failure explains itself in the queue.

Nothing here needs a portal, a review, or a paid tier.

---

## LinkedIn

1. <https://www.linkedin.com/developers/apps> → **Create app** (needs a LinkedIn Page).
2. Products: request **Share on LinkedIn** (`w_member_social`). For company pages
   also request **Marketing Developer Platform** (`w_organization_social`).
3. Auth tab → **Authorized redirect URLs** → add
   `https://<your-host>/api/social/linkedin/callback`.
4. Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
5. Connect, then publish a text post to your own profile — that is the smoke test.

## X (Twitter)

1. <https://developer.x.com> → project + app → **OAuth 2.0** with PKCE, type
   *Web App*.
2. Scopes: `tweet.read tweet.write users.read offline.access`.
3. Callback: `https://<your-host>/api/social/twitter/callback`.
4. Env: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`.
5. Write access requires a paid tier on the X API — the app can connect without
   it, but publishing returns a permission error that the queue reports faithfully.

## Facebook Page / Instagram (one Meta app)

1. <https://developers.facebook.com/apps> → **Create app** → type *Business*.
2. Add products: **Facebook Login for Business**, **Instagram Graph API**.
3. Permissions to request in App Review:
   - Facebook: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`
   - Instagram: `instagram_basic`, `instagram_content_publish`, `pages_show_list`
4. Valid OAuth redirect URIs: both
   `https://<your-host>/api/social/facebook/callback` and
   `.../instagram/callback`.
5. Env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `INSTAGRAM_APP_ID`,
   `INSTAGRAM_APP_SECRET`.
6. Instagram requires a **Business/Creator account linked to the Page**, and every
   post needs an image or video — the capability matrix blocks text-only posts
   before they reach the API.

## YouTube (Google Cloud)

1. <https://console.cloud.google.com> → project → **Enable YouTube Data API v3**.
2. OAuth consent screen → External (or Internal for Workspace) → add scope
   `https://www.googleapis.com/auth/youtube.upload`.
3. Credentials → OAuth client → *Web application* → redirect
   `https://<your-host>/api/social/youtube/callback`.
4. Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
5. Until the app is **verified**, uploads land as **private** — that is Google's
   rule, not a bug.

## TikTok

1. <https://developers.tiktok.com> → app → add **Content Posting API**.
2. Scopes: `video.publish` (direct) and/or `video.upload` (draft to inbox).
3. Redirect: `https://<your-host>/api/social/tiktok/callback`.
4. Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
5. Until the audit passes, posts are created as `SELF_ONLY` and only the author
   sees them. When it passes, set `TIKTOK_DIRECT_POST_APPROVED=true` (and/or
   `TIKTOK_UPLOAD_APPROVED=true`) so the readiness report and the capabilities
   stop declaring direct publishing unavailable.

---

## Verifying without any credentials

`MOCK_SOCIAL_ADAPTERS=true` connects all seven through the mock adapter, which
exercises the whole pipeline (connect → draft → approve → schedule → publish →
queue states) with no portal accounts. That is how the e2e suite proves the
product still works when a provider is down.

## Where the state is visible

- **Settings → Connections**: per platform — Connected / Needs setup (with the
  missing variable names and the redirect URI to register) / Reconnect.
- `GET /api/social/status`: the same report as JSON (variable names only).
- `GET /api/health`: build + database + which connectors are configured.
- **Publishing → Failed**: the platform's own error message, attempt count and a
  safe retry.
