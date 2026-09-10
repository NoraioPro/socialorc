# SocialOrc

**Smart multi-platform social media drafts + scheduling with a hard approval gate.**

SocialOrc is designed for users who want to automate social media posting without the risk of accidental publications. Content is drafted with AI assistance, reviewed and edited by humans, and only published after explicit approval.

## Key Features

- **Hard Approval Gate**: Nothing publishes without explicit user approval
- **AI-Assisted Drafting**: Generate platform-optimized content variants from a single idea
- **Multi-Platform Support**: LinkedIn, X (Twitter), Instagram, Facebook, TikTok, YouTube
- **Scheduling System**: Schedule approved posts for optimal times with Vercel Cron
- **Media Support**: Upload and attach images/videos to posts
- **Best-Time Suggestions**: Platform-specific posting time recommendations

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| LinkedIn | ✅ Reference Implementation | Personal profile posting via `w_member_social` scope. Architecture supports Company Pages with `w_organization_social`. |
| X (Twitter) | ⚡ Ready | OAuth 2.0 PKCE for text. Media upload requires OAuth 1.0a (v1.1 endpoint). Free tier: 50 tweets/day. |
| Instagram | ⚡ Ready | Requires Business/Creator account + Facebook Page link. Two-step container flow. JPEG only. |
| Facebook | ⚡ Ready | Pages API only (not personal profiles). Requires App Review for non-owned Pages. |
| TikTok | ⚡ Ready | Video-only. Unaudited apps limited to private/SELF_ONLY visibility. Requires TikTok audit for public posting. |
| YouTube | ⚡ Ready | Video uploads only. 1,600 quota units per upload (~6/day default). OAuth verification required. |

All adapters implement the same interface and are fully integrated into the publishing pipeline. Configure credentials in `.env` to enable each platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SocialOrc                                │
├─────────────────────────────────────────────────────────────────┤
│  Next.js App Router (TypeScript)                                │
│  ├── Dashboard UI (shadcn/ui + Tailwind)                        │
│  ├── API Routes (REST)                                          │
│  └── Vercel Cron (Publishing Worker)                            │
├─────────────────────────────────────────────────────────────────┤
│  Content Pipeline                                                │
│  ├── Draft → Pending Approval → Approved → Scheduled → Published│
│  └── Hard gate: No scheduling without APPROVED status           │
├─────────────────────────────────────────────────────────────────┤
│  Platform Adapters (Unified Interface)                          │
│  ├── LinkedIn (reference implementation)                        │
│  ├── X/Twitter, Instagram, Facebook, TikTok, YouTube            │
│  └── OAuth token encryption at rest                             │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                      │
│  ├── SQLite (dev) / PostgreSQL (prod)                           │
│  ├── Prisma ORM                                                  │
│  └── Vercel Blob (media storage)                                │
└─────────────────────────────────────────────────────────────────┘
```

## Post Status Workflow

```
DRAFT
  ↓ (submit for approval)
PENDING_APPROVAL
  ↓ (approve)     ↘ (reject)
APPROVED           DRAFT (with rejection reason)
  ↓ (schedule)
SCHEDULED
  ↓ (cron publishes)
PUBLISHING
  ↓ (success)     ↘ (failure)
PUBLISHED          FAILED (with retry)
```

**Critical**: Posts cannot be scheduled until they reach `APPROVED` status. This is the core approval gate.

## Getting Started

### Prerequisites

- Node.js 18+
- SQLite (dev) or PostgreSQL (production)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/socialorc.git
cd socialorc

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Configure your .env file (see Environment Variables section)

# Generate Prisma client and push schema
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

Visit `http://localhost:3000` and create an account to get started.

### First Steps

1. Register an account at `/register`
2. Go to Settings > Connected Accounts
3. Connect your social media accounts (requires platform credentials in `.env`)
4. Create your first post at Dashboard > Create Post
5. Review and approve your content
6. Schedule for publishing

## Environment Variables

Copy `.env.example` to `.env` and configure:

### Required

```env
# Database
DATABASE_URL="file:./dev.db"  # SQLite for dev
# DATABASE_URL="postgresql://user:pass@host:5432/socialorc"  # PostgreSQL for prod

# Authentication
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Token Encryption (encrypts OAuth tokens at rest)
TOKEN_ENCRYPTION_KEY="generate-with-openssl-rand-base64-32"

# Cron Authentication
CRON_SECRET="generate-with-openssl-rand-base64-32"
```

### Optional (AI Features)

```env
# OpenAI-compatible API for AI draft generation
OPENAI_API_KEY="sk-..."
OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional: custom endpoint
```

### Platform Credentials

See `.env.example` for the complete list. Each platform section includes:
- Required environment variables
- OAuth redirect URI format
- Links to developer portals
- Important API notes

## Connecting Platforms

### LinkedIn (Reference Implementation)

