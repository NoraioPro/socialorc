# SocialOrc Environment Setup

Quick checklist of secrets and configuration Hassan must provide.

## Required Secrets (Must Have)

| Variable | Where to Get | Notes |
|----------|--------------|-------|
| `DATABASE_URL` | Vercel Postgres / Neon / Supabase | PostgreSQL connection string for production |
| `NEXTAUTH_SECRET` | Generate locally | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | Generate locally | `openssl rand -base64 32` |
| `CRON_SECRET` | Generate locally | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your deployed URL | e.g., `https://socialorc.vercel.app` |

Optional: `OAUTH_STATE_SECRET` (signs the OAuth state cookie; falls back to `NEXTAUTH_SECRET`). Set it
separately so rotating one secret does not break the other.

## LinkedIn OAuth (Priority 1)

LinkedIn is the reference implementation and ready for personal profile posting.

| Variable | Where to Get |
|----------|--------------|
| `LINKEDIN_CLIENT_ID` | [LinkedIn Developer Portal](https://developer.linkedin.com/) |
| `LINKEDIN_CLIENT_SECRET` | Same as above |

### LinkedIn Setup Steps

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Create a new app
3. Add these products:
   - "Sign In with LinkedIn using OpenID Connect"
   - "Share on LinkedIn"
4. In Auth settings, add redirect URI:
   ```
   https://YOUR_DOMAIN/api/social/linkedin/callback
   ```
5. Copy Client ID and Client Secret to Vercel env vars

**Scopes requested automatically:** `openid`, `profile`, `email`, `w_member_social`

**Note:** Company Page posting requires `w_organization_social` scope - this is planned for later.

## Optional Platform Credentials

Configure these only for platforms you want to enable:

### X (Twitter)
| Variable | Where to Get |
|----------|--------------|
| `TWITTER_CLIENT_ID` | [X Developer Portal](https://developer.x.com/) |
| `TWITTER_CLIENT_SECRET` | Same as above |

### Instagram
| Variable | Where to Get |
|----------|--------------|
| `INSTAGRAM_APP_ID` | [Meta Developer Portal](https://developers.facebook.com/) |
| `INSTAGRAM_APP_SECRET` | Same as above |

**Requirements:** Business/Creator Instagram account linked to Facebook Page

### Facebook Pages
| Variable | Where to Get |
|----------|--------------|
| `FACEBOOK_APP_ID` | [Meta Developer Portal](https://developers.facebook.com/) |
| `FACEBOOK_APP_SECRET` | Same as above |

### TikTok
| Variable | Where to Get |
|----------|--------------|
| `TIKTOK_CLIENT_KEY` | [TikTok Developer Portal](https://developers.tiktok.com/) |
| `TIKTOK_CLIENT_SECRET` | Same as above |

**Warning:** Unaudited apps can only post as private/SELF_ONLY visibility.

### YouTube
| Variable | Where to Get |
|----------|--------------|
| `YOUTUBE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) |
| `YOUTUBE_CLIENT_SECRET` | Same as above |

## Optional Features

### AI Draft Generation
| Variable | Where to Get |
|----------|--------------|
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com/) |

Optional: `AI_EMBED_MODEL` sets the embedding model for Brand Brain knowledge sources. It defaults to
`text-embedding-3-small`, uses the account's own key and base URL, and is ignored without a key (sources
are then searched by keyword and labelled as such).

### Media Storage
| Variable | Where to Get |
|----------|--------------|
| `BLOB_READ_WRITE_TOKEN` | [Vercel Dashboard](https://vercel.com/dashboard/stores) |

Required in production for media posts. When set, the publishing adapters accept media only from this
deployment's own Blob store, so the token must belong to the store the app uploads to.

### Telegram
| Variable | Where to Get |
|----------|--------------|
| `TELEGRAM_BOT_TOKEN` | Unused. Do not set it: each customer creates their own bot with [@BotFather](https://t.me/BotFather) and pastes its token into Settings |
| `TELEGRAM_CHAT_ID` | Unused. Do not set it: customers choose their own chat when they connect |

## Vercel Deployment Checklist

1. Push code to GitHub
2. Import project in Vercel
3. Add all environment variables above
4. Set up PostgreSQL database (Vercel Postgres recommended)
5. Deploy

Cron job is auto-configured via `vercel.json` (runs every 5 minutes).

## Local Development

```bash
# Copy example env
cp .env.example .env

# Generate secrets
openssl rand -base64 32  # Run 3 times for NEXTAUTH_SECRET, TOKEN_ENCRYPTION_KEY, CRON_SECRET

# Use SQLite for local dev (already in .env.example)
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"

# Generate Prisma client and apply migrations (do not use `db push`: it hides drift)
npx prisma generate
npx prisma migrate deploy

# Start dev server
npm run dev
```

## Mock Mode

The system works without live social credentials in mock/dev mode:
- Create drafts normally
- Approve drafts (approval gate enforced)
- Schedule approved posts
- Mock adapter simulates successful publishing

This allows full workflow testing without connecting real accounts.

## TikTok (Social Connection Layer — first provider)

Docs: `docs/social-integrations/tiktok.md` · provider: `src/lib/adapters/tiktok.ts`

| Variable | Where to Get | Notes |
|----------|--------------|-------|
| `TIKTOK_CLIENT_KEY` | TikTok developer portal → Manage apps | "Client key" |
| `TIKTOK_CLIENT_SECRET` | Same screen | Server-side only, never `NEXT_PUBLIC_*` |
| `TIKTOK_REDIRECT_URI` | Optional | Defaults to `APP_URL/api/social/tiktok/callback`; must match the portal exactly |
| `TIKTOK_PKCE_METHOD` | Optional | `S256` (default) or `plain` if TikTok rejects S256 |
| `TIKTOK_UPLOAD_APPROVED` | Set after enabling Content Posting API upload | `true` unlocks `draftUpload` |
| `TIKTOK_DIRECT_POST_APPROVED` | Set only after TikTok approves Direct Post | `true` unlocks `directPublish`; until then TikTok allows SELF_ONLY only |

Scopes requested: `user.info.basic`, `user.info.profile`, `video.upload`, `video.publish`.
