# Platform setup — what you must do by hand

Everything in this file is a manual step that cannot be automated: creating a developer app on
each network, requesting the right products and scopes, and pasting two values into `.env`.
The code is already written and tested; without these steps every platform simply reports
"setup required" instead of offering a Connect button.

Work through one platform at a time. Telegram takes about two minutes and needs no review —
start there if you want to see the whole loop work end to end today.

## Before you start

### 1. Decide your base URL

Every redirect URI is derived from one variable. Set it in `.env`:

```
APP_URL="http://localhost:3000"
```

Use the address you actually browse. If you open the app from another device on your Tailnet,
that IP is the base URL (`http://100.81.170.104:3000`), not `localhost` — a redirect URI that
differs by even a trailing slash is the single most common cause of "I approved it and then
nothing happened".

Production uses a second value (`https://app.socialorc.com`). Every portal below accepts more
than one redirect URI, so register both and you can develop and ship without editing anything.

### 2. The redirect URI pattern

```
<APP_URL>/api/social/<platform>/callback
```

So with `APP_URL=http://localhost:3000`, LinkedIn's is
`http://localhost:3000/api/social/linkedin/callback`.

The two sign-in providers use a different path — `<APP_URL>/api/auth/callback/<provider>` — and
are covered at the end.

### 3. Check your work at any point

```bash
npx tsx scripts/connect-readiness.ts
```

It reads the same adapter code the app uses, prints which variable **names** are still missing
and the exact redirect URI each portal must be told about, and never prints a value. The same
report is available as JSON at `GET /api/social/status` when signed in.

---

## Which platforms are ready, and which are waiting on someone else

SocialOrc uses one developer app per platform (the usual SaaS model). Each customer authorizes
**their own account** through it, and their tokens are stored encrypted in their own workspace.
Whether a customer can actually use a platform depends on that shared app's approvals:

| Platform | State | What it is waiting on |
|---|---|---|
| LinkedIn | **Ready once the app is approved** | The "Share on LinkedIn" product on the LinkedIn app (self-serve) and the redirect URI. Tokens last about 60 days and LinkedIn issues no refresh token to self-serve apps, so customers must reconnect. |
| X | **Ready on a paid X plan** | `tweet.write` needs a paid tier; on Free, connecting works and publishing fails. Quota is shared by all customers. |
| Telegram | **Ready** | Only `TELEGRAM_BOT_TOKEN`. Shared bot, see above. |
| Facebook | **Blocked by Meta approval** | Business Verification, App Review, Live mode. |
| Instagram | **Blocked by Meta approval** | Same Meta app, plus a Business/Creator account linked to a Page. |
| YouTube | **Blocked by Google verification** | Until the consent screen is verified only listed test users can connect; the default API quota allows only a handful of uploads a day. |
| TikTok | **Blocked by TikTok audit** | Until the Content Posting API audit passes, posts are private or drafts only (`TIKTOK_DIRECT_POST_APPROVED` stays off). |

"Ready" means the code is complete and the platform allows it; no platform has been verified
by a live post yet. Remove the credentials of a blocked platform from the deployment until it is
approved, so it shows as not configured instead of failing for customers.

**Disconnecting.** SocialOrc stops using a connection the moment it is disconnected, whatever
the platform does. It also asks the platform to revoke the token where the platform documents a
way to: X, Google (YouTube) and TikTok. LinkedIn documents no revocation call, so a LinkedIn
token simply stays valid at LinkedIn until it expires; the customer can remove SocialOrc from
their LinkedIn connected apps. The UI says which of these happened.

## What each platform can actually do

Capabilities differ because the networks' APIs differ, not because the connector is unfinished.
The UI shows the unavailable ones with their reason rather than a dead button.

| Platform | Publish | Read comments | Reply | Delete comment | React |
|---|---|---|---|---|---|
| Telegram | yes | replies the bot can see | yes | yes | yes |
| Facebook Pages | yes | yes | yes | yes | yes (like) |
| Instagram | yes | yes | yes | yes | no |
| YouTube | yes | yes | yes | yes | on videos only |
| X (Twitter) | yes, paid tier | yes, 7-day window | yes | yes | no |
| LinkedIn | yes | no | no | no | no |
| TikTok | yes, after audit | no | no | no | no |

**LinkedIn** gates comments and reactions behind the Community Management API, whose
`*_social_feed` scopes LinkedIn grants only to approved partners. **TikTok's** open API has no
public comment surface at all. Neither is a gap we can close from our side.

---

## Telegram — about two minutes, no review

SocialOrc runs **one shared bot** for every customer. The operator creates it once; each
customer then connects their *own* channel or group to it. Nobody can publish to a chat they do
not control.

**Operator setup (once):**

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, then follow the prompts for a name and a username.
3. BotFather replies with a token that looks like `8123456789:AAH...`. Put it in the
   deployment environment:

```
TELEGRAM_BOT_TOKEN="8123456789:AAH..."
```

