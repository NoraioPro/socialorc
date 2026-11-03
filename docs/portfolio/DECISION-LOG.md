# SocialOrk Professional Portfolio — DECISION LOG

Final record of the architecture decisions. Each entry: decision, reason, and whether it changes v5.
Labels: **[V]** verified in repo · **[D]** decision · **[X]** external verification still required.

---

## A. Changes from v5 (and why)

### D-01 — `GET /api/portfolio` no longer creates a portfolio **[D] (v5 changed)**
**v5 said:** GET creates on first read.
**Now:** GET is read-only (`{portfolio: null}` when absent); creation is `POST /api/portfolio` (409 if one exists).
**Why:** a mutating GET breaks prefetching, caching and CSRF expectations, and it makes "did the user create a
portfolio?" unanswerable from logs. A separate POST is also where the blank-canvas flag belongs.

### D-02 — One media table instead of three overlapping structures **[D] (v5 changed)**
**v5 said:** `PortfolioRevision.media` JSON **and** `PortfolioAsset` rows with `nodeId`/`role`/`sha256`.
**Now:** `PortfolioPinnedMedia` alone, unique on `(revisionId, sha256)`; the revision document references
`mediaSha`; the revision row carries `ogImageSha`.
**Why:** three structures meant three truths. Usage per node is derivable by walking the immutable document, so
persisting `nodeId` duplicated information that could drift. Dedupe is now an index instead of application logic.

### D-03 — Deletion of published media is an outbox job, never inline **[D] (v5 changed)**
**v5 said:** delete revision → `del(pathnames)`.
**Now:** database first, then a `PortfolioBlobTask` row processed by `/api/cron/portfolio` with backoff.
**Why:** Blob storage and Postgres cannot be committed together; an inline delete that fails leaves either a
dangling row or an orphan blob with no record. An outbox is the smallest durable mechanism that survives a crash.

### D-04 — Pin paths use the full sha256 and a fresh revision id **[D] (v5 changed)**
**v5 said:** `…/rev/<revId>/<sha8>.<ext>`.
**Now:** `…/rev/<cuid>/<sha256-64hex>.<ext>` with `pathname @unique` and `allowOverwrite:false`.
**Why:** an 8-character fragment is a collision risk at scale, and collisions here mean two revisions sharing a
blob that one of them will later delete.

### D-05 — Cross-portfolio pointers are prevented in the database **[D] (v5 hardened)**
**v5 said:** application-level validation only.
**Now:** composite foreign keys — `Portfolio(publishedRevisionId, id) → PortfolioRevision(id, portfolioId)` and
`PortfolioPinnedMedia(revisionId, portfolioId) → PortfolioRevision(id, portfolioId)`.
**Why:** "a portfolio may only publish its own revision" is a data invariant; expressing it as a constraint means no
future code path can violate it, including a migration script or a console session.

### D-06 — Stitch gates split between public and builder **[D] (v5 changed)**
**v5 said:** the builder screens gated P3 and P4 together.
**Now:** P3 (public renderer) is gated only by public-page states; P4+ by builder screens.
**Why:** the public renderer never touches the editor. Blocking it on builder designs delayed a phase for no reason.

### D-07 — Retention is "latest 20 ∪ active" **[D] (v5 clarified)**
**v5 said:** 20 revisions, active protected.
**Now:** the count includes the active revision; if the active revision falls outside the latest 20 it is retained
as the 21st; manual delete of the active revision is refused (409); restore is allowed only inside the retained set.
**Why:** "20 and active protected" was ambiguous the moment the active revision was older than the window.

### D-08 — Templates are copied at creation, never linked **[D] (v5 clarified)**
**Now:** `Portfolio.templateKey/templateVersion` is provenance; updating a template row never touches an existing
portfolio; blank canvas is an explicit POST flag.
**Why:** a live template link would let an editorial change silently rewrite a user's page.

---

## B. Decisions carried forward from v5 (unchanged)

