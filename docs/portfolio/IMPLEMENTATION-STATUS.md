# Implementation Status

Living record of the Professional Portfolio build. **Only evidence goes here** — a phase is marked complete
only when its Definition of Done is satisfied. Updated after every phase.

Branch `hermes/portfolio-p1` · worktree `/private/tmp/so-portfolio` · baseline `435fd07`.

| Phase | Status | Evidence |
|---|---|---|
| P1 Document core | **DONE** | 6 modules + 35 unit tests (`portfolio-document.test.ts`), commit `d20bd8c` |
| P2 Persistence & authorization | **DONE (code) / UNVERIFIED (database)** | schema + migration + guard + service + 2 routes + 11 tests, commit `9e3929c`. No local Postgres, so the migration and the composite-FK drill have **not** been executed (O-05) |
| P3 Public renderer | **DONE (code + render tests)** | shared renderer, `/p/[handle]`, not-found state, 6 render tests, commit `_P3_` |
| P4 Builder shell | **PARTIAL — engine done, UI not started** | `commands.ts` + `history.ts` + 13 tests (insert/delete/duplicate/move/reorder/props/style, undo/redo). The editor UI is blocked on Stitch builder screens (O-03) |
| P5 Styling controls | **NOT STARTED** | depends on P4 |
| P6 Responsive editing | **NOT STARTED** | depends on P5 |
| P7 Components / templates / assets | **NOT STARTED** | depends on P4; component *contracts* already exist from P1 |
| P8 Publish / revisions / media pinning | **NOT STARTED** | depends on P3+P7; needs a database to verify (O-05) and Blob experiments (O-01) |
| P9 Hardening | **NOT STARTED** | depends on P8 |

---

## P1 — Document core (done)

**Implemented.** `types.ts` (document tree, `StyleValue` union, caps), `tokens.ts` (token table + four-family
font allowlist + resolution), `style.ts` (ordered rule table: enums, bounds, colours, fonts, shadows),
`registry.ts` (16 user-insertable components + system `PAGE`, strict zod schemas, defaults, parent→child
matrix), `responsive.ts` (desktop → tablet → mobile merge), `validate.ts` (`parseDocument`, total and
deterministic validation, id uniqueness so cycles are unrepresentable).

**Tests.** `tests/unit/portfolio-document.test.ts` — 35/35 pass. Covers: valid six-section page, every
component in a legal position, all child-rule violations, unknown type/prop/style key, bounds, token
missing/wrong family, raw CSS rejected, duplicate ids, depth/page caps, absolute position rejected,
responsive precedence, literal-beats-token, determinism.

**Known limitation.** `parseDocument` validates but does not inject schema defaults; renderers therefore merge
`REGISTRY[type].defaults` themselves (done in P3).

---

## P2 — Persistence and authorization (code done, database unverified)

**Implemented.**
- `prisma/schema.prisma`: `PortfolioStatus`, `Portfolio`, `PortfolioRevision`, `PortfolioPinnedMedia`,
  `PortfolioBlobTask`, `PortfolioTemplate`, `MediaAsset.visibility`; `User.portfolio` back-relation.
- Composite foreign keys: `Portfolio(publishedRevisionId, id) → PortfolioRevision(id, portfolioId)` with
  `onDelete: NoAction` (SetNull is impossible because the FK contains the required `id`), and
  `PortfolioPinnedMedia(revisionId, portfolioId) → PortfolioRevision(id, portfolioId)` `Cascade`.
- `prisma/migrations-postgres/20261103120000_portfolio/migration.sql` — hand-written SQL, ordered so the
  circular FK is added after both tables exist.
- `src/lib/tenancy/guard.ts`: `requirePermission(permission)` — session → role matrix, **no workspace
  requirement**; `effectiveRole` keeps the sole-member-is-ADMIN rule; `FALLBACK_ROLE` is CLIENT.
- `src/lib/roles.ts`: `portfolio:edit` (ADMIN/MANAGER/EDITOR), `portfolio:publish` (ADMIN/MANAGER).
- `src/lib/portfolio/blank.ts` (blank canvas + handle rules + reserved words), `service.ts`
  (get/create/saveDraft/handle/publishedRevisionByHandle — every query filtered by `userId` except the
  create, which carries the owner).
- Routes: `GET/POST/PATCH /api/portfolio`, `PATCH /api/portfolio/draft` (parse → compare-and-set on
  `documentVersion`, 422 invalid / 409 stale).

**Tests.** `tests/unit/portfolio-ownership.test.ts` — 11/11 pass. Every portfolio route must call
`requirePermission(`, derive work from `guard.userId` (never a body `userId`), and go through the service;
the service must scope queries by `userId`; the public read path must require `status === "PUBLISHED"`.
Plus handle rules (reserved words, length, characters) and the blank document passing the validator.

**Explicitly unverified (needs a database — O-05).**
1. `prisma migrate deploy` applies cleanly.
2. The composite FK rejects a cross-portfolio `publishedRevisionId` (raw SQL).
3. A pin row cannot mix a portfolio with another portfolio's revision.
4. Deleting a `MediaAsset` nulls the pin's provenance and keeps the pin.
5. Duplicate publish is idempotent (`@@unique([portfolioId, hash])`).

