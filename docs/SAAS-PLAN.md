# SocialOrc → SaaS: what it takes

**v2** · 2026-10-01 · read-only audit of `main` @ `e1e4ad8` by Hermes, then
reviewed and corrected by Claude Code (two factual errors of mine required four
model classification fixes; all corrections are folded in below and the review is
at `~/Downloads/socialorc-saas-plan-review-20261001-*.md`).

Every claim is cited to a file and line, or marked **UNVERIFIED** when it was not
measured. Nothing here has been implemented.

> Caveat from the review: the audit ran against a **dirty tree** — `roles.ts`,
> `auth.ts` and `dev-login.ts` carried another agent's uncommitted work. Line
> numbers still matched, but this is not a clean-`e1e4ad8` audit.

---

## 1. Verdict

SocialOrc is not a SaaS and the gap is not cosmetic. It is a **single-tenant
publishing tool**: one login owns its own posts, accounts and media, and there is
no concept of an organisation, a colleague, an invitation, a plan or a payment.

The schema, however, reads like a half-built SaaS — `Workspace`,
`WorkspaceMember`, and a whole OrcBrain knowledge domain — while in fact roughly
half of it has never been called. That is the trap this document exists to
disarm.

## 2. What is wired vs. what is decoration (measured)

Method: `(prisma|db|tx).<model>` across `src`, `scripts` and `tests`, verified
independently by Claude Code.

| Domain | Models | State |
|---|---|---|
| Publishing core | `User`, `Brain`, `SocialAccount`, `Post`, `MediaAsset`, `PostMedia`, `ScheduledJob` | **live** |
| Brand voice | `BrandBrain` (`api/brand-brain/route.ts:63,96,109,146`) | **live**, per-user, `userId @unique` |
| Social feed | `Friendship` (`api/feed/route.ts:15`), `FeedReaction`, `FeedComment` | **live** |
| Team / tenancy | `Workspace`, `WorkspaceMember` | **dead** — 0 call sites |
| OrcBrain knowledge | `BrainSource`, `BrainChunk`, `BrainMemory`, `BrainInsight`, `Conversation`, `Message`, `MessageAttachment`, `AiAgent` | **dead** — 0 call sites |
| Network | `NativePost` | **dead** — 0 call sites |
| Other | `BrandProfile` (0 call sites, workspace-keyed), `PublishingJob` (0 references), `PlatformConstraints` (global reference data) | **dead** |

Corrections from the review, recorded because I got them wrong first:

- `BrandBrain` is **live**; `BrandProfile` is **dead**. My aggregate count could
  not tell the two apart and I attributed the 4 call sites to the wrong one.
- `PublishingJob` is **not** live. The cron worker uses `ScheduledJob` only. It
  is another unwired model.
- `Friendship` is **live**, so `/api/feed` is a **live cross-user read path** —
  the plan must say what it returns, because it is the one existing feature that
  already crosses users and it collides with any "cross-tenant read → 404"
  guarantee.

Supporting evidence:

- `prisma/schema.prisma:116-121` — `SocialAccount.workspaceId` is nullable and the
  comment says so outright: *"the (not yet wired up) team/brand knowledge
  container"*. `Workspace` (`:407`) and `WorkspaceMember` (`:426`) exist and
  nothing writes them.
- `workspaceId` appears in `src/` only as a parameter in
  `src/lib/brain/ingest.ts:191,204,222,262,287`; **no `src/` file imports that
  module**, though `tests/unit/brain-chat.test.ts:36` does — so treat OrcBrain as
  tested-but-unwired, not as absent.
- `src/lib/signup-policy.ts:4` states the product identity: *"SocialOrc is a
  single-workspace product, so registration is not a free-for-all."*
- Roles: `src/lib/roles.ts:8` = `ADMIN | MANAGER | EDITOR | CLIENT`; the role is
  stored **on `User`**, globally, defaulting to `ADMIN` (`schema.prisma:47-49`).
  `WorkspaceMember.role` (`:430`) defaults to `MEMBER` and the five-role
  vocabulary exists **only in a doc comment** (`:425`) — it is not enforced
  anywhere.
- Tenant keys are `userId` only: `Post.userId` (`:187`), `MediaAsset.userId`
  (`:278`), `PublishingJob.userId` (`:326`), `Brain.userId` (`:90`).
- `ScheduledJob` (`:358-373`) — **the table cron actually claims work from** — has
  **no tenant column** and **no relation to `Post`**, so orphan jobs are possible.
