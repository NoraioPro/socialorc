# SocialOrk Professional Portfolio — FINAL ARCHITECTURE

Status: **closed specification** (no implementation). Baseline: `main @ 435fd073d8da7ec10c5fc77b6196e47128485d81`.
Evidence labels: **[V]** verified in the repository this session · **[D]** technical decision made here ·
**[X]** requires external verification (service behaviour we cannot prove from the repo).

---

## 0. Product contract

A **full visual builder**: every user builds a portfolio that is visually and structurally unique — blank
canvas, editable starter templates, nested layouts, element-level styling, independent desktop/tablet/mobile
presentation, immutable published snapshots, public URL `/p/<handle>`. One portfolio per user; no shared
designs, no fixed section list. **[D]** (product decision, restated for the record)

---

## 1. Runtime baseline [V]

| Item | Value |
|---|---|
| Framework | Next.js 16.4.3 (App Router, Turbopack) |
| UI runtime | React 19.2.8 · @base-ui/react ^1.8.0 · tailwindcss ^4 · lucide-react ^1.44.0 |
| Validation | zod ^4.6.1 |
| ORM | Prisma ^7.10.0, two-schema pipeline (`schema.prisma` → `schema.postgres.prisma` via `npm run db:pg:schema`) |
| Storage | @vercel/blob ^2.8.0 — exports `put`, `putFromUrl`, `copy`, `del`, `head`, `list`, `rename`, `get` |
| Auth | NextAuth v4 (`getAuthSession`), roles ADMIN/MANAGER/EDITOR/CLIENT, 18 permissions in `src/lib/roles.ts` |
| Guard | `requireWorkspace(permission)` in `src/lib/tenancy/guard.ts`; returns 403 `NO_WORKSPACE_MESSAGE` when the user has no membership |
| Route scanners | `tests/unit/route-permissions.test.ts`: mutating routes need `requirePermission`/`requireWorkspace(`; routes touching `prisma.mediaAsset.` and friends need `requireWorkspace(` |
| Public access | no `middleware.ts`; gating is per layout; `/review/[token]` is the unauthenticated precedent |
| Fonts | `Geist`+`Geist_Mono` (root), `Hanken_Grotesk`+`IBM_Plex_Mono` (socialork/signin/review layouts) — four build-time imports |
| Media today | both upload paths write `access: "public"`; `DELETE /api/media` removes the row only and never calls `del()` |
| Caching | no `revalidateTag`/`revalidatePath`/`unstable_cache` anywhere; API routes use `dynamic = "force-dynamic"` |

---

## 2. Document model

### 2.1 Envelope

```ts
PortfolioDocument = {
  schemaVersion: 1;
  tokens: TokenTable;
  pages: Page[];                 // 1..24
  meta: { locale: "en"; createdAt: string; templateKey?: string; templateVersion?: number };
}

Page = {
  id: string; slug: string; title: string; isHome: boolean;
  seo: { title?: string; description?: string; ogImageSha?: string };
  settings: { maxWidthPx?: number; background?: BackgroundValue; paddingY?: number };
  root: PageRootNode;            // type: "PAGE"
}

PageRootNode = { id, type: "PAGE", style: StyleSet, responsive?: Breakpoints, children: Node[] /* SECTION[] */ }

Node = {
  id: string;                    // unique across the whole document
  type: ComponentType;           // must exist in the registry
  props: Record<string, unknown>;// validated by that type's zod schema (.strict())
  style: StyleSet;
  responsive?: { tablet?: Partial<StyleSet>; mobile?: Partial<StyleSet> };
  mediaSha?: string;             // IMAGE nodes only, in a PUBLISHED revision
  children?: Node[];             // only where the registry allows
}
```

### 2.2 Style values **[D]**

