# SocialOrc PRD v1 — Manage

> **Product Requirements Document for Generation 1: The Manage Foundation**

---

## Overview

SocialOrc v1 delivers reliable multi-platform social media management with an uncompromising approval gate. Users can draft content with AI assistance, review and edit, approve, schedule, and publish—with zero risk of accidental publication.

**Full long-term vision**: See [docs/VISION-2.0.md](./VISION-2.0.md)

---

## Problem Statement

Social media managers, creators, and businesses face:

1. **Risk of accidental publication**: One wrong click can publish unreviewed content
2. **Platform fragmentation**: Managing multiple platforms requires multiple tools and logins
3. **Content creation fatigue**: Constantly producing platform-optimized content is exhausting
4. **No unified view**: Calendar, analytics, and queues scattered across platforms
5. **Timing uncertainty**: Guessing when to post instead of data-driven scheduling

---

## Goals

1. **Zero accidental publishes**: Hard approval gate is sacred—nothing publishes without explicit human approval
2. **Multi-platform publishing**: Single workflow for LinkedIn, X, Instagram, Facebook, TikTok, YouTube
3. **AI-assisted drafting**: Help users create platform-optimized content faster
4. **Unified calendar**: One view of all scheduled content across all platforms
5. **Basic growth intelligence**: Growth Score, Traction Score, and actionable recommendations

---

## Non-Goals (v1)

- Full agent fleet (multi-agent architecture is Gen2+)
- SocialOrc Network / native feed (Gen3)
- Gamification / XP / reputation system (Gen3)
- Connector Marketplace (Gen4)
- Paid advertising automation (future)
- Social commerce features (future)
- Community features (future)
- Autopilot / fully automated publishing (future—always requires approval gate option)

---

## The Approval Gate (Sacred)

**This is the core product principle. It is non-negotiable.**

```
Content cannot be scheduled until it reaches APPROVED status.
Content cannot be published until it is scheduled.
There is no way to bypass, disable, or shortcut this gate.
```

The approval gate exists because:
- One bad post can damage a brand permanently
- AI-generated content requires human review
- Scheduling tools have historically caused embarrassing accidents
- Trust is built through predictable, safe behavior

**Any feature that weakens the approval gate is rejected by design.**

---

## Supported Platforms

### v1 Target Platforms

| Platform | Scope | OAuth | Notes |
|----------|-------|-------|-------|
| **LinkedIn** | Personal profile (reference impl) | OAuth 2.0 | `w_member_social` scope. Company Pages supported via `w_organization_social`. |
| **X (Twitter)** | Text + media | OAuth 2.0 PKCE | Media requires OAuth 1.0a for v1.1 endpoint. Free tier: 50/day. |
| **Instagram** | Business/Creator accounts | OAuth 2.0 | Requires FB Page link. Two-step container flow. JPEG only. |
| **Facebook** | Pages only | OAuth 2.0 | Not personal profiles. Requires App Review for scale. |
| **TikTok** | Video | OAuth 2.0 | Unaudited apps: SELF_ONLY visibility. Audit required for public. |
| **YouTube** | Video uploads | OAuth 2.0 | 1,600 quota units per upload (~6/day default). |

### Adapter Architecture

All platforms implement a unified adapter interface:

```typescript
interface SocialAdapter {
  platform: Platform;
  connect(userId: string): Promise<AuthResult>;
  disconnect(accountId: string): Promise<void>;
  publish(post: Post, account: Account): Promise<PublishResult>;
  getProfile(account: Account): Promise<ProfileInfo>;
  validateContent(content: string, media?: Media[]): ValidationResult;
}
```

**Architecture note**: The adapter registry is designed to support the future Connector Framework. New platforms can be added by implementing the adapter interface. However, v1 does not include the Connector Marketplace, SDK, or community-contributed connectors—those are Gen4 features.

---

## Technical Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Framework** | Next.js 15 (App Router) | React Server Components, TypeScript |
| **Hosting** | Vercel | Edge functions, cron jobs |
| **Database** | SQLite (dev) / PostgreSQL (prod) | Via Prisma ORM |
| **Auth** | NextAuth.js | Session management, OAuth flows |
| **UI** | shadcn/ui + Tailwind CSS | Component library |
| **Media Storage** | Vercel Blob | Image/video uploads |
| **Cron** | Vercel Cron | 5-minute publishing worker |
| **Encryption** | AES | OAuth tokens encrypted at rest |

### Optional Dependencies

| Feature | Dependency | Notes |
|---------|------------|-------|
| AI Draft Generation | OpenAI API (or compatible) | Optional—app works without it |

---

## Post Status Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        POST LIFECYCLE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   DRAFT                                                         │
│     │                                                           │
│     ▼ (submit for approval)                                     │
│   PENDING_APPROVAL                                              │
│     │                     │                                     │
│     ▼ (approve)           ▼ (reject)                           │
│   APPROVED                DRAFT (with rejection reason)         │
│     │                                                           │
│     ▼ (schedule)                                                │
│   SCHEDULED                                                     │
│     │                                                           │
│     ▼ (cron picks up)                                          │
│   PUBLISHING                                                    │
│     │                     │                                     │
│     ▼ (success)           ▼ (failure)                          │
│   PUBLISHED               FAILED (with error, retry eligible)   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

CRITICAL: DRAFT → SCHEDULED transition is BLOCKED.
          Only APPROVED posts can be scheduled.