1. Create app at [LinkedIn Developer Portal](https://developer.linkedin.com/)
2. Add products: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn"
3. Set redirect URI: `{NEXTAUTH_URL}/api/social/linkedin/callback`
4. Copy Client ID and Client Secret to `.env`
5. OAuth Scopes: `openid`, `profile`, `email`, `w_member_social`

**Personal vs Company Pages**:
- Personal profile: Automatic with `w_member_social` (no approval needed)
- Company Pages: Requires `w_organization_social` + company admin role

### X (Twitter)

1. Create app at [X Developer Portal](https://developer.x.com/)
2. Enable OAuth 2.0 with PKCE
3. Set callback URL: `{NEXTAUTH_URL}/api/social/twitter/callback`
4. Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`
5. **For media uploads**: Also configure OAuth 1.0a credentials

**Important**: Free tier = 50 tweets/day. Basic ($200/mo) = 50K tweets/mo.

### Instagram

1. Create app at [Meta Developer Portal](https://developers.facebook.com/)
2. Add "Instagram Graph API" product
3. **Requirements**:
   - Instagram Business or Creator account (not personal)
   - Account must be linked to a Facebook Page
   - App Review required for non-test users
4. Permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list`

### Facebook Pages

1. Same Meta app as Instagram
2. Add "Facebook Login" product
3. Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_metadata`
4. **Note**: Posts to Pages only, not personal profiles
5. **Note**: App Review + Business Verification required for Advanced Access

### TikTok

1. Create app at [TikTok Developer Portal](https://developers.tiktok.com/)
2. Request Content Posting API access
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`
4. **Critical**: 
   - Unaudited apps: Private/SELF_ONLY visibility only
   - Public posting requires passing TikTok's audit
   - Access token expires in 24h (refresh token: 365 days)

### YouTube

1. Create project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable YouTube Data API v3
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials
5. Scopes: `youtube.upload`, `youtube.readonly`
6. **Note**: 
   - Each upload costs 1,600 quota units
   - Default daily quota: ~6 uploads
   - OAuth verification required for production

## Cron Job Setup

SocialOrc uses Vercel Cron to publish scheduled posts.

### Vercel (Recommended)

The `vercel.json` configuration runs the cron every 5 minutes:

```json
{
  "crons": [
    {
      "path": "/api/cron/publish",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Self-Hosted

Call the cron endpoint with authentication:

```bash
curl -X GET "https://your-domain/api/cron/publish" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## API Reference

### Posts

- `GET /api/posts` - List posts (filter by status, platform)
- `POST /api/posts` - Create draft
- `GET /api/posts/[id]` - Get post details
- `PATCH /api/posts/[id]` - Update post
- `DELETE /api/posts/[id]` - Delete post

### Approval Workflow

- `POST /api/posts/[id]/approve` - Approve, reject, or submit for approval
  - `{ "action": "submit" }` - Submit draft for approval
  - `{ "action": "approve" }` - Approve post
  - `{ "action": "reject", "reason": "..." }` - Reject with reason

### Scheduling

- `POST /api/posts/[id]/schedule` - Schedule approved post
  - `{ "scheduledFor": "2024-01-15T10:00:00Z" }`
- `DELETE /api/posts/[id]/schedule` - Unschedule post

### AI Generation

- `POST /api/posts/generate`
  - `{ "action": "generate", "idea": "...", "platforms": ["LINKEDIN", "TWITTER"] }`
  - `{ "action": "improve", "content": "...", "platform": "LINKEDIN", "instruction": "..." }`
  - `{ "action": "best-times", "platform": "LINKEDIN" }`

### Social Accounts

- `GET /api/accounts` - List connected accounts and platform status
- `DELETE /api/accounts?id=...` - Disconnect account
- `GET /api/social/connect?platform=LINKEDIN` - Get OAuth URL

### Media

- `GET /api/media` - List uploaded media
- `POST /api/media` - Upload file (multipart/form-data)
- `DELETE /api/media?id=...` - Delete media

## Development

```bash
# Run development server
npm run dev

# Run Prisma Studio (database GUI)
npx prisma studio

# Generate Prisma client after schema changes
npx prisma generate

# Push schema changes to database
npx prisma db push

# Lint
npm run lint

# Build for production
npm run build
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Configure PostgreSQL (Vercel Postgres or external)
5. Deploy

Cron jobs are automatically configured via `vercel.json`.

### Other Platforms

1. Build: `npm run build`
2. Start: `npm start`
3. Set up external cron to hit `/api/cron/publish`
4. Configure PostgreSQL database
5. Set all environment variables

## Security Considerations

- OAuth tokens are encrypted at rest using AES encryption
- Cron endpoint requires authentication via `CRON_SECRET`
- NextAuth handles session management securely
- All social platform communications use HTTPS

## Known Limitations

1. **TikTok**: Public posting requires passing TikTok's audit process
2. **Instagram**: Only Business/Creator accounts with Facebook Page link
3. **YouTube**: Default quota allows ~6 uploads/day
4. **X/Twitter**: Media upload requires separate OAuth 1.0a implementation
5. **Facebook**: Personal profile posting not supported (Pages only)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Built with Next.js, Prisma, shadcn/ui, and lots of OAuth documentation reading.