```ts
type StyleValue<T> = { ref: TokenPath } | { value: T };   // never a CSS string
StyleSet = {
  display?: StyleValue<"block" | "flex" | "grid" | "none">;
  gapPx?: StyleValue<number>; paddingPx?: StyleValue<number>; marginPx?: StyleValue<number>;
  widthPx?: StyleValue<number>; maxWidthPx?: StyleValue<number>;
  heightPx?: StyleValue<number>; minHeightPx?: StyleValue<number>;
  background?: BackgroundValue; color?: StyleValue<string>;
  fontFamily?: StyleValue<string>;  // must be an allowlisted family id
  fontSizePx?: StyleValue<number>; fontWeight?: StyleValue<number>;
  lineHeight?: StyleValue<number>; letterSpacingEm?: StyleValue<number>;
  textAlign?: StyleValue<"left" | "center" | "right">;
  borderWidthPx?: StyleValue<number>; borderColor?: StyleValue<string>;
  borderRadiusPx?: StyleValue<number>; shadow?: StyleValue<string>; opacity?: StyleValue<number>;
  objectFit?: StyleValue<"cover" | "contain" | "none">; focalX?: StyleValue<number>; focalY?: StyleValue<number>;
}
```

**Resolution order per property:** `literal > mobile > tablet > desktop > token/parent default`. A breakpoint
object holds only deltas; a property absent from all levels falls back to the component default. **[D]**

**Bounds (validator-enforced):** fontSize 10–160 · gap/padding/margin 0–240 · radius 0–999 · opacity 0–1 ·
letterSpacing −0.05–0.3 · minHeight 0–2000 · width/maxWidth 0–1600 · columns 1–12 · span 1–12 ·
shadow from the token list or a literal matching `0 0 0 rgba()` shape · fontFamily ∈ allowlist. **[D]**

**Token interaction:** editing a token restyles only nodes that `{ ref }` it; literals never change; deleting a
referenced token is a validation error naming the path (no silent fallback). **[D]**

### 2.3 Limits **[D]**

≤4,000 nodes/document · ≤2,000 nodes/page · ≤24 pages · depth ≤12 · unique ids document-wide · no unknown
types/props/style keys/token refs · `position` allowed only as `{ mode: "FLOW" }` (absolute positioning is not
exposed in v1).

---

## 3. Component registry

`PAGE` is a system root (created with the page, never inserted, deleted or duplicated by the user). Sixteen
user-insertable types. `TAG` is not a component. The Animate inspector tab is not part of the MVP.

### 3.1 Parent → allowed children (authoritative matrix) **[D]**

| Parent | Allowed children |
|---|---|
| PAGE | SECTION |
| SECTION | CONTAINER, STACK |
| CONTAINER | CONTAINER, STACK, GRID, HEADING, TEXT, BUTTON, IMAGE, PROJECT_CARD, EXPERIENCE_ITEM, SKILL_GROUP, SOCIAL_LINKS, CONTACT_BLOCK, DIVIDER, SPACER |
| STACK | CONTAINER, STACK, GRID, HEADING, TEXT, BUTTON, IMAGE, PROJECT_CARD, EXPERIENCE_ITEM, SKILL_GROUP, SOCIAL_LINKS, CONTACT_BLOCK, DIVIDER, SPACER |
| GRID | COLUMN |
| COLUMN | CONTAINER, STACK, HEADING, TEXT, BUTTON, IMAGE, PROJECT_CARD, EXPERIENCE_ITEM, SKILL_GROUP, SOCIAL_LINKS, CONTACT_BLOCK, DIVIDER, SPACER |
| DIVIDER, SPACER, HEADING, TEXT, BUTTON, IMAGE, PROJECT_CARD, EXPERIENCE_ITEM, SKILL_GROUP, SOCIAL_LINKS, CONTACT_BLOCK | — none (leaf) |

Cycles are impossible: the document is a tree, ids are unique, depth is capped. A repeated id is a validation
error, which is what makes a cycle unrepresentable.

### 3.2 Contracts (props · defaults · inspector · responsive)