```

### Status Definitions

| Status | Description | Allowed Transitions |
|--------|-------------|---------------------|
| `DRAFT` | Work in progress | → `PENDING_APPROVAL` |
| `PENDING_APPROVAL` | Awaiting human review | → `APPROVED`, → `DRAFT` (reject) |
| `APPROVED` | Ready for scheduling | → `SCHEDULED` |
| `SCHEDULED` | Queued for publication | → `PUBLISHING`, → `APPROVED` (unschedule) |
| `PUBLISHING` | Currently being sent to platform | → `PUBLISHED`, → `FAILED` |
| `PUBLISHED` | Successfully posted | Terminal state |
| `FAILED` | Publication error | → `SCHEDULED` (retry) |

---

## Core Features (v1)

### Brand Brain
- Profile setup: name, bio, voice description, goals
- Brand voice settings for AI content generation
- Platform-specific profile variations

### AI Studio
- Generate draft variants from a single idea
- Platform-specific content optimization
- Improve/refine existing content
- Requires OpenAI API key (optional—manual drafting works without it)

### Multi-Platform Drafting
- Single editor, multiple platform targets
- Platform-specific character limits and validation
- Media attachment support (images, videos)
- Preview per-platform rendering

### Approval Workflow
- Submit draft for approval
- Approve or reject with reason
- Approval audit trail

### Calendar & Scheduling
- Unified calendar view across all platforms
- Schedule approved posts for specific times
- Queue management and reordering
- Time zone handling

### Publishing
- Vercel Cron-based publishing worker (5-minute intervals)
- Retry logic for transient failures
- Error reporting and status tracking

### Analytics (Basic)
- Per-post performance metrics (from platform APIs where available)
- Growth Score: composite health metric
- Traction Score: recent momentum indicator

### Best-Time Recommendations
- Platform-specific optimal posting times
- Based on heuristics and historical data
- AI-enhanced recommendations (when OpenAI configured)

### Content Repurposing
- Adapt content from one platform to another
- AI-assisted reformatting for platform norms

### Growth Command Center
- Dashboard overview of social health
- Growth Score and Traction Score display
- Actionable recommendations
- Scheduled content overview

---

## Mock Adapters (Development)

For local development without real platform credentials:

```env
MOCK_SOCIAL_ADAPTERS="true"
```

Mock adapters:
- Simulate OAuth connection flows
- Accept publish requests and return success
- Generate fake analytics data
- Enable full workflow testing locally

This allows developers and testers to exercise the complete approval → schedule → publish pipeline without configuring real platform credentials.

---

## Success Metrics

### Primary (Non-Negotiable)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Accidental publishes | **0** | Any publish without APPROVED status is a critical bug |
| Approval gate bypasses | **0** | No code path allows scheduling unapproved content |

### Secondary (v1 Quality)

| Metric | Target | Measurement |
|--------|--------|-------------|
| LinkedIn E2E | Working | OAuth → Draft → Approve → Schedule → Publish succeeds |
| All adapters integrated | 6 platforms | LinkedIn, X, IG, FB, TikTok, YouTube |
| Cron reliability | 99%+ | Scheduled posts publish within 10 minutes of scheduled time |
| AI draft generation | Working | Generate endpoint produces usable drafts |

---

## Acceptance Criteria

### For Merge

- [ ] Approval gate enforced in code: `DRAFT` → `SCHEDULED` transition blocked
- [ ] All 6 platform adapters implement unified interface
- [ ] OAuth flows work for all platforms (with credentials configured)
- [ ] Mock adapters work for local development
- [ ] Post status workflow fully implemented
- [ ] Calendar displays scheduled posts
- [ ] AI generation endpoint functional (when OPENAI_API_KEY set)
- [ ] No TypeScript errors
- [ ] ESLint passes

### For Deploy

- [ ] All merge criteria met
- [ ] Environment variables documented
- [ ] Database migrations run cleanly
- [ ] Vercel cron configuration correct
- [ ] Token encryption working

### For LinkedIn Smoke Test

- [ ] OAuth flow completes successfully
- [ ] User can create draft
- [ ] User can submit for approval
- [ ] User can approve
- [ ] User can schedule
- [ ] Cron publishes to LinkedIn
- [ ] Post appears on LinkedIn profile

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Token encryption | AES encryption for OAuth tokens at rest |
| Cron authentication | Bearer token via `CRON_SECRET` |
| Session security | NextAuth with secure session handling |
| HTTPS only | Enforced in production |
| No token logging | Sensitive values never logged |

---

## Out of Scope (Explicitly)

To maintain focus, the following are explicitly **not** part of v1:

1. **SocialOrc Network** — No native feed, no social features
2. **Gamification** — No XP, levels, or reputation system
3. **Communities** — No group features
4. **Creator Marketplace** — No matchmaking or partnerships
5. **Connector SDK** — No third-party adapter development
6. **Autopilot** — No automated publishing without approval
7. **Paid Advertising** — No ad management or smart bidding
8. **Social Commerce** — No product tagging or shops

These features are documented in [VISION-2.0.md](./VISION-2.0.md) as future generations.

---

## Architecture Notes for Future Growth

While v1 keeps scope tight, the architecture should accommodate future expansion:

1. **Adapter Registry**: Design supports adding new platform adapters without core changes
2. **Status Machine**: Post workflow can be extended with new states if needed
3. **Extensible Schema**: Database schema has room for future entities (campaigns, communities, etc.)
4. **API Structure**: REST endpoints follow patterns that can expand to full API platform

**However**: Do not build these future features now. Focus is on shipping a reliable v1.

---

## References

- [VISION-2.0.md](./VISION-2.0.md) — Full long-term product vision
- [README.md](../README.md) — Setup and usage documentation
- [ENV.md](../ENV.md) — Environment variable reference

---

*Last updated: September 2026*
*Version: 1.0*
*Status: PRD for Generation 1 (Manage)*
