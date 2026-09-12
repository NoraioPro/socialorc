# Social integrations

One provider architecture, one connection service, five platforms. This folder
documents each connector: what the platform allows today, what the developer app
must be configured with, and what SocialOrc does or does not implement.

| Platform | Doc | State |
|---|---|---|
| TikTok | [tiktok.md](./tiktok.md) | provider implemented (connect, identity, capabilities, draft upload, direct post, status, revoke) |
| YouTube | — | not started |
| Meta (Facebook + Instagram) | — | not started |
| LinkedIn | — | not started |
| X | — | not started |

## The architecture in one screen

```
Frontend (existing UI, unchanged)
   │  POST /api/social/:platform/connect        → { url }
   │  GET  /api/social/:platform/callback       ← provider redirect
   │  GET  /api/social/accounts
   ▼
SocialOrc API routes
   ▼
src/lib/oauth/callback.ts        one shared callback: state + PKCE validation,
   │                             token exchange, encrypted persistence
   ▼
src/lib/adapters/<platform>.ts   the provider (endpoints, scopes, limits)
   ├── src/lib/social/approval.ts     env credentials + app-review state
   ├── src/lib/social/capabilities.ts per-account capability report
   ├── src/lib/social/media.ts        pre-flight media validation
   ├── src/lib/social/errors.ts       normalized error codes
   └── src/lib/social/pkce.ts         CSPRNG verifier + S256 challenge
   ▼
Prisma: SocialAccount (+ scopes, accountType, capabilities, status fields)
```

Key rules the code follows:

- **Connecting and publishing are different permissions.** A token is stored
  with the scopes it was actually granted; capabilities are computed from those
  scopes, the account type and whether the app has passed the platform's review.
- **The PKCE verifier never leaves the server.** It is stored in the OAuth state
  cookie (`src/lib/oauth/state.ts`), not in the `state` parameter.
- **Tokens are encrypted at rest** with `TOKEN_ENCRYPTION_KEY` and never
  returned to the browser.
- **A capability is never advertised unless it works.** Missing scope, missing
  review or an unimplemented endpoint all surface as a `limitation` with a code
  the UI can explain.

## Environment variables

Per platform, server-side only (never `NEXT_PUBLIC_*`):

```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=            # optional; defaults to APP_URL/api/social/tiktok/callback
TIKTOK_PKCE_METHOD=             # optional: S256 (default) | plain
TIKTOK_DIRECT_POST_APPROVED=    # "true" only after TikTok audits the app
TIKTOK_UPLOAD_APPROVED=         # "true" when Content Posting API upload is enabled
```

Shared: `APP_URL` (or `NEXTAUTH_URL`) is the public origin callback URLs are
built from. `TOKEN_ENCRYPTION_KEY` protects every stored token.

## Adding a platform

1. Copy `src/lib/social/tiktok/constants.ts` and fill it **from the current
   official docs**, with the URL you read next to each constant.
2. Implement the provider in `src/lib/adapters/<platform>.ts` (extend
   `BasePlatformAdapter`, use `createAuthorizationRequest` when the platform
   supports PKCE, and `getCapabilities`).
3. Add the capability branch in `src/lib/social/capabilities.ts` and the env
   wiring in `src/lib/social/approval.ts`.
4. Nothing else: the shared callback route, the state handling, the encryption
   and the account storage are already generic.