| Type | Props (zod `.strict()`) and defaults | Inspector (Content · Layout · Style · Responsive) |
|---|---|---|
| SECTION | `fullBleed=true`, `minHeightPx?`, `anchor?=/^[a-z0-9-]{1,40}$/`, background stack | Style: background (colour/gradient/image+overlay), paddingY · Layout: min-height · Responsive: padding/min-height |
| CONTAINER | `maxWidthPx=1080` (320–1600), `align="center"` | Layout: max width, paddingX, align |
| STACK | `direction="column"`, `wrap=false`, `gapPx=16`, `align="stretch"`, `justify="start"` | Layout: direction, wrap, gap, align, justify |
| GRID | `columns=12` (1–12), `minColumnPx=240` (120–600), `rowGapPx=24`, `columnGapPx=24` | Layout: columns, min column width, gaps |
| COLUMN | `span=12` (1–12), `order=0`, `alignV="stretch"` | Layout: span, order, vertical align |
| SPACER | `heightPx=32` (0–240), `hideOn=[]` | Layout: height, hide-on-breakpoint |
| DIVIDER | `thicknessPx=1` (1–8), `colorToken="border.subtle"`, `widthPct=100`, `variant="solid"` | Style: thickness, colour, width, variant |
| HEADING | `text=""` (≤200), `level=2` (1–4) | Content: text, level · Style: type scale, weight, colour, align |
| TEXT | `text=""` (≤4000) with marks bold/italic/link only | Content: text + marks, max width |
| BUTTON | `label=""` (≤60), `href=""` (https|mailto), `variant="primary"`, `target="self"` | Content: label, href, variant, target |
| IMAGE | `assetId=""`, `alt?` (≤200), `caption?` (≤200), `aspect="auto"` | Content: asset picker, alt, caption · Style: fit, focal point, radius |
| PROJECT_CARD | `title ≤120`, `summary ≤400`, `year ≤16`, `tags ≤6`, `coverAssetId?`, `href?`, `featured=false` | Content: fields + featured · Style: card bg, radius, shadow |
| EXPERIENCE_ITEM | `title ≤120`, `org ≤120`, `start "YYYY-MM"`, `end? "YYYY-MM"`, `current=false`, `bullets ≤8` | Content: fields · Style: variant, divider |
| SKILL_GROUP | `title ≤80`, `items ≤24`, `variant="chips"` | Content: title, items, variant |
| SOCIAL_LINKS | `links ≤8` of `{platform, url}` | Content: rows · Style: icon size, gap |
| CONTACT_BLOCK | `email`, `ctaLabel="Get in touch"` (≤40), `note?` (≤240) | Content: email, CTA, note · Style: bg, padding, align |

Validation is total: unknown type, unknown prop, unknown style key, unresolved token, illegal child, out-of-bounds
value, duplicate id, depth/count overrun are all rejected with an exact path (e.g.
`pages[0].root.children[2].children[0].style.gapPx`). The **same** `parseDocument()` gate runs in the API, the
publish step, the template seeder and the editor; the canvas, the preview and the public page all render the
parsed tree through one renderer. **[D]**

### 3.3 Typography **[V]**

Allowlist (build-time `next/font` imports only): `Hanken Grotesk`, `IBM Plex Mono`, `Geist`, `Geist Mono`.
Default display/text family: Hanken Grotesk; default accent `#48ed85`. Both are **defaults**, overridable per
portfolio. Adding a family later = one `next/font` import + a token id; arbitrary remote font URLs are refused.

---

## 4. Persistence

### 4.1 Final Prisma models **[D]** (to be added in P2; nothing changed yet)