| ID | Decision | Reason |
|---|---|---|
| D-10 | Page root is an explicit `PAGE` node holding ordered sibling `SECTION`s | A single-section root cannot express a multi-section page |
| D-11 | Document tree in Postgres `jsonb`; ownership/status/revisions relational | Arbitrary nesting + typed styles; ownership must be enforceable by the DB |
| D-12 | `StyleValue = { ref } \| { value }`, never a CSS string | Structural validation and no HTML/CSS injection surface |
| D-13 | Structured layout only (SECTION/CONTAINER/STACK/GRID/COLUMN/SPACER/DIVIDER); absolute positioning not exposed | Builders break on phones because of coordinates, not because of missing freedom; a 12-column grid covers the compositions |
| D-14 | 16 user-insertable components + system `PAGE`; `TAG` removed; Animate tab out of MVP | One authoritative list; no component that no screen shows |
| D-15 | Fonts: Hanken Grotesk, IBM Plex Mono, Geist, Geist Mono (build-time imports) **[V]** | Already in the bundle; no runtime font fetch |
| D-16 | Defaults: Hanken Grotesk + `#48ed85`, overridable per portfolio | Product default, never a restriction |
| D-17 | Public URL `/p/<handle>` | Avoids collisions with future root routes |
| D-18 | `requirePermission('portfolio:edit'|'portfolio:publish')` as a sibling of `requireWorkspace`; no workspace dependency for portfolio routes | `requireWorkspace` returns 403 for a user with no membership **[V]** |
| D-19 | One scanner exception (`portfolio/**` from the `TENANT_DATA` rule), paid for by `portfolio-ownership.test.ts` | The scanners are lint, not proof; the new test keeps the exception from widening |
| D-20 | Ownership predicate on every route: `userId: session.user.id`; cross-user returns 404 | No existence disclosure |
| D-21 | Images render with `<img>` + explicit dimensions, not `next/image` | `next.config.ts` has no `images.remotePatterns` **[V]**; adding it is an unrelated config change |
| D-22 | Media `visibility` is a product flag, not access control | All uploads write `access:"public"` today **[V]**; real privacy needs private blobs + signed URLs |
| D-23 | Data-bound components (`PROJECT_CARD`, `EXPERIENCE_ITEM`) are inline-only in the MVP | No Project/Experience models exist in the 37-model schema **[V]** |
| D-24 | Autosave uses `documentVersion` compare-and-set; 409 on stale write | Two tabs must not silently overwrite each other |
| D-25 | Undo/redo is a patch stack (100 steps, 20MB budget), not document snapshots | No immer/zustand in the repo **[V]**; snapshots would blow memory on a 4k-node document |
| D-26 | Drag and drop via `@dnd-kit/core@6.3.1` + `sortable@10.0.0` + `modifiers@9.0.0` + `utilities@3.2.2` | Only option giving pointer + touch + keyboard + a11y from one implementation; peer `react >=16.8` satisfied by 19.2.8 **[V]** |
| D-27 | Mobile editor edits for real (canvas + bottom sheet), with a defined exclusion list | View-only on a phone is not a visual builder |
| D-28 | Work in an isolated worktree on a named branch; no push without approval | The shared checkout is edited by other agents concurrently |

---

## C. External verification items (do **not** treat as confirmed)

| ID | Item | Why it is not verified | Where it is settled |
|---|---|---|---|
| X-01 | `@vercel/blob` `copy()` produces a stable URL unaffected by deleting the source object, and the store's retention policy never removes referenced objects | No retention documentation was read; the repo only proves the exports exist | P8 acceptance experiment (publish → delete source → fetch pinned URL) |
| X-02 | `revalidateTag` / `revalidatePath` behave as documented on this Next 16.4.3 deployment | The repository contains **zero** usages — there is no precedent to copy | P8 deploy experiment; fallback is `no-store` on the public route |
| X-03 | `vercel.json` cron granularity on the current plan | The file's history is not visible in this pass | P8, before relying on a one-minute sweep |
| X-04 | Prisma can emit the two circular FKs (`Portfolio ↔ PortfolioRevision`) in a valid migration order | Not applied anywhere yet | P2, against a throwaway Postgres |
| X-05 | Bundled weight of `@dnd-kit` in this app | Measured only after installation | P4, before/after bundle measurement |

---

## D. Explicit non-decisions (out of scope, reserved)

- Custom CSS editor, absolute positioning, third-party embeds, forms, scheduling of portfolio publishing, custom
  domains, multi-language pages, template marketplace, shared/team portfolios, analytics.
- Each would need its own threat model or design screens; none is required for the MVP and none is designed here.
