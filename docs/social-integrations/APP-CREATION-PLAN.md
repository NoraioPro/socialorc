# SocialOrc app-creation plan (dedicated apps, nothing reused)

Decision: SocialOrc gets its **own** app/client on every platform. Nothing of
Hassan's existing apps is modified — `Norailo N8N` (Meta), `Noraio website`
(Google OAuth client), the verified `Norailo` (LinkedIn) and `LinkEase` all stay
as they are.

Two properties every platform entry must satisfy before I call it done:

1. **Both redirect URIs registered** — local dev *and* production. A portal that
   only knows the production URL cannot complete a local test, and vice versa.
2. **Only the scopes the adapter actually requests** — no "request everything"
   padding, because unused scopes slow review and widen the blast radius.

Base URLs:

| | Value |
|---|---|
| Local dev (`APP_URL` in the integration tree) | `http://127.0.0.1:3001` |
| Production (register yours; confirm the domain) | `https://app.socialorc.com` |

---

## 1. Meta — `developers.facebook.com/apps` → Create App

- **Name:** `SocialOrc` · **Type:** Business (needed for Pages + Instagram)
- Products: **Facebook Login for Business**, **Instagram** (Business login)
- Redirect URIs to add (valid OAuth redirect URIs):
  - `http://127.0.0.1:3001/api/social/facebook/callback`
  - `http://127.0.0.1:3001/api/social/instagram/callback`
  - `https://app.socialorc.com/api/social/facebook/callback`
  - `https://app.socialorc.com/api/social/instagram/callback`
- Permissions the adapter asks for:
  - Facebook: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`
  - Instagram: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list`
- Capture: **App ID**, **App Secret** → `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
  `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (Meta lets one app serve both)
- Gate: stays "In development" until App Review. In development, admin/tester
  accounts connect and publish immediately — enough to demo, not enough for
  other users.

## 2. Google / YouTube — `console.cloud.google.com`

- Project: existing `Gorgov` is fine, or a new `SocialOrc` project (preferred if
  the YouTube quota should not be shared).
- Enable **YouTube Data API v3**.
- Credentials → **OAuth client ID** → Web application, name `SocialOrc`
  (do **not** touch `Noraio website`).
- Redirect URIs:
  - `http://127.0.0.1:3001/api/social/youtube/callback`
  - `https://app.socialorc.com/api/social/youtube/callback`
- Scopes: `youtube.upload`, `youtube.readonly`
- Capture: **Client ID**, **Client secret** → `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- Gate: OAuth consent screen — while unverified, uploads are limited to test
  users and land private. Verification is a separate later step.

## 3. LinkedIn — `linkedin.com/developers/apps` → Create app

- **App name:** `SocialOrc` · linked to the verified NorAiO company page (a
  verified company page avoids a verification delay later).
- Products to request: **Share on LinkedIn**, **Sign In with LinkedIn using OpenID Connect**
- Redirect URIs:
  - `http://127.0.0.1:3001/api/social/linkedin/callback`
  - `https://app.socialorc.com/api/social/linkedin/callback`
- Scopes: `openid`, `profile`, `email`, `w_member_social`
- Capture: **Client ID**, **Primary Client Secret** → `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Gate: "Share on LinkedIn" is granted per app; company-page posting needs the
  Community Management API, which has its own approval.

## 4. TikTok — `developers.tiktok.com/apps` → Connect an app

- **Name:** `SocialOrc` · Add products **Login Kit** and **Content Posting API**
- Redirect URI: `http://127.0.0.1:3001/api/social/tiktok/callback` and the
  production equivalent
- Scopes: `user.info.basic`, `video.upload`, `video.publish`
- Capture: **Client key**, **Client secret** → `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- Gate: **Direct Post requires audit.** Until it passes, the API only accepts
  `SELF_ONLY` posts. Leave `TIKTOK_DIRECT_POST_APPROVED` / `TIKTOK_UPLOAD_APPROVED`
  unset, so the app reports `APP_REVIEW_REQUIRED` rather than offering a publish
  button that fails.

## 5. X / Twitter — `developer.x.com`

- Project + App `SocialOrc` · **OAuth 2.0** client type: Web App
- Redirect URIs:
  - `http://127.0.0.1:3001/api/social/twitter/callback`
  - `https://app.socialorc.com/api/social/twitter/callback`
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- Capture: **Client ID**, **Client Secret** → `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- Gate: writing needs a **paid tier**. Connecting works on Free; publishing will
  fail on Free — a plan limit, not a connector bug.

## 6. Telegram — already working

`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set and the readiness check reports
`ready`. Nothing to create.

---

## Order of work

1. Meta (gates the most product surface: Pages + Instagram publish)
2. TikTok (headline feature, needs the longest review clock — start it early)
3. Google/YouTube
4. LinkedIn
5. X (last: write access is paywalled, so it cannot be fully verified now)

After each app: write the values into `.env` server-side (never in chat), rerun
`npx tsx scripts/connect-readiness.ts` to confirm the platform flips to `ready`,
and keep the redirect URI exactly as registered.

## What "done" means

- `npx tsx scripts/connect-readiness.ts` → exit 0, every platform `ready`
- A real Connect round trip per platform ends with the account stored and the
  platform showing **Connected** with its true capabilities
- For anything still gated by review or plan tier, the app says so in its own
  words (SELF_ONLY / private / review required) instead of failing silently
