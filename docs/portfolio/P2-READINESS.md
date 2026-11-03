# P2 Readiness Checklist

P1 is implemented and verified (see the P1 report). This file lists exactly what P2 will need, so P2 can start
without re-deriving anything. **Nothing here is implemented yet.**

---

## 1. Prisma changes P2 requires

| Change | Detail |
|---|---|
| Enum | `PortfolioStatus { DRAFT PUBLISHED }` |
| Model | `Portfolio` — `userId @unique`, `handle @unique`, `status`, `draftDocument Json`, `documentVersion Int`, `schemaVersion Int`, `publishedRevisionId String? @unique`, `publishedAt`, `templateKey?`, `templateVersion?` |
| Model | `PortfolioRevision` — `document Json`, `hash`, `ogImageSha?`, `createdBy`, timestamps, `@@unique([id, portfolioId])`, `@@unique([portfolioId, hash])` |
| Model | `PortfolioPinnedMedia` — `sha256`, `pathname @unique`, `url`, `mimeType`, `width?`, `height?`, `bytes`, `sourceMediaAssetId?`, `role`, `@@unique([revisionId, sha256])` |
| Model | `PortfolioBlobTask` — outbox: `kind`, `pathname`, `state`, `attempts`, `lastError?`, `nextAttemptAt`, indexes on `(state, nextAttemptAt)` and `pathname` |
| Model | `PortfolioTemplate` — `key @unique`, `document Json`, `schemaVersion`, `documentHash`, `isActive` |
| Column | `MediaAsset.visibility String @default("PUBLIC")` |
| Relations | `Portfolio.publishedRevision` composite FK `(publishedRevisionId, id) → PortfolioRevision(id, portfolioId)` `onDelete: SetNull`; `PortfolioPinnedMedia.revision` composite FK `(revisionId, portfolioId) → PortfolioRevision(id, portfolioId)` `onDelete: Cascade`; `sourceMediaAsset` `onDelete: SetNull` |
| Pipeline | Edit `prisma/schema.prisma`, then `npm run db:pg:schema` to regenerate `schema.postgres.prisma`; migration goes in `prisma/migrations-postgres/<timestamp>_portfolio/migration.sql` |

**Order-of-creation risk to check:** the two circular foreign keys (`Portfolio ↔ PortfolioRevision`) must be
emitted as separate `ALTER TABLE` statements after both tables exist. Verify by applying the migration to a
throwaway Postgres and, if Prisma's generated order is wrong, split the migration into create-tables then
add-constraints.

## 2. Authorization helpers to add / reuse

| Item | Where | Note |
|---|---|---|
| `requirePermission(permission)` | `src/lib/tenancy/guard.ts` (new, sibling of `requireWorkspace`) | Session → user row → `effectiveRole()` → matrix. **No workspace requirement** (verified: `requireWorkspace` returns 403 `NO_WORKSPACE_MESSAGE` without membership). |
| `portfolio:edit`, `portfolio:publish` | `src/lib/roles.ts` — `PERMISSIONS` + `MATRIX` | edit = ADMIN/MANAGER/EDITOR; publish = ADMIN/MANAGER |
| `ownedPortfolio(userId)` helper | `src/lib/portfolio/owner.ts` | Single place that answers "the caller's portfolio", always `where: { userId }` |
| `getAuthSession()` | `src/lib/auth.ts` | Reuse; do not add a second session path |

`effectiveRole()` is verified: a sole workspace member is authorised as ADMIN; `FALLBACK_ROLE` is CLIENT.

## 3. Route conventions to follow

- `export const dynamic = "force-dynamic"` on every portfolio API route (the repo's existing pattern).
- Body parsing with `zod`; `NextResponse.json({...}, { status })`; errors as `{ error, code }`.
- Guard first, ownership predicate second, then the write.
- Mutating routes must contain the literal `requirePermission(` (the scanner accepts it alongside
  `requireWorkspace(`).

## 4. Scanner and test changes

| Test | Change |
|---|---|
| `tests/unit/route-permissions.test.ts` | One `EXCEPTIONS` entry: `portfolio/**` exempt from the `TENANT_DATA` rule, with a written justification |
| `tests/unit/portfolio-ownership.test.ts` (new) | Walks every `src/app/api/portfolio/**/route.ts` and fails when the source lacks an ownership predicate (`userId: session.user.id` or `ownedPortfolio(`) |
| `tests/e2e/portfolio-security.e2e.mjs` (new) | Two-user matrix: create/read/save/publish/unpublish/revisions/restore/assets → 404 or 422, never 200 |

## 5. Database-backed tests required

1. Migration applies cleanly (`prisma migrate deploy`) on a throwaway database.
2. Composite FK rejects a cross-portfolio pointer (raw SQL `UPDATE "Portfolio" SET "publishedRevisionId" = <other
   portfolio's revision>` must raise a foreign-key error).
3. Composite FK rejects a pin row mixing portfolio and revision.
4. Deleting a `MediaAsset` sets `PortfolioPinnedMedia.sourceMediaAssetId` to NULL and leaves the pin intact.
5. Deleting a revision cascades its pins and enqueues blob deletion.
6. `@@unique([portfolioId, hash])` makes a duplicate publish idempotent.

**Constraint:** this machine has no local Postgres and no Docker — items 1–6 need CI or a throwaway hosted
database URL (open issue O-05).

## 6. Decisions already closed (do not reopen)

- Ownership is per user (`Portfolio.userId @unique`), never per workspace.
- `GET /api/portfolio` is read-only; creation is an explicit `POST`.
- Media truth = `PortfolioPinnedMedia` only; the revision document references `mediaSha`.
- Blob deletion is an outbox job, never inline.
- Retention = latest 20 ∪ active.
- Cross-portfolio pointers are prevented by the database, not by application checks alone.

## 7. What P2 must not touch

Social publishing, scheduling, the cron publisher, social connectors, authentication flows, existing media
routes, `next.config.ts`, and any table outside the five listed above + `MediaAsset.visibility`.

## 8. Definition of done for P2 (unchanged from the plan)

A portfolio can be created, read and saved by its owner and by nobody else; the scanner suite is green with a
single narrow exception; the ownership test fails if any portfolio route loses its predicate; the migration is
proven on a throwaway database.
