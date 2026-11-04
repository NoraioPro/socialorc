# Connect checklist: enable each platform in minutes

Everything below is copied from the code, so it can be pasted as written. It assumes the
production origin `https://www.socialork.com` and that `APP_URL` and `NEXTAUTH_URL` are set to
exactly that value (redirect URIs are built from `APP_URL`). For background and limits see
`docs/PLATFORM-SETUP.md`.

Credentials go in the Vercel project's **Production** environment variables, followed by a
redeploy. Never put them in the repository or paste them into a chat.

## Status at a glance

| Platform | Credentials in Production | Provider approval needed | Customer can connect |
|---|---|---|---|
| Telegram | none needed (each customer brings a bot) | none | yes |
| LinkedIn | set | "Share on LinkedIn" product | after approval |
| X | set | paid API plan for posting | connects; posting needs the plan |
| Facebook | missing | Business Verification + App Review | no |
| Instagram | missing | Business Verification + App Review | no |
| YouTube | missing | Google OAuth verification | no |
| TikTok | missing | TikTok audit for public posting | no |

## LinkedIn (credentials already set)

1. [developer.linkedin.com](https://developer.linkedin.com) → your app → **Products**: request
   **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
2. **Auth** tab → Authorized redirect URLs, add exactly:
   `https://www.socialork.com/api/social/linkedin/callback`
3. Scopes requested by the app: `openid profile email w_member_social`.
4. Test: Settings → Accounts → LinkedIn → Connect, then publish one test post.

Tokens last about 60 days and LinkedIn issues no refresh token, so customers reconnect then.

## X (credentials already set)

1. [developer.x.com](https://developer.x.com) → your project/app → **User authentication settings**:
   OAuth 2.0, type **Web App**, permissions **Read and write**.
2. Callback URI, exactly: `https://www.socialork.com/api/social/twitter/callback`
3. Scopes requested by the app: `tweet.read tweet.write users.read offline.access media.write`.
4. Posting needs a paid API plan; on the Free tier connecting works and publishing fails. All
   customers share the app's write quota.

## Facebook and Instagram (one Meta app serves both)

Add these Production variables (any one alias works, per `src/lib/adapters/meta-app.ts`):

```
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

1. [developers.facebook.com](https://developers.facebook.com) → create an app, add **Facebook
   Login** and the **Instagram** product (Meta renames these often; use the current equivalents).
2. Valid OAuth redirect URIs, add both:
   `https://www.socialork.com/api/social/facebook/callback`
   `https://www.socialork.com/api/social/instagram/callback`
3. Facebook scopes: `pages_show_list, pages_read_engagement, pages_manage_posts,
   pages_manage_metadata, pages_manage_engagement`.
4. Instagram scopes: `instagram_basic, instagram_content_publish, instagram_manage_comments,
   pages_read_engagement, pages_show_list`.
5. Complete **Business Verification** and submit **App Review** for those permissions. Until
   then only people with a role on the app can connect.
6. Instagram publishing needs a Business or Creator account linked to a Facebook Page.

## YouTube

```
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
```

1. [console.cloud.google.com](https://console.cloud.google.com) → enable **YouTube Data API v3**,
   then create an **OAuth client ID** of type **Web application**.
2. Authorized redirect URI: `https://www.socialork.com/api/social/youtube/callback`
3. Scopes requested: `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`.
4. Submit the app for **Google verification**. Until then only listed test users can connect,
   and the default API quota allows only a few uploads a day.

## TikTok

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

1. [developers.tiktok.com](https://developers.tiktok.com) → create an app, add **Login Kit** and
   **Content Posting API**.
2. Redirect URI: `https://www.socialork.com/api/social/tiktok/callback`
3. Scopes requested: `user.info.basic, user.info.profile, video.upload, video.publish`.
4. Until TikTok audits the app, posts can only be drafts or private. After approval, set these
   Production variables so the UI offers the matching options:
   `TIKTOK_UPLOAD_APPROVED=true` (drafts) and `TIKTOK_DIRECT_POST_APPROVED=true` (public posts).

## Telegram (nothing to configure)

Customers create a bot with [@BotFather](https://t.me/BotFather), then paste its token and a chat
id in Settings → Accounts → Telegram. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are not read
and can be deleted from Production.

## After any change

1. Save the variables in Vercel (Production), then redeploy.
2. Open Settings → Accounts: the platform's card changes from "Not available yet" to Connect on
   its own once its credentials exist.
3. Connect with an account you own, publish one test post, then schedule another a few minutes
   ahead and confirm both arrive.