```prisma
enum PortfolioStatus { DRAFT PUBLISHED }

model Portfolio {
  id                  String   @id @default(cuid())
  userId              String   @unique                 // ownership: one portfolio per user
  handle              String   @unique
  status              PortfolioStatus @default(DRAFT)
  draftDocument       Json
  documentVersion     Int      @default(1)             // compare-and-set for autosave
  schemaVersion       Int      @default(1)
  publishedRevisionId String?  @unique                 // 1:1 pointer to the active snapshot
  publishedAt         DateTime?
  templateKey         String?                          // provenance only, never re-applied
  templateVersion     Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  user              User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  publishedRevision PortfolioRevision?  @relation("PortfolioPublished", fields: [publishedRevisionId, id], references: [id, portfolioId], onDelete: SetNull)
  revisions         PortfolioRevision[] @relation("PortfolioRevisions")
  pinnedMedia       PortfolioPinnedMedia[]

  @@index([status])
}

model PortfolioRevision {
  id            String   @id @default(cuid())
  portfolioId   String
  document      Json                                   // frozen, fully resolved, PUBLISHED references only
  schemaVersion Int
  hash          String                                 // sha256 of canonical JSON
  label         String?
  ogImageSha    String?                                // FK-ish reference into pinnedMedia.sha256
  createdBy     String
  createdAt     DateTime @default(now())
  publishedAt   DateTime?

  portfolio   Portfolio              @relation("PortfolioRevisions", fields: [portfolioId], references: [id], onDelete: Cascade)
  publishedBy Portfolio?             @relation("PortfolioPublished")
  media       PortfolioPinnedMedia[]

  @@unique([id, portfolioId])                          // makes the composite FK in Portfolio possible
  @@unique([portfolioId, hash])                        // idempotent publish: same content = same revision
  @@index([portfolioId, createdAt])
}

model PortfolioPinnedMedia {                            // THE single source of truth for published media
  id                 String   @id @default(cuid())
  revisionId         String
  portfolioId        String
  sha256             String                            // full 64-hex digest of the bytes
  pathname           String   @unique
  url                String
  mimeType           String
  width              Int?
  height             Int?
  bytes              Int
  sourceMediaAssetId String?
  role               String   @default("INLINE")       // INLINE | SECTION_BG | OG
  createdAt          DateTime @default(now())

  revision   PortfolioRevision @relation(fields: [revisionId, portfolioId], references: [id, portfolioId], onDelete: Cascade)
  portfolio  Portfolio         @relation(fields: [portfolioId], references: [id], onDelete: Cascade)
  source     MediaAsset?       @relation(fields: [sourceMediaAssetId], references: [id], onDelete: SetNull)

  @@unique([revisionId, sha256])                       // dedupe: one pin per asset per revision
  @@index([portfolioId])
}

model PortfolioBlobTask {                               // outbox for retryable Blob work (never in a request path)
  id            String   @id @default(cuid())
  kind          String                                 // DELETE_REVISION_MEDIA | DELETE_ORPHAN_UPLOAD | DELETE_PORTFOLIO_MEDIA
  pathname      String
  state         String   @default("PENDING")           // PENDING | DONE | FAILED
  attempts      Int      @default(0)
  lastError     String?
  nextAttemptAt DateTime @default(now())
  createdAt     DateTime @default(now())

  @@index([state, nextAttemptAt])
  @@index([pathname])
}

model PortfolioTemplate {
  id            String   @id @default(cuid())
  key           String   @unique                       // editorial | terminal | gallery
  name          String
  description   String?
  category      String
  document      Json
  schemaVersion Int
  documentHash  String
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

`MediaAsset` gains one nullable column: `visibility String @default("PUBLIC") // PUBLIC | PRIVATE`.

### 4.2 What the database enforces vs what the application enforces **[D]**

