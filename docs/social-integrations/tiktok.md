# TikTok integration

Provider: `src/lib/adapters/tiktok.ts` · constants + doc links:
`src/lib/social/tiktok/constants.ts` · verified against the official docs on
**2026-09-12** — re-check before a release, TikTok changes endpoints and limits
without notice.

## 1. Developer portal

- Portal: <https://developers.tiktok.com> → *Manage apps*
- Products to add to the app:
  - **Login Kit for Web** (OAuth + user identity)
  - **Content Posting API** (video upload + direct post)
- Both products must be **added and enabled in the app configuration**; a scope
  that is requested but not added to the app is rejected at the authorization
  screen.

## 2. App setup

1. Create the app, then copy **Client key** and **Client secret**.
2. Add a **Redirect URI** for every environment (TikTok requires an exact match,
   including scheme and trailing path):
   - local: `http://localhost:3000/api/social/tiktok/callback`
   - dev/staging: `https://dev.socialorc.com/api/social/tiktok/callback`
   - production: `https://app.socialorc.com/api/social/tiktok/callback`
3. Under **Content Posting API** enable:
   - *Upload video* → covers the inbox/draft endpoint (`video.upload`)
   - *Direct Post* → covers `video.publish`
4. Scopes to request: `user.info.basic`, `user.info.profile`, `video.upload`,
   `video.publish`.

## 3. Scopes and what they unlock

| Scope | Unlocks | Notes |
|---|---|---|
| `user.info.basic` | `open_id`, `union_id`, `avatar_url`, `display_name` | required to identify the account |
| `user.info.profile` | `username` and profile fields | optional, requested together |
| `video.upload` | `POST /v2/post/publish/inbox/video/init/` — the video lands in the creator's TikTok inbox | does **not** publish publicly |
| `video.publish` | `POST /v2/post/publish/video/init/` — Direct Post | public posting additionally needs the app audit |

## 4. Environment variables

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=              # optional; defaults to APP_URL/api/social/tiktok/callback
TIKTOK_PKCE_METHOD=               # optional: S256 (default) | plain
TIKTOK_DIRECT_POST_APPROVED=      # "true" only after TikTok approves the app for Direct Post
TIKTOK_UPLOAD_APPROVED=           # "true" when the Content Posting API upload product is enabled
```

`APP_URL` (or `NEXTAUTH_URL`) supplies the public origin for the default
redirect URI — the same origin you must register in the portal.

## 5. Flow implemented

```
POST /api/social/tiktok/connect      → { url }             (state + PKCE S256 challenge)
  → user authorizes on tiktok.com
GET  /api/social/tiktok/callback     → token exchange (verifier from the state cookie)
                                     → GET /v2/user/info/ (identity)
                                     → tokens encrypted, account upserted with scopes
                                     → redirect /settings/accounts?success=tiktok_connected
```

Endpoints used (all official, v2):

| Purpose | Endpoint |
|---|---|
| Authorize | `https://www.tiktok.com/v2/auth/authorize/` |
| Token / refresh | `POST https://open.tiktokapis.com/v2/oauth/token/` |
| Revoke | `POST https://open.tiktokapis.com/v2/oauth/revoke/` |
| Identity | `GET https://open.tiktokapis.com/v2/user/info/` |
| Creator info | `POST /v2/post/publish/creator_info/query/` |
| Direct Post | `POST /v2/post/publish/video/init/` |
| Draft/inbox upload | `POST /v2/post/publish/inbox/video/init/` |
| Post status | `POST /v2/post/publish/status/fetch/` |

Token lifetimes: access token **24 h**, refresh token up to **365 days**. The
access token is refreshed before expiry; `refreshTokenExpiresAt` is stored so the
UI can ask for a reconnect before the refresh token dies.

## 6. Publishing support

| Publish method | Endpoint | Requires | Public result |
|---|---|---|---|
| Direct Post | `/v2/post/publish/video/init/` | `video.publish` **+ TikTok app audit** | audited: chosen privacy level; unaudited: `SELF_ONLY` only |
| Draft upload | `/v2/post/publish/inbox/video/init/` | `video.upload` | appears in the creator's TikTok inbox as a draft |

Media transfer: `FILE_UPLOAD` (default) uploads our bytes in chunks of 5–64 MB,
one chunk up to 64 MB, at most 1000 chunks. `PULL_FROM_URL` is implemented but
requires TikTok-verified ownership of the media domain, so it is refused by the
validator unless the operator has done that verification.

Creator info is always read before a Direct Post: it returns the privacy levels
this creator may choose (`PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`,
`FOLLOWER_OF_CREATOR`, `SELF_ONLY`), their maximum video duration
(`max_video_post_duration_sec`) and the duet/comment/stitch availability.
Hardcoding a privacy level is a TikTok product-use violation, so the UI must
render the returned options and honour the choice.

## 7. Current limitations (and what the API returns for them)

