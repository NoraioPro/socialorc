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

### Media Storage
| Variable | Where to Get |
|----------|--------------|
| `BLOB_READ_WRITE_TOKEN` | [Vercel Dashboard](https://vercel.com/dashboard/stores) |

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

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

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