Do **not** set `TELEGRAM_CHAT_ID`. It used to be a default destination and is now ignored by
publishing; leaving a personal chat id in the environment only invites confusion. The bot must
not have a webhook set (SocialOrc reads its messages with `getUpdates`, which Telegram refuses
while a webhook exists), and only one deployment should use a given bot token.

**Customer connection (per user, in Settings → Accounts → Telegram):**

1. SocialOrc shows a one-time code.
2. The customer adds the bot to their own channel (as an **administrator** with "Post messages")
   or group, or opens a private chat with it, and posts the code there.
3. SocialOrc sees the code, checks that whoever posted it administers a group, and binds that
   chat to the customer's workspace. A chat can belong to only one workspace.

Before every publish SocialOrc re-checks that the bot is still in the chat (and can still post,
in a channel) and that the person who connected a group is still an admin. If not, the post
fails with a "reconnect" message instead of sending. Telegram outages are not treated as a
failed check.

Limits to know about: posts go out as the shared SocialOrc bot (no per-customer bot identity),
only text and a single photo are supported, and stored replies are deleted after 30 days.

Reactions need the bot to be an admin in the chat. Reading comments works only for replies the
bot is allowed to see — the Bot API has no way to fetch a message's full reply history, so the
inbox shows what has arrived since the bot was added.

---

## LinkedIn — posting today, comments not available

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) and
   **Create app**. It must be associated with a LinkedIn Page you administer.
2. On the **Products** tab, request:
   - *Sign In with LinkedIn using OpenID Connect*
   - *Share on LinkedIn*
   Both are usually granted immediately.
3. On the **Auth** tab, add the redirect URI:
   `<APP_URL>/api/social/linkedin/callback`
4. Copy the Client ID and Client Secret into `.env`:

```
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""
```

Scopes requested automatically: `openid`, `profile`, `email`, `w_member_social`.

Two limits worth knowing before you plan around them. Posting to a **company page** needs the
Community Management API product, which has its own approval. **Comments and reactions** need
that same product's `r_member_social_feed` / `w_member_social_feed` scopes, which LinkedIn
grants only to approved partners — this is why LinkedIn shows as publish-only in the app.

---

## X (Twitter) — connecting is free, posting is not

1. Go to [developer.x.com](https://developer.x.com) → **Projects & Apps** → create a project
   and an app inside it.
2. In **User authentication settings**:
   - App permissions: **Read and write**
   - Type of App: **Web App, Automated App or Bot**
   - Callback URI: `<APP_URL>/api/social/twitter/callback`
   - Website URL: anything valid you own
3. On the **Keys and tokens** tab, copy the **OAuth 2.0** Client ID and Client Secret:

```
TWITTER_CLIENT_ID=""
TWITTER_CLIENT_SECRET=""
```

Scopes requested automatically: `tweet.read`, `tweet.write`, `users.read`, `offline.access`,
`media.write`. The `media.write` scope is what lets SocialOrc upload images and video; the app's
OAuth 2.0 settings must allow it, and an account connected before it was added has to reconnect
to attach media. In the X developer portal, set up **User authentication** as a confidential
**Web App** with *Read and write* permission and the callback
`<APP_URL>/api/social/twitter/callback`. The write quota on the app is shared by every
SocialOrc customer.

**The plan matters.** Connecting and reading work on the Free tier, but `tweet.write` — which
is what publishing and replying use — requires a paid tier. On Free the connection succeeds and
publishing fails; that is X's plan limit, not a connector bug. Liking is not offered at all,
because X moved the Likes write endpoint to Enterprise access.

Reading a post's comments uses recent search on `conversation_id`, which only covers the last
**7 days**. Older threads come back empty.

---

## Facebook Pages — the most complete connector

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create app**
   → type **Business**.
2. Add the product **Facebook Login for Business**.
3. Under **Facebook Login → Settings**, add to *Valid OAuth Redirect URIs*:
   `<APP_URL>/api/social/facebook/callback`
4. **App settings → Basic** has the App ID and App Secret:

```
FACEBOOK_APP_ID=""
FACEBOOK_APP_SECRET=""
```

Scopes requested automatically: `pages_show_list`, `pages_read_engagement`,
`pages_manage_posts`, `pages_manage_metadata`, `pages_manage_engagement`.

While the app is **In development** only people with a role on the app (admin, developer,
tester) can connect, so it is a working demo, not a public launch. Letting any customer use it
requires, in this order:

1. **Business Verification** of the business that owns the app. Meta requires it for Advanced
   Access to Page permissions in a production app.
2. **App Review** with Advanced Access for `pages_manage_posts` and `pages_manage_engagement`,
   and also `pages_show_list` and `pages_read_engagement` for people outside the app.
3. Switching the app to **Live** and whitelisting both redirect URIs
   (`<APP_URL>/api/social/facebook/callback` and `<APP_URL>/api/social/instagram/callback`).

Until then Facebook and Instagram are **blocked by Meta approval** for the public. SocialOrc
reads the app's ID and secret from `INSTAGRAM_APP_ID` / `FACEBOOK_APP_ID` (and the matching
`_APP_SECRET`), or the aliases `FACEBOOK_CLIENT_ID` / `META_APP_ID`.