| Rule | Enforced by |
|---|---|
| One portfolio per user | DB: `Portfolio.userId @unique` |
| Unique public handle | DB: `Portfolio.handle @unique` |
| A portfolio can only point at **its own** revision | DB: composite FK `(publishedRevisionId, id) → (id, portfolioId)` + `PortfolioRevision @@unique([id, portfolioId])` |
| A pin row cannot mix portfolios | DB: composite FK `(revisionId, portfolioId) → (id, portfolioId)` |
| Deleting a library asset must not break a revision | DB: `onDelete: SetNull` on `sourceMediaAssetId`; the pin keeps url/pathname/meta |
| Idempotent publish | DB: `@@unique([portfolioId, hash])` |
| One pin per asset per revision | DB: `@@unique([revisionId, sha256])` |
| No blob path reuse | DB: `PortfolioPinnedMedia.pathname @unique` |
| Role/permission gates | App: `requirePermission('portfolio:edit'|'portfolio:publish')` |
| Ownership of the row behind the id | App: every query carries `userId: session.user.id` |
| Document validity, caps, child rules, bounds | App: `parseDocument()` |
| Retention (20 ∪ active) | App: GC worker |
| Media eligibility (PUBLIC only) | App: check at save and again at publish |

**Circular FK note:** `Portfolio ↔ PortfolioRevision` are mutually referential. Postgres supports this, but the
migration must create the tables first and add one FK in a follow-up statement; Prisma emits the FKs as separate
`ALTER TABLE` statements, which is acceptable. **[X]** must be confirmed by applying the migration to a throwaway
database (P2 acceptance).

---

## 5. Published media — one authoritative source

**Decision [D]:** `PortfolioPinnedMedia` is the only record of what a revision uses. The revision **document**
stores `mediaSha` on IMAGE nodes; the revision row stores `ogImageSha`. There is **no** `revision.media` JSON
column, **no** `PortfolioAsset` usage table, and **no** persisted `nodeId`. Usage ("which nodes use this image")
is derived by walking the immutable document, which is deterministic and cannot drift.

Why this model: one writer, one reader; dedupe is a unique index rather than app logic; deleting a revision is a
cascade; the same image used by five nodes produces exactly one blob and one row.

**Draft vs published:** in a draft, `IMAGE.props.assetId` points at `MediaAsset`. At publish each distinct asset
is pinned once and the node is rewritten to `{ mediaSha }`. The public renderer never sees `assetId` and never
queries `MediaAsset`.

---

## 6. Publishing lifecycle and Blob failure recovery

All Blob work is either **synchronous and bounded** (pinning, ≤60 images × ≤8MB) or **retryable background**
(deletion via outbox). Blob operations and DB transactions are explicitly **not** assumed atomic.

### 6.1 Publish (synchronous, bounded)

1. `parseDocument(draft)` → reject on any issue (no partial work).
2. Collect distinct image sources: node `assetId`s + `seo.ogImageSha`'s source asset. Verify each with
   `prisma.mediaAsset.findMany({ where: { id: { in: ids }, userId }, select: … })`; a missing/foreign id → 422.
   Verify `visibility === "PUBLIC"`.
3. Fetch bytes (bounded), compute **full sha256**, and derive
   `pathname = portfolio/{portfolioId}/{revisionId}/{sha256}.{ext}` — collision-free by construction (revisionId
   is a fresh cuid, sha256 is the full digest; no 8-character fragment).
4. **Write intent first:** one `PortfolioBlobTask` row per pathname with `kind=DELETE_ORPHAN_UPLOAD, state=PENDING`.
5. Upload with `put(…, { addRandomSuffix: false, allowOverwrite: false })`. If the object already exists (retry of
   the same publish), `BlobPreconditionFailedError` is treated as success **only when the existing object's
   `head()` sha/etag matches**; otherwise the publish fails.
6. Single transaction: insert `PortfolioRevision`, insert `PortfolioPinnedMedia` rows, set
   `publishedRevisionId/publishedAt/status`, write `AuditEvent`.
7. Mark the intent rows `DONE` after commit. If the process dies between 6 and 7, the sweeper deletes blobs that
   are **not referenced** by any pin row — it checks the pin table before deleting, so a committed revision is
   never damaged.

### 6.2 Failure matrix