| Capability | State | Reason code |
|---|---|---|
| `text` | impossible | `NOT_SUPPORTED_BY_PLATFORM` — no text-only post exists |
| `image` / `carousel` | not implemented | `NOT_IMPLEMENTED_YET` — TikTok's photo-post endpoint exists, this connector does not call it |
| `directPublish` | depends on audit | `APP_REVIEW_REQUIRED` until `TIKTOK_DIRECT_POST_APPROVED=true` |
| `draftUpload` | depends on scope + product | `SCOPE_NOT_GRANTED` when `video.upload` was not granted |
| `analytics` / `comments` / `messaging` | not implemented | `NOT_IMPLEMENTED_YET` |

Nothing here is guessed: the capability report is computed from the granted
scopes, the account type and the configured app-approval flags
(`src/lib/social/capabilities.ts`).

## 8. App review requirements

- **`video.upload`** — needs the Content Posting API product added to the app.
- **`video.publish`** — needs the Direct Post configuration **and** TikTok's
  audit. Until the audit passes, TikTok only accepts `SELF_ONLY` posts; our
  capability report says `directPublish: false` with `APP_REVIEW_REQUIRED`
  instead of pretending otherwise.
- Do not set `TIKTOK_DIRECT_POST_APPROVED=true` before the approval exists: the
  flag is an operator statement of fact, and lying to it produces confusing
  runtime errors instead of an honest disabled state.

## 9. Common errors

| Code returned | Meaning | What to do |
|---|---|---|
| `access_token_invalid` | token expired or revoked | reconnect (→ `SOCIAL_AUTH_EXPIRED`) |
| `scope_not_authorized` | scope missing on this grant | reconnect and approve (→ `SOCIAL_PERMISSION_REQUIRED`) |
| `unaudited_client_can_only_post_to_private_accounts` | app not audited | only drafts/SELF_ONLY until review (→ `SOCIAL_APP_REVIEW_REQUIRED`) |
| `url_ownership_unverified` | `PULL_FROM_URL` on an unverified domain | use `FILE_UPLOAD` (→ `SOCIAL_MEDIA_INVALID`) |
| `duration_check_failed` / `picture_size_check_failed` | media outside limits | fix the file (→ `SOCIAL_MEDIA_INVALID`) |
| `rate_limit_exceeded` | too many calls | back off and retry (→ `SOCIAL_RATE_LIMITED`) |

Raw TikTok payloads are mapped in `src/lib/social/errors.ts`; the browser only
ever sees the normalized `{success:false, error:{code, platform, message, action}}`.

## 10. Testing

Offline (always run, no TikTok account needed):

```bash
npx tsc --noEmit
npm run test:unit        # tests/unit/tiktok-provider.test.ts covers PKCE, URL safety,
                        # capabilities, chunk planning, error mapping, approval flags
```

Live smoke test (needs the real developer app and a TikTok account you own):

1. Set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and a matching
   `TIKTOK_REDIRECT_URI`; start the dev server.
2. `POST /api/social/tiktok/connect` → open the returned `url`, authorize.
3. You should land on `/settings/accounts?success=tiktok_connected`, and the
   account row should show the TikTok display name and `username`.
4. `GET /api/social/accounts/<id>/capabilities` → check `draftUpload` /
   `directPublish` match your app's real approval state.
5. Draft upload: publish with `publishMethod: "draft_upload"` → the video must
   appear in the TikTok app under notifications/inbox.
6. Direct Post: only meaningful once the app is audited; until then expect
   `SELF_ONLY`.
7. Disconnect → `POST /api/social/accounts/<id>/disconnect` calls
   `/v2/oauth/revoke/`, clears the tokens and cancels pending jobs.

## 11. Production checklist

- [ ] Redirect URIs registered for every environment (exact match)
- [ ] `TIKTOK_CLIENT_SECRET` only in server env, never in a `NEXT_PUBLIC_*` var
- [ ] `TOKEN_ENCRYPTION_KEY` set and backed up (tokens are unrecoverable without it)
- [ ] `TIKTOK_DIRECT_POST_APPROVED` reflects the real review status
- [ ] Privacy levels come from the creator-info response, never hardcoded
- [ ] Error logs contain `provider/operation/account/job/result/duration` and no tokens
- [ ] Rate-limit backoff and the `idempotencyKey` unique index are in place before
      scheduling more than a handful of posts
- [ ] App review submitted for `video.publish` if public posting is required

## 12. What only you can do (TikTok developer portal)

```
[ ] Create the SocialOrc app in the TikTok developer portal
[ ] Copy the Client key  -> TIKTOK_CLIENT_KEY
[ ] Copy the Client secret -> TIKTOK_CLIENT_SECRET
[ ] Add the Redirect URI(s) exactly as used by each environment
[ ] Add the Login Kit for Web product
[ ] Add the Content Posting API product
[ ] Enable "Upload video" (video.upload)
[ ] Enable "Direct Post" (video.publish)
[ ] Request/approve the scopes user.info.basic, user.info.profile, video.upload, video.publish
[ ] Submit the app for TikTok review when Direct Post must be public
[ ] Set TIKTOK_UPLOAD_APPROVED / TIKTOK_DIRECT_POST_APPROVED once each is true
```

Nothing in this repository invents a client id, secret, domain or approval
status — if a value is unknown it is an empty env var, and the capability report
says the feature is unavailable.