You must be an admin of the Page you want to post to; the connector lists the Pages your
account administers and stores a Page token for the one you pick.

---

## Instagram — same Meta app, stricter account requirements

1. In the **same** Meta app you created for Facebook, add the product **Instagram** and choose
   the Instagram Graph API / Business login flow.
2. Add the redirect URI: `<APP_URL>/api/social/instagram/callback`
3. Reuse the Meta app credentials (Meta often issues the same pair):

```
INSTAGRAM_APP_ID=""
INSTAGRAM_APP_SECRET=""
```

Scopes requested automatically: `instagram_basic`, `instagram_content_publish`,
`instagram_manage_comments`, `pages_read_engagement`, `pages_show_list`.

`instagram_content_publish` and `instagram_manage_comments` need the same Business Verification
and App Review as Facebook, so Instagram is **blocked by Meta approval** for the public too.

**Requirements that will block you if they are not met:**

- The Instagram account must be **Business or Creator**, not personal. Convert it in the
  Instagram app under Settings → Account type.
- It must be **linked to a Facebook Page** you administer.
- Every post needs media — Instagram has no text-only publishing. Images must be **JPEG**;
  PNG and WebP are rejected.
- The limit is 50 published posts per 24 hours.

Liking other people's media is not exposed by the Graph API, so reactions are unavailable.
Reading and replying to comments on **your own** media works.

---

## YouTube — Google Cloud, and verification matters

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External → fill in the app name, support email and developer
   email. Add yourself under **Test users** while the screen is unverified.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Add the
   authorized redirect URI: `<APP_URL>/api/social/youtube/callback`
5. Copy the pair into `.env`:

```
YOUTUBE_CLIENT_ID=""
YOUTUBE_CLIENT_SECRET=""
```

Scopes requested automatically: `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`
(the last one is what makes commenting and rating work).

Until Google **verifies** your consent screen, only listed test users can connect, and uploads
are forced to private visibility. Verification is a review process with a real turnaround time,
so plan for it rather than discovering it on launch day.

Reactions apply to **videos** (`like` / `dislike` / clear), not to comments — the Data API has
no comment-like write.

---

## TikTok — publishing only, and only after an audit

1. Go to [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps** → create an
   app.
2. Add the products **Login Kit** and **Content Posting API**.
3. Redirect URI: `<APP_URL>/api/social/tiktok/callback`
4. Copy the credentials:

```
TIKTOK_CLIENT_KEY=""
TIKTOK_CLIENT_SECRET=""
```

Scopes requested automatically: `user.info.basic`, `user.info.profile`, `video.upload`,
`video.publish`.

**Leave these two unset until TikTok's audit actually passes:**

```
TIKTOK_DIRECT_POST_APPROVED=
TIKTOK_UPLOAD_APPROVED=
```

They default to false, which makes the app report `APP_REVIEW_REQUIRED` instead of offering a
publish button that will fail. An unaudited app can only create `SELF_ONLY` (private) posts.

TikTok exposes no public comment API, so the engagement inbox has nothing to show for it.

---

## Sign-in providers (optional, separate from the connectors)

These let people log into SocialOrc itself with Google or Facebook. They are registered in the
**same** Google project and Meta app you already made, so there is nothing new to create.

**Google** — Credentials → the same OAuth client (or a new one named `SocialOrc Login`) → add
redirect URI `<APP_URL>/api/auth/callback/google`:

```
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

**Facebook** — Facebook Login → Settings → add redirect URI
`<APP_URL>/api/auth/callback/facebook`. It reuses `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`.

Optionally set the role a brand-new self-serve signup receives:

```
OAUTH_SIGNUP_ROLE="EDITOR"
```

The login page asks `/api/auth/providers` what NextAuth can actually serve, so a provider with
no credentials renders no button rather than a dead one.

---

## The rest of `.env`

These are not platform credentials but the app will not run correctly without them:

```
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"
NEXTAUTH_SECRET=""          # openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=""     # openssl rand -base64 32
CRON_SECRET=""              # openssl rand -base64 32

OPENAI_API_KEY=""           # optional — AI draft generation
BLOB_READ_WRITE_TOKEN=""    # optional — media uploads via Vercel Blob

MOCK_SOCIAL_ADAPTERS="false"  # "true" runs the whole workflow against fake connectors
```

`TOKEN_ENCRYPTION_KEY` encrypts stored social tokens at rest. Changing it makes every existing
connection unreadable and everyone has to reconnect, so set it once and keep it.

---

## Verifying a platform once its values are in

1. `npx tsx scripts/connect-readiness.ts` — the platform flips to `ready`.
2. Restart the dev server; several code paths read env at process start.
3. In the app: **Settings → Connections → Connect <platform>** and approve on the network.
4. The platform shows **Connected** with the capabilities it genuinely supports.
5. Publish a test post, then open **Engagement** to read and reply to its comments on the
   platforms that support it.

If the browser comes back to a page that does nothing after you approve, the redirect URI in
the portal does not match `<APP_URL>/api/social/<platform>/callback` exactly. That is nearly
always the cause.