- No billing dependency, no outbound-email dependency in `package.json`.
- Migrations: `prisma/migrations` has **7** directories (SQLite),
  `prisma/migrations-postgres` has **1** — a squashed `0_init` that already
  contains the `Workspace` tables (`0_init/migration.sql:246`).

Surface: **44 API routes**, 16 dashboard pages (20 `page.tsx` total). But the
number that matters for Phase 0 is call sites, not routes — see §5.

## 3. The decision that comes first: Workspace or Brain?

The product has two container concepts and has never chosen between them.

- `Brain` (`:88`) — *"A project: the container social accounts are connected
  into… one per brand/client"*. Per **user**. Live: 11 call sites, UI, its own
  routes, `SocialAccount.brainId`.
- `Workspace` (`:407`) — the team container. Never used.

**Recommended: Workspace is the tenant; Brain is a brand inside it.**

```
Workspace (tenant: members, billing, ownership)
└── Brain (brand / client project — the social connections)
    └── SocialAccount, Post, MediaAsset, jobs
```

This is the Buffer/Hootsuite shape and it is what the schema's comments were
reaching for. The alternative — `Brain` as the tenant — is not absurd: brains are
live, agencies bill per client, and it removes a key. But it gives up seats and
has no home for a subscription.

Three consequences the first draft missed, all of which are cheap **now** and
expensive after launch:

1. **Brand knowledge belongs at `brainId`, not `workspaceId`.**
   `BrandProfile.workspaceId` is `@unique` (`:446`) and the OrcBrain comment says
   "one brain per workspace". But the product's brand unit is the `Brain`. An
   agency workspace with five clients would get **one** voice profile. Those
   tables are dead, so moving `BrandProfile` and the knowledge tables to
   `brainId` costs nothing today.
2. **`CLIENT` cannot be workspace-wide.** An agency's client should see one brand.
   With role stored per workspace, inviting a client exposes **every** brand. The
   role needs an optional brain scope, or brands must be tenants.
3. **Two keys on every query.** The resolver needs `requireWorkspace()` *and* a
   brain resolver. That double key is the real cost of this shape.

## 4. Target data model

| Model | Change | Backfill | Final |
|---|---|---|---|
| `Workspace` | `plan`, `stripeCustomerId`, `trialEndsAt`, `seats` | **one row for the existing deployment** | + settings, `createdBy` |
| `WorkspaceMember` | `status`, `invitedBy`, `invitedAt`, `brainId?` (for CLIENT scope) | memberships mapped from today's roles | source of truth for roles |
| `Brain` | `workspaceId` | → the deployment's workspace | NOT NULL; fix `isDefault` |
| `Post`, `MediaAsset` | `workspaceId` | denormalised from owner | NOT NULL |
| `ScheduledJob` | `workspaceId` (**metering and fairness, not filtering** — see §7) | from its post | NOT NULL after orphans are cleared |
| `SocialAccount.workspaceId` | — | → workspace | NOT NULL; **change `onDelete: SetNull` → `Cascade`/`Restrict`** |
| `PostMedia` | server-side same-workspace check on write | — | no tenant key needed, but the check is mandatory |
| `BrandProfile`, knowledge tables | move key `workspaceId` → `brainId` | — | `@unique` becomes per-brain |
| `User.role` | stop using | copied into `WorkspaceMember.role` | per-workspace |
| **new** `Invitation` | — | — | email, role, `brainId?`, token, expiry, `acceptedAt` |
| **new** `Subscription` | — | — | provider ids, status, period, seats |
| **new** `SubscriptionEvent` | — | — | normalized webhook log, idempotent on provider event id |
| **new** `UsageCounter` | — | — | per workspace per period: posts published, AI credits, accounts |
| **new** `AuditLog` | — | — | actor, action, target, before/after |

Explicitly **not** stamped, and the document should say so: `Account`,
`Session` (unused — the app is JWT-based), `VerificationToken` (auth-level;
**invite tokens must not reuse it**), `PlatformConstraints` (global reference
data).

## 5. Phases, reordered by the review

Two ordering rules the first draft got wrong: **the role vocabulary must be
decided before roles are copied** into `WorkspaceMember`, and **Phase 1 cannot
ship before Phase 0's backfill**, because `WorkspaceMember` needs workspace rows
and the resolver.

**Phase 0's real cost is ~126 call sites, not 44 routes** — `post` 56,
`socialAccount` 29, `scheduledJob` 17, `brain` 11, `mediaAsset` 9, `postMedia` 4.
"3–5 days" was optimistic; call it a week.