**Scanner note.** The planned `portfolio/**` exception in `tests/unit/route-permissions.test.ts` turned out to
be **unnecessary**: the `TENANT_DATA` scan only fires when a route source references tenant models
(`prisma.mediaAsset.` and friends), and the portfolio routes route all data access through the service. No
exception was added — the rule set is unchanged. `route-permissions.test.ts` fails 4/10 checks **at baseline**
(unrelated routes: brains/active, review/[token], workspaces/*, posts/route); verified by stashing the P2 work
and re-running.

---

## P4 — Builder engine (done) / builder UI (not started)

**Implemented (engine, no UI).**
- `src/lib/portfolio/commands.ts`: every editing action is a pure command that returns a **new** document.
  `insert` refuses an unknown type, a `PAGE`, a leaf parent or an illegal parent→child pair, and enforces the
  depth/node caps; `delete` refuses the page root; `duplicate` copies a subtree with caller-supplied fresh ids
  (so ids stay unique and deterministic in tests); `move` refuses moving a container into its own descendant
  and re-validates the child rule and depth; `reorder` swaps siblings; `updateProps` / `updateStyle` /
  `updateText` patch one node. The input document is never mutated (asserted).
- `src/lib/portfolio/history.ts`: undo/redo as a capped document stack (`HISTORY_LIMIT = 100`), with a failed
  command leaving state untouched and no redo entry.

**Tests.** `tests/unit/portfolio-commands.test.ts` — 13/13 pass (legal/illegal insert, PAGE and unknown-type
refusal, root deletion refusal, duplicate ids, move-into-itself, reorder edge, immutable input, blank-canvas
flow, undo/redo walk, failed command, stack cap).

**Not started (needs designs).** Canvas, layer tree, selection outlines, drop indicators, pointer drag,
inspector, pages manager, shortcut overlay, autosave wiring in the UI. The engine above is what those screens
call — no design decision is embedded in it.

## P3 — Public renderer (code done, render-tested)

**Implemented.** `src/lib/portfolio/css.ts` (validated style values → declarations; responsive overrides →
media queries), `src/components/portfolio/render/document-renderer.tsx` (one renderer for every node type:
PAGE/SECTION/CONTAINER/STACK/GRID/COLUMN/SPACER/DIVIDER/HEADING/TEXT/BUTTON/IMAGE/PROJECT_CARD/
EXPERIENCE_ITEM/SKILL_GROUP/SOCIAL_LINKS/CONTACT_BLOCK), `src/app/p/[handle]/page.tsx` (published revision
only, `generateMetadata` with OG image from pinned media), `src/app/p/[handle]/not-found.tsx` (one state for
unknown and unpublished — no existence disclosure).

**Tests.** `tests/unit/portfolio-render.test.ts` — 6/6 pass: six-section render, HTML escaping of user text,
`javascript:` never emitted, pinned media uses frozen dimensions, missing media renders a labelled fallback,
responsive overrides emitted as media queries with the heading rendered once, token references resolved to
literals.

**Unverified.** The page has not been opened in a browser against a real database (no DB locally). Its caching
strategy is `dynamic = "force-dynamic"` for now; the `revalidateTag` plan is still O-02.

---

## Next action (exact)

1. **P4's UI requires designs.** The engine is done and tested; the canvas, layer tree, inspector and drop
   indicators are not. Per the architecture these must not be invented. With approval of *"build the builder
   with the app's existing design language (so-* tokens, Hanken Grotesk), flagged as non-Stitch"*, the UI can
   start immediately; otherwise it waits for those screens.
2. (previous item 1) **P4 requires designs.** The Stitch export has no builder shell, component library, inspector, breakpoint
   switcher or mobile editor. Per the architecture these must not be invented. With approval of *"build the
   builder with the app's existing design language (so-* tokens, Hanken Grotesk), flagged as non-Stitch"*, P4
   can start immediately; otherwise it waits for those screens.
2. **Database.** Supply a throwaway Postgres URL (or a CI job) to close the five P2 items above; everything
   from P2 onward is otherwise only typechecked.
3. **P8 dependencies**: Blob experiment (O-01) and `revalidateTag` experiment (O-02).
4. `@dnd-kit` remains unapproved (O-04). P4 can ship pointer drag via native HTML5 DnD + keyboard commands
   **without** a dependency if that is preferred over waiting.

## Test inventory (this worktree)

```
tests/unit/portfolio-document.test.ts   35 pass
tests/unit/portfolio-ownership.test.ts  11 pass
tests/unit/portfolio-render.test.ts      6 pass
tests/unit/portfolio-commands.test.ts   13 pass
                                        ───────
                                        65 pass, 0 fail
```

Totals of the whole repo run are **not** claimed: several pre-existing suites fail at baseline
(`route-permissions` 4/10, `roles` 1/19), verified by stashing this work.
