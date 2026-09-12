# Credentials checklist — what must be registered for one-click connect

**Current state (measured by the app's own code, not assumed):**

```
ready: 1/7   needs setup: 6
TIKTOK / INSTAGRAM / FACEBOOK / YOUTUBE / LINKEDIN / TWITTER  → no app registered
TELEGRAM                                                     → ready (bot token present)
```

Run this any time to re-measure — it reads the same adapters the app uses, so it
cannot drift:

```bash
cd C:/Users/ENG_H/SocialOrc/worktrees/integration
npx tsx scripts/connect-readiness.ts          # human readable, exit 1 while something needs setup
npx tsx scripts/connect-readiness.ts --json   # machine readable
```

It prints the variable **names** that are missing and the exact redirect URI each
portal must be told about. It never prints a value.

---

## The one rule that matters

A platform can only offer a working Connect button if **one** app is registered
with that platform by the SaaS owner, and its credentials live server-side in
`.env` — never in the browser, never in `NEXT_PUBLIC_*`, never in a chat message.
Put the values into `.env` yourself; the app reads them at request time.

`APP_URL` in `.env` drives every redirect URI. Local dev and production therefore
need **separate redirect URIs registered in each portal** (portals allow several):

| | Base | Redirect URI pattern |
|---|---|---|
| Local | `APP_URL=http://127.0.0.1:3001` | `http://127.0.0.1:3001/api/social/<platform>/callback` |
| Production | `APP_URL=https://app.socialorc.com` | `https://app.socialorc.com/api/social/<platform>/callback` |

A redirect URI that differs by even a trailing slash is the single most common
cause of "the user approved it and then nothing happened".

---

## What to create, per platform

### TikTok — `developers.tiktok.com` → Manage apps → Connect an app
- Product: **Login Kit** + **Content Posting API**.
- Redirect URI: `…/api/social/tiktok/callback`
- Scopes requested: `user.info.basic`, `video.upload`, `video.publish`
- Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- Review gate: posting to the user's profile needs TikTok's **audit**. Until it
  passes, the API only allows `SELF_ONLY` posts. Keep
  `TIKTOK_DIRECT_POST_APPROVED`/`TIKTOK_UPLOAD_APPROVED` unset until the audit is
  in — the flags default to false so the app reports `APP_REVIEW_REQUIRED`
  instead of offering a publish button that fails.

### Facebook Pages — `developers.facebook.com/apps` → Create app → type **Business**
- Add product **Facebook Login for Business**.
- Redirect URI: `…/api/social/facebook/callback`
- Scopes: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`
- Env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- Note: `pages_manage_posts` needs **App Review** before it works for anyone but
  admins/testers of the app. In Development mode you can connect and test with
  your own account immediately — that is the fastest path to a working demo.

### Instagram — same Meta app as above
- Add product **Instagram** (Business login) → Instagram Graph API.
- Redirect URI: `…/api/social/instagram/callback`
- Scopes: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list`
- Env: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (Meta may reuse the Facebook
  app id/secret; set both pairs if so)
- Requires an **Instagram Business or Creator** account linked to a Facebook Page.
  A personal IG account cannot publish through the API — say so in the UI rather
  than failing at the last step.

### YouTube — `console.cloud.google.com`
- Create project → enable **YouTube Data API v3** → OAuth consent screen →
  Credentials → **OAuth client ID (Web application)**.
- Redirect URI: `…/api/social/youtube/callback`
- Scopes: `youtube.upload`, `youtube.readonly`
- Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- Review gate: `youtube.upload` on an **unverified** consent screen is limited to
  test users and caps uploads as private. Google verification is required for
  public use.

### LinkedIn — `linkedin.com/developers/apps` → Create app
- Request product **Share on LinkedIn** (and **Sign In with LinkedIn using OpenID Connect**).
- Redirect URI: `…/api/social/linkedin/callback`
- Scopes: `openid`, `profile`, `email`, `w_member_social`
- Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Company-page posting needs the **Community Management API** product, which has
  its own approval.

### X / Twitter — `developer.x.com` → Projects & Apps
- OAuth 2.0 with PKCE; type **Web App**.
- Redirect URI: `…/api/social/twitter/callback`
- Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
- Env: `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`
- Review gate: **writing** (`tweet.write`) requires a paid API tier. Connecting
  (read) works on Free; publishing will fail on Free — that is a plan limit, not
  a bug in the connector.

### Telegram — `@BotFather` (already done)
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — present and reporting `ready`.

---

## The `.env` block to fill in

Add these keys to `SocialOrc/worktrees/integration/.env` (and to whichever
checkout serves the app) and paste the values in yourself:

```
# Meta (covers Facebook Pages and Instagram)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=

# Google / YouTube
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# LinkedIn
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# TikTok
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# X / Twitter
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
```

Leave the approval flags (`TIKTOK_DIRECT_POST_APPROVED`, `TIKTOK_UPLOAD_APPROVED`)
unset until each platform's review actually passes.

---

## Sign in with Google (fast login)

SocialOrc's own sign-in, distinct from the YouTube connector — but registered in
the **same** Google Cloud project, so do both in one visit.

- Credentials → **OAuth client ID** → Web application, name `SocialOrc Login`
  (or reuse the `SocialOrc` client and add both redirect URIs).
- Redirect URI (exact):
  - `http://127.0.0.1:3001/api/auth/callback/google`
  - `https://app.socialorc.com/api/auth/callback/google`
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` also work)
- Optional: `OAUTH_SIGNUP_ROLE` — the role a brand-new Google sign-up gets.
  Defaults to `EDITOR`. Do **not** leave it unset expecting admin: the schema
  default is `ADMIN`, so an unconfigured self-serve signup would otherwise become
  a workspace admin, which is why the app explicitly corrects the role on user
  creation.

The login page asks `/api/auth/providers` what NextAuth can serve and renders
"Continue with Google" **only** when both variables are present, so an
unconfigured deployment shows no dead button.

---

## Sign in with Facebook (fast login)

Uses the **same Meta app** as the connector (`SocialOrc`, App ID
`1480436753949095`) — one registration serves both sign-in and publishing, so
there is nothing extra to create.

- In the Meta app: **Facebook Login → Settings** → add to *Valid OAuth Redirect
  URIs*:
  - `http://127.0.0.1:3001/api/auth/callback/facebook`
  - `https://app.socialorc.com/api/auth/callback/facebook`
- Env: `FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET` (already the connector's names),
  or `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` if you prefer the NextAuth
  convention. The login reads either.
- The app may stay **In development** for your own testing; other people cannot
  sign in with Facebook until the app is live and the login permission reviewed.

The login page renders "Continue with Google" and "Continue with Facebook" only
for providers whose credentials are present, so an unconfigured deployment shows
neither button rather than a dead one.

---

## Verifying one-click connect once values are in

1. `npx tsx scripts/connect-readiness.ts` → the platform flips to `ready` and
   stops listing missing names.
2. Restart the dev server (env is read at process start for some code paths).
3. In the app: **Settings → Connections → Connect <platform>**.
   - Unconfigured platform: the UI already says *"Connection setup is required
     before this platform can be linked."* — it does not offer a dead button.
   - Configured: the button returns a real authorization URL and the browser goes
     to the platform.
4. After approving there, the callback stores the account and the platform shows
   **Connected** with the capabilities it actually supports.

`GET /api/social/status` returns the same report as JSON (authenticated), so an
admin view can render setup state without shelling out.