### Phase 0 — tenancy foundation (no behaviour change)
- Add nullable keys; deploy writers; backfill; verify; *then* NOT NULL (§6).
- One resolver, `requireWorkspace()`, replacing `session.userId` as the scope key
  in every route. No route hand-rolls it.
- Move `getOrCreateDefaultBrain(userId)` / `resolveBrainForUser(userId, …)`
  (`src/lib/brains.ts`) to workspace scope — today teammates cannot resolve each
  other's brains and every joining member lazily creates another "Default".
- **Verification:** permanent isolation suite — two workspaces, cross-tenant
  read/write/delete on posts, media, accounts and jobs all 404.

### Phase 1 — workspaces as first-class objects
- Workspace create/rename, switcher, members list.
- Roles move from `User.role` to `WorkspaceMember.role`, using the vocabulary
  decided in Phase 3.
- **Role must be re-resolved per request.** `auth.ts:267-280` puts the role in
  the **JWT**, so "a role change takes effect on the next request" is false
  unless the session callback re-reads `WorkspaceMember`. The first draft missed
  this.

### Phase 2 — collaboration without email dependency
Invite by **copy-link** first (customer-visible teammate collaboration, no new
dependency), then add the email provider: `Invitation` model, invite API, accept
flow, seat enforcement, resend/revoke/expiry. Email must never block the invite
from being recorded.