| Failure | Result | Recovery |
|---|---|---|
| Upload fails mid-way | Transaction never runs; intents stay `PENDING` | Sweeper deletes those pathnames (they are unreferenced), marks `DONE` |
| DB transaction fails after uploads | Same as above | Same sweep; user sees a 500 and the pointer never moved |
| Blob delete fails after DB delete | `PortfolioBlobTask.state=FAILED`, `attempts++`, `nextAttemptAt = now + 2^n minutes` | Sweeper retries; after 10 attempts it stays FAILED and is surfaced in the admin log |
| DB delete fails after blob queued | Nothing deleted yet (order is: DB first, then enqueue) | Retry the request; outbox is idempotent |
| Duplicate publish (double click) | Second call hits `@@unique([portfolioId, hash])` | Returns the existing revision; no new pins |
| Path collision | Impossible: revisionId + full sha256 + `pathname @unique` | — |
| Unpublish | Pointer null, revision + pins retained | Public 404 after revalidation |
| Portfolio deletion | DB cascade removes revisions/pins; one `DELETE_PORTFOLIO_MEDIA` task per distinct pathname | Sweeper deletes blobs |
| Sweeper crash | Rows remain `PENDING` | Next tick reprocesses (idempotent: `del()` on a missing path is treated as success) |

### 6.3 Background worker