### Phase 3 — RBAC unification (*before* the role copy)
One vocabulary — recommend the schema's `OWNER | ADMIN | EDITOR | MEMBER |
VIEWER`, since that is what customers will see — one matrix, owner-only actions.
Introduce `brainId` scoping for the `CLIENT` role (§3.2).

### Phase 4 — plans and limits (no payment)
`src/lib/plans.ts`: accounts, seats, posts/month, AI credits. Enforced
server-side at the mutation, surfaced before the limit, metered via
`UsageCounter`.

### Phase 5 — billing
Provider-neutral `Subscription` + `SubscriptionEvent`, idempotent on the provider
event id, entitlements read from **our** row and never from the provider on the
request path. Provider choice is §8.4 and it changes how much of this is custom
code.

### Phase 6 — SaaS operations
Support/admin view, `AuditLog`, data export/deletion (GDPR), Terms/Privacy,
onboarding wizard, pricing page.

### The smaller first slice (review recommendation)
Deliver value before the big migration completes:
1. **Ship the Telegram per-tenant fix now** — it is a live cross-tenant bug and
   does not depend on any of this.
2. Backfill the existing deployment into one workspace; apply
   `requireWorkspace()` to `Brain`, `SocialAccount`, `Post`, `MediaAsset` only.
3. **Copy-link invites** — teammate collaboration, customer-visible, no email
   provider.

## 6. Migration, backfill and deploy order

### The order (the first draft had this wrong)
The draft said *nullable → backfill → deploy writers*, which leaves every row
created in between unstamped. Correct:

1. Add nullable columns.
2. **Deploy code** that creates a workspace + owner membership at signup and at
   OAuth sign-up, and stamps new rows.
3. Backfill.
4. **Verify** no user lacks membership, no null stamps, no dangling workspace ids.
5. *Then* the NOT NULL migration.

An early NOT NULL migration makes `migrate deploy` fail — and it runs on every
build, so **every** deploy fails, including hotfixes.

### "One workspace per user" was wrong
Today's deployment is **one workspace with `ADMIN`, `EDITOR` and `CLIENT`
users**, not many single-user workspaces. Backfill must create **one workspace
for the deployment** and map today's roles onto memberships.

That mapping is **lossy**: `MANAGER` has no equivalent in the five-role
vocabulary, and mapping it to `ADMIN` silently grants `posts:delete` and
`users:manage`. This is why the vocabulary decision (Phase 3) precedes the copy.

Backfill sequence: create workspaces (collision-safe slugs, `slug` is unique) →
memberships → stamp `Brain` → stamp `SocialAccount` asserting
`brain.workspaceId == account.workspaceId` → stamp `Post` and `MediaAsset` →
migrate `BrandBrain` → `BrandProfile` → stamp `ScheduledJob` through its post,
**after deleting or quarantining orphan jobs**.

### Deploy hazards, corrected
1. `migrate-deploy.mjs:22-30` exits **0** when `DIRECT_URL` is unset. **VERIFIED.**
2. `prisma7.config.ts` **throws** when `DATABASE_URL` is missing, so the build
   fails before that path. The first draft omitted this.
3. `migrate-deploy` runs on every build — **if preview deployments share the
   production database env, previews migrate production**. Env scoping
   **UNVERIFIED**; check before trusting previews.
4. Every schema change needs **both** histories: `prisma/migrations` (SQLite) and
   `prisma/migrations-postgres`, with `npm run db:pg:schema` regenerating
   `schema.postgres.prisma` (the generator aborts unless exactly one line
   differs).
5. Prisma has no down migrations. Forward-only; rollback is a new migration.

## 7. Multi-tenant checklist — including what the first draft got wrong

- **The cron claim must stay global.** I wrote that it "must filter by tenant" —
  wrong. A single global worker is the right shape; a tenant filter would starve
  other tenants. Add `workspaceId` for **metering, per-tenant caps and fair
  ordering**.
- **Throughput ceiling:** `cron/publish/route.ts:85` takes the 10 oldest pending
  jobs globally and `vercel.json` runs every 5 minutes. That is a hard cap of
  **10 jobs per 5 minutes across all tenants**; one bulk scheduler starves
  everyone. Fix before onboarding paying customers.
- No tenant id may be optional, and never an empty string — both silently disable
  filtering.
- Cross-tenant attempts become a **permanent suite**: read, write, delete, per
  resource.
- **`PostMedia` has no tenant key and no composite constraint** — nothing stops
  attaching another tenant's `MediaAsset` to your post. Server-side same-workspace
  check on write.
- **`SocialAccount` unique `[platform, platformUserId]` (`:168`) is global** — a
  second tenant cannot connect an account already connected elsewhere, and an
  upsert on that key could overwrite another tenant's tokens.
- **`SocialAccount.workspace` is `onDelete: SetNull` (`:159`)** — deleting a
  workspace orphans rows holding live OAuth tokens.
- Blob paths are `socialorc/<userId>/…` and **existing blobs cannot be cheaply
  renamed**. The ownership check must accept **both** legacy `userId` paths and
  new `workspaceId` paths — the first draft said paths simply change. Also:
  Blob URLs are public, so the path prefix is not access control.
- `MediaAsset` has `url` and `blobPath` — **there is no `blobUrl` column**.
- **`Post.platformContent` (JSON) is unstamped** and can embed media URLs the
  adapters later fetch. Validate on write.
- `approvedBy` (`:207`) is a plain string with no FK; per-workspace roles do not
  break it, and nothing blocks self-approval.
- **`/api/feed` is a live cross-user read path** (§2) — decide whether it is
  workspace-scoped or a public network feature before writing the isolation suite.
- Privileged actions (role change, invite, billing, workspace delete) write an
  `AuditLog` row.
- **Signup inverts.** `signup-policy.ts` and `selfSignupRole` make the first
  signup `ADMIN` and everyone after `EDITOR`. Under SaaS every signup creates its
  own workspace as `OWNER` — `auth.ts:~97`'s OAuth role assignment needs the same
  change.

## 8. Decisions only the owner can make

> **Decided 2026-10-04 by the owner** — "don't stop until finish all this", i.e. go on the
> recommendations below. Recorded here so the phases can be executed without re-asking.
>
> **1. Workspace is the tenant; Brain is a project inside it** (§3). The three §3
> consequences are accepted as part of the work: brand knowledge moves to `brainId`,
> `CLIENT` gets an optional brain scope, and the resolver carries two keys.
>
> **2. Role vocabulary — five, but NOT the five §3 and §5 propose.** The recommendation
> `OWNER | ADMIN | EDITOR | MEMBER | VIEWER` **cannot map today's roles without changing
> who can do what**: `MANAGER` has no equivalent in it, and mapping `MANAGER → ADMIN`
> silently grants `posts:delete` and `users:manage` — precisely the lossy copy this
> document warns about above. The vocabulary is therefore
> **`OWNER | ADMIN | MANAGER | EDITOR | VIEWER`**, with **`ADMIN` → `OWNER`** and
> `MANAGER`, `EDITOR`, `CLIENT` → `VIEWER` unchanged. Every existing account keeps exactly
> the permissions it has today — the mapping is lossless and grants nothing new. The
> addition that SaaS actually needs is `OWNER`: the seat that can hold billing and delete
> the workspace. `ADMIN` becomes the admin-below-owner seat, unused until somebody is
> invited into it.
>
> Items **3–5** (plans and limits, payment provider, email provider) remain open and are
> needed by Phases 4, 5 and 5 respectively. Item **6 is closed**: platform credentials stay
> a *shared application* — one registered app per platform, read from the deployment's env,
> which is what the whole connector layer does today (`YOUTUBE_CLIENT_ID`,
> `LINKEDIN_CLIENT_ID`, `TELEGRAM_BOT_TOKEN`, …) — **plus a per-workspace override** for
> agencies and larger customers who bring their own app. Phase 4 builds the override as an
> encrypted `Workspace.platformCredentials`, resolved ahead of the env fallback.
>
> Why not per-tenant only: a shared app is precisely what lets a self-serve customer connect
> in a minute without running App Review themselves — requiring seven registered apps per
> customer ends self-serve signup. The cost is accepted explicitly: publishing gates are
> app-level, so TikTok `SELF_ONLY`, YouTube's private-until-verified uploads and Meta's App
> Review apply to *every* tenant on the shared app. §7 already requires the app to state that
> limit in its own words rather than fail silently.
>
> What is *already* per-account and enforced: `SocialAccount.userId` plus the ownership
> checks in `loadOwnedAccount()` / `findOwnedSocialAccount()`, and the OAuth callback's
> refusal to move an existing account to a second user.
>
> Item **7 is closed**: the per-tenant Telegram destination shipped in `73841ed` — the chat
> now travels with the account instead of coming from the environment.

1. **Workspace vs Brain as tenant** — recommendation in §3, with the three
   consequences.
2. **Role vocabulary** — four or five? **Must be answered before Phase 1.**
3. **Plans and limits** — what each plan sells and its caps. Phase 4 cannot be
   written without this.
4. **Payment provider — start by naming the selling entity.** Stripe does not
   offer business accounts in Egypt (verify at stripe.com/global). But the
   `User` default timezone is `Europe/Oslo` (`:50`) and the review notes a `.no`
   address in the repo: **if a Norwegian entity can be the seller, Stripe works
   and this problem disappears.** Otherwise the options are a US entity (Stripe
   Atlas) or a merchant-of-record.

   | | Webhooks | Tax | Seat proration |
   |---|---|---|---|
   | Stripe | `customer.subscription.*`, `invoice.*` | You are MoR; Stripe Tax calculates, does not file | built in |
   | Paddle | `subscription.*`, `transaction.completed` | MoR — collects and remits VAT | quantity + proration modes |
   | Lemon Squeezy | `subscription_*`, HMAC `X-Signature` | MoR | supported (**UNVERIFIED**) |
   | Paymob | one transaction callback, **no subscription lifecycle** | yours: Egyptian VAT + e-invoicing | **none** — you compute deltas |

   MoR costs roughly 5% + fixed vs ~3% for Stripe but removes tax remittance —
   likely right for a solo operator selling into the EU. **Payout support for
   Egypt-based sellers is UNVERIFIED for Paddle, Lemon Squeezy and Paymob.**
   Paymob also means writing your own renewal scheduler and dunning.
5. **Email provider** — Resend / Postmark / SES.
6. **Per-tenant platform credentials** — one SocialOrc-owned app serving all
   tenants is the normal SaaS shape, but each platform's review must approve the
   multi-tenant use. Telegram is the exception and is already broken.
7. **Telegram now** — recommended: it is a small, self-contained fix for a live
   cross-tenant bug and needs nothing from this plan.

## 9. Recommended cut for a first paying customer

Phases **0 → 2**, a minimal **4** (three fixed plans, hard limits) and a minimal
**5** (one plan, checkout, portal, webhook). Defer: super-admin, GDPR tooling,
advanced dunning, proration edge cases, and the OrcBrain/Network domains entirely.

## 10. Effort

Phase 0 alone is ~126 call sites (about a week, with nothing visible on screen).
Phases 1–6 add roughly: 1 week, 1 week, 3 days, 1 week, 1–2 weeks, 1 week.
Solo part-time **7–10 weeks**; focused full-time **about 5**.

## 11. Unknowns to verify before building

- Vercel function `maxDuration` for the cron versus the 10-minute lease window
  (still **UNVERIFIED** from the earlier security review).
- The production database provider and capacity, and **whether `DIRECT_URL` is
  set at all**.
- Whether preview deployments share production database env vars (§6.3).
- Platform ToS for multi-tenant publishing under a single app.
- What `/api/feed` is meant to be (§7).