New route `GET /api/cron/portfolio` guarded by the existing `CRON_SECRET` pattern (`src/lib/cron-auth.ts`) and
scheduled every minute in `vercel.json` (a config change made in P8, with approval). It processes ≤50 tasks per
tick: claims rows with `nextAttemptAt <= now`, deletes, marks `DONE/FAILED`. **[X]** the current repo has no
portfolio cron; the schedule granularity must be confirmed on the plan in use (`vercel.json` is already per-minute
for publishing per the repo's history — verify before relying on it).

---

## 7. Revision retention — exact semantics

Let `L20` = the 20 most recent revisions by `(createdAt DESC, id DESC)`.

- **Retained set = L20 ∪ {publishedRevisionId}.** The count **includes** the active revision.
- If the active revision is older than L20, it is kept as the 21st and is **never** auto-deleted.
- **Manual delete:** allowed for any retained revision except the active one → `409 ACTIVE_REVISION_REQUIRES_UNPUBLISH`.
- **Restore:** allowed to any retained revision; the pointer moves, nothing is copied. Restoring a GC'd revision →
  `409 REVISION_EXPIRED`.
- **Media of a deleted revision:** its pins cascade away and their blobs are enqueued for deletion (never deleted
  inline).
- **GC trigger:** the same cron worker, one run per tick, never inside a user request.
- **Storage ceiling:** 20 revisions × ≤60 pins × ≤8MB ⇒ bounded; the published set is additionally bounded by the
  document caps.

---

## 8. Security model

### 8.1 Two new permissions **[D]**

| Permission | Matrix | Meaning |
|---|---|---|
| `portfolio:edit` | ADMIN, MANAGER, EDITOR | Create/read/save **own** draft, manage own revisions, pin own media |
| `portfolio:publish` | ADMIN, MANAGER | Publish/unpublish/restore **own** portfolio |

`effectiveRole()` **is verified [V]**: a sole workspace member is authorised as ADMIN; `FALLBACK_ROLE` is CLIENT.
Permissions gate the action; **ownership is a separate predicate** on the row, always `userId: session.user.id`.

### 8.2 Route matrix **[D]**

| Route | Method | Guard | Ownership predicate | Failure modes |
|---|---|---|---|---|
| `/api/portfolio` | GET (**read-only**) | `requirePermission('portfolio:edit')` | `where: { userId }` | 200 `{portfolio: null}` when none |
| `/api/portfolio` | POST (explicit create) | `requirePermission('portfolio:edit')` | creates with `userId` | 409 if one exists |
| `/api/portfolio` | PATCH (handle/SEO) | `requirePermission('portfolio:edit')` | `where: { userId }` | 409 handle taken |
| `/api/portfolio/draft` | PATCH | `requirePermission('portfolio:edit')` | ownership + `documentVersion` CAS | 409 stale, 422 invalid |
| `/api/portfolio/publish` | POST | `requirePermission('portfolio:publish')` | ownership; every asset re-checked | 422 foreign/private asset |
| `/api/portfolio/unpublish` | POST | `requirePermission('portfolio:publish')` | ownership | 409 not published |
| `/api/portfolio/revisions` | GET | `requirePermission('portfolio:edit')` | joined through the owned portfolio | 404 foreign id |
| `/api/portfolio/revisions/[id]` | DELETE | `requirePermission('portfolio:edit')` | ownership + not active | 409 active |
| `/api/portfolio/revisions/[id]/restore` | POST | `requirePermission('portfolio:publish')` | ownership | 409 expired |
| `/api/portfolio/assets` | POST (validate/pin preview) | `requirePermission('portfolio:edit')` | `id IN ids AND userId` | 422 foreign; no data echoed |
| `/p/[handle]` | GET | none | published revision only | 404 unknown / 404 unpublished |

Changes from v5 **[D]**: GET no longer creates (a GET that mutates is wrong for caching, prefetch and CSRF
semantics); creation is an explicit POST.

### 8.3 Isolation rules

- Cross-user reads/writes return **404**, never 403 (no existence disclosure).
- A guessed asset id yields 422 with no echoed data.
- Public payload is built from `publishedRevision.document` + `PortfolioPinnedMedia`; the DTO has no draft field,
  and the page's OG metadata uses the frozen `ogImageSha`.
- The scanner exception is one entry (`portfolio/**` exempt from the `TENANT_DATA` rule) and is paid for by
  `tests/unit/portfolio-ownership.test.ts`, which fails any portfolio route lacking an ownership predicate.
- **A static scanner is a lint, not proof.** The proof is a two-user API matrix (read, save, publish, unpublish,
  revisions, restore, assets) plus a public-access matrix (published 200, draft 404, foreign handle 404).

---

## 9. Templates **[D]**

Three seeds: `editorial` (wide, serif-leaning rhythm), `terminal` (mono, dense, list-heavy), `gallery`
(image-led, 2-column grid). Each is a `PortfolioTemplate` row.

- **Validation:** seeded documents pass the same `parseDocument()` used for user documents, asserted in a unit
  test; a template that fails validation cannot be activated (`isActive=false` set by the seeder).
- **Versioning:** `key` + `schemaVersion` + `documentHash`. Migrations run through the same `migrateDocument()`.
- **Updating a template never touches existing portfolios:** creation copies the document *and* records
  `templateKey/templateVersion` for provenance only; nothing re-reads the template afterwards.
- **Blank canvas:** `POST /api/portfolio { blank: true }` creates a document with `PAGE` + one empty `SECTION`.
- **Editability:** after creation the document is the user's; no field is locked, no layout is inherited.
- No marketplace, no shared designs, no fork-graph.

---

## 10. Renderer

One function, three consumers:

```
parseDocument(input) → PortfolioDocument
      ├── editor canvas   (renders DocumentRenderer with draft, edit affordances layered on top)
      ├── preview         (renders DocumentRenderer with draft, no affordances)
      └── public page     (renders DocumentRenderer with the published revision)
```

`DocumentRenderer` maps `node.type` → component renderer from the registry. No `dangerouslySetInnerHTML`, no
inline handlers, no `<script>`, no raw style strings: every value is resolved from `StyleSet` into React
`style` props through the token resolver, and URLs are validated against the scheme allowlist. Images render as
`<img>` with explicit `width`/`height` from the pinned metadata (**not** `next/image`, because `next.config.ts`
has no `images.remotePatterns` — adding one would be an unrelated config change). **[V]** for the config state,
**[D]** for the choice.
