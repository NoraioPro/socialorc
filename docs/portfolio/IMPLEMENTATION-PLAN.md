# SocialOrk Professional Portfolio — IMPLEMENTATION PLAN

Companion to `FINAL-ARCHITECTURE.md`. Nine phases, dependency-ordered. Each phase lists scope, likely files,
prerequisites, required Stitch screens, database changes, tests, definition of done, and exclusions.

Labels: **[V]** verified in repo · **[D]** decision · **[X]** external verification required.

---

## Dependency graph

```
P1 Document core & validation
   └─► P2 Persistence & authorization
          ├─► P3 Public renderer & published-page states      (independent of the builder)
          │      └─► P4 Builder shell & editing
          │              └─► P5 Styling & design controls
          │                     └─► P6 Responsive & mobile
          │                            └─► P7 Components, templates, blank canvas
          │                                   └─► P8 Publishing, revisions, media pinning
          │                                          └─► P9 Hardening & production verification
```

P3 depends on P2 only for the shape of the read model; it does **not** wait for any builder screen. This is the
correction to the previous plan, where P3 was gated behind editor designs it never uses.

---

## P1 — Document core and schema validation

**Scope.** Types, token table, component registry (schemas, defaults, child rules), `parseDocument()`, migration
chain stub (`schemaVersion` 1), unit tests. No React, no DB, no route.

**Files / modules.** `src/lib/portfolio/types.ts`, `tokens.ts`, `registry.ts` (or `registry/*.ts`), `validate.ts`,
`limits.ts`, `tests/unit/portfolio-document.test.ts`.

**Prerequisites.** None.

**Stitch screens.** None.

**Database.** None.

**Registry available at exit.** All sixteen user-insertable types + system `PAGE` (schemas, defaults,
child rules and validation only — no renderers). Recorded as a P1 correction: the registry is the contract
every later phase reads, so splitting it across phases would have meant two sources of truth.

**Tests / acceptance.**
- Valid 6-section document parses; every illegal child pair rejected; unknown type/prop/style key/token rejected
  with an exact path; bounds and caps enforced; duplicate id rejected; `position:{mode:"ABSOLUTE"}` rejected.
- ≥20 cases, including a resolver test proving a literal beats a token.
- `npx tsc --noEmit` clean for new files; `npx tsx --test tests/unit/portfolio-document.test.ts` green.

**Definition of done.** Validator is the only gate; nothing else in the codebase depends on unparsed input.

**Exclusions.** No UI, no persistence, no publishing, no remaining 9 components.

---

## P2 — Persistence and authorization

**Scope.** The five models + `MediaAsset.visibility`; `requirePermission()` guard; ownership helpers; portfolio
CRUD (GET read-only, POST create, PATCH handle/SEO); route-scan exception + ownership test.

**Files / modules.** `prisma/schema.prisma`, `prisma/migrations-postgres/<new>/*`, `src/lib/tenancy/guard.ts`
(add `requirePermission`), `src/lib/roles.ts` (2 permissions), `src/lib/portfolio/{owner,service}.ts`,
`src/app/api/portfolio/route.ts`, `src/app/api/portfolio/draft/route.ts`,
`tests/unit/route-permissions.test.ts`, `tests/unit/portfolio-ownership.test.ts`.

**Prerequisites.** P1.

**Stitch screens.** None (JSON API only).

**Database.** 5 tables + 1 column + 2 permissions. Migration must be applied to a throwaway Postgres first —
**[X]** the circular FK ordering (`Portfolio.publishedRevisionId` ↔ `PortfolioRevision`) has to be proven there.

**Tests / acceptance.**
- Two-user matrix: create/read/save → A gets 404 for B, 409 on second create, 409 on handle collision.
- Cross-portfolio pointer is impossible: a raw SQL attempt to set `publishedRevisionId` to another portfolio's
  revision must fail on the composite FK.
- Scanner suite green with the single `portfolio/**` exception; `portfolio-ownership.test.ts` fails if a route
  loses its ownership predicate.

**Definition of done.** A portfolio can be created, read and saved by its owner and by nobody else.

**Exclusions.** No publish, no media pinning, no UI.

---

## P3 — Public renderer and published-page behaviour

**Scope.** `DocumentRenderer` (shared), public route `/p/[handle]`, 404 states, SEO/OG from the frozen revision,
`dynamic`/revalidation strategy.

**Files / modules.** `src/components/portfolio/render/*`, `src/app/p/[handle]/page.tsx`,
`src/lib/portfolio/dto.ts`, `tests/unit/portfolio-render.test.ts`,
`tests/e2e/portfolio-public.e2e.mjs`.

**Prerequisites.** P2 (read model). **Not** P4.

**Stitch screens (required before this phase starts).**
1. Public profile page — already designed (Stitch export screen 1).
2. `404` unknown handle.
3. `404` unpublished / draft.
4. Image-failed fallback (a media object missing at render time).
5. Social preview card (OG title/description/image composition).

**Database.** Read-only.

**Tests / acceptance.** Published handle → 200 with the frozen document; draft handle → 404; unknown → 404; no
draft field appears anywhere in the HTML; XSS probes (`<script>`, `javascript:` href) render as inert text;
rendered output for the same revision is byte-stable across two requests.

**Definition of done.** A revision produced by a fixture (no editor) renders publicly and correctly.

**Exclusions.** No builder, no preview mode, no publish endpoint (fixtures are inserted directly in tests).

---

## P4 — Builder shell and editing

**Scope.** Three-pane shell, layer tree, canvas, selection, insert/delete/duplicate/reorder/nest, drag and drop
(pointer) + keyboard equivalents, undo/redo, autosave plumbing (writes go through `/api/portfolio/draft`).

**Files / modules.** `src/app/socialork/portfolio/builder/page.tsx`, `src/components/portfolio/editor/*`
(`canvas.tsx`, `layers.tsx`, `insert-menu.tsx`, `selection.tsx`, `use-document-store.ts`, `use-undo.ts`,
`dnd/*`), `src/lib/portfolio/commands.ts`, `package.json` (+`@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`,
`@dnd-kit/modifiers@9.0.0`, `@dnd-kit/utilities@3.2.2` — **[D]**, needs your approval).

**Prerequisites.** P1, P2, P3 (shared renderer).

**Stitch screens (required before this phase).**
1. Builder shell (layers · canvas · inspector) with hover / selected / dragging / drop-indicator states.
2. Component library panel with the five categories.
3. Pages manager (add, rename, reorder, set home, delete confirm).
4. Keyboard-shortcut overlay.
5. Empty canvas state and permission-denied state.

**Database.** Draft only.

**Tests / acceptance.** Every structural command persists and survives reload; drag and keyboard produce identical
documents; an illegal drop is refused with a reason; undo/redo covers every command; bundle delta measured before
and after adding dnd-kit.

**Definition of done.** A user can build a hero + about page from a blank canvas with the mouse or the keyboard.

**Exclusions.** No style controls (P5), no breakpoint editing (P6), no templates (P7), no publishing (P8).

---

## P5 — Styling and design controls

**Scope.** Token editor (create/edit/delete tokens), literal values with bounds, gradients, background stacks,
typography controls, generated inspector tabs (Content · Layout · Style · Responsive), inherited-vs-set markers.

**Files / modules.** `src/lib/portfolio/style.ts` (resolver), `src/components/portfolio/editor/inspector/*`,
`src/components/portfolio/editor/tokens/*`, `tests/unit/portfolio-style.test.ts`.

**Prerequisites.** P4.

**Stitch screens.** Inspector tabs; colour/gradient picker with token-vs-custom toggle and "reset to token";
typography panel; background stack editor.

**Database.** Draft only.

**Tests / acceptance.** Custom colour/gradient/font/size persist; a literal survives a token edit; deleting a used
token is refused with the path; out-of-bounds values rejected by the same validator the API uses.

**Definition of done.** Two portfolios built from the same template can look entirely different without any code.

**Exclusions.** No animations, no custom CSS, no absolute positioning.

---

## P6 — Responsive editing and mobile

**Scope.** Desktop/tablet/mobile breakpoints, sparse override editing, frames at 1440/768/390, mobile editor
(canvas + bottom sheet with Layers/Insert/Inspector), "move into…" flow.

**Files / modules.** `src/lib/portfolio/responsive.ts`, `editor/frames.tsx`, `editor/mobile-sheet.tsx`,
`tests/unit/portfolio-responsive.test.ts`, `tests/e2e/portfolio-responsive.e2e.mjs`.

**Prerequisites.** P5.

**Stitch screens.** Breakpoint switcher with inherited markers; mobile builder (canvas + bottom sheet);
move-into flow; tablet collapsible-panel states.

**Database.** Draft only.

**Tests / acceptance.** Precedence `literal > mobile > tablet > desktop` proven per property; no horizontal
overflow at 390/768/1440; the mobile editor performs real edits (move, insert, content, style, save) — asserted in
e2e, not by inspection.

**Definition of done.** The same document renders correctly at all three widths and can be edited on a phone.

**Exclusions.** No cross-page drag on mobile, no multi-select.

---

## P7 — Remaining components, templates, blank canvas

**Scope.** Add the remaining 10 components to reach the 16-component registry; three template seeds; template
gallery; blank-canvas entry; page manager completion.

**Files / modules.** `src/lib/portfolio/registry/*.ts` (+10), `src/components/portfolio/render/*` (+10),
`scripts/seed-portfolio-templates.mjs`, `src/app/socialork/portfolio/templates/*`,
`tests/unit/portfolio-registry-complete.test.ts`, `tests/e2e/portfolio-templates.e2e.mjs`.

**Prerequisites.** P6.

**Stitch screens.** Template gallery; asset picker (library/upload/alt/focal point); blank-canvas entry.

**Database.** `PortfolioTemplate` seeds only.

**Tests / acceptance.** All 16 contracts validated; the three seeds pass `parseDocument()` in a test and render in a
snapshot; a document created from a template keeps working after the template row is edited or deleted; two users
from one template diverge structurally (asserted by comparing published JSON).

**Definition of done.** A new user can start blank or from three templates and reach any layout the registry allows.

**Exclusions.** No marketplace, no shared designs, no advanced components (VIDEO/GALLERY/EDUCATION/…).

---

## P8 — Publishing, immutable revisions, media pinning

**Scope.** `POST /publish`, `/unpublish`, `/revisions`, `/revisions/[id]/restore`, revision delete, media pinning
with full-sha256 paths, outbox + `/api/cron/portfolio` sweeper, retention GC (20 ∪ active), publish preflight,
conflict handling on autosave.

**Files / modules.** `src/app/api/portfolio/{publish,unpublish,revisions}/route.ts`, `src/lib/portfolio/pin.ts`,
`src/lib/portfolio/outbox.ts`, `src/app/api/cron/portfolio/route.ts`, `vercel.json` (cron entry — config change,
needs approval), `tests/unit/portfolio-publish.test.ts`, `tests/unit/portfolio-outbox.test.ts`,
`tests/e2e/portfolio-publish.e2e.mjs`.

**Prerequisites.** P3, P4, P7.

**Stitch screens.** Autosave/saved/conflict states; preview bar; publish preflight + confirmation; revision history
with restore; unpublished banner.

**Database.** Revision + pin rows written; outbox rows.

**Tests / acceptance.**
- Save never publishes; publish snapshots; unpublish 404s after revalidation; restore renders the older revision
  unchanged.
- **Published media survives library deletion:** publish → delete the `MediaAsset` row → public page 200 and the
  pinned URL returns 200 with identical bytes.
- Partial-failure drill: kill the request between upload and commit (test hook) → outbox sweep removes the orphan
  blobs and no revision exists.
- Duplicate publish returns the same revision (`@@unique([portfolioId, hash])`).
- Retention: with 25 revisions, exactly 20 ∪ active remain; the active revision is refused for manual delete.

**Definition of done.** Publish is atomic from the user's point of view, media is stable, and cleanup is retryable.

**Exclusions.** No custom domains, no scheduled publishing of portfolios.

---

## P9 — Security, failure recovery, production hardening

**Scope.** Two-user API matrix end-to-end; public-access matrix; rate limiting on public handle lookups; a11y pass
on the builder; 2k-node performance fixture; deployed-build verification.

**Files / modules.** `tests/e2e/portfolio-security.e2e.mjs`, `tests/e2e/portfolio-public.e2e.mjs` (extend),
`tests/perf/portfolio-2k.json`, `docs/portfolio/RUNBOOK.md` (operational notes).

**Prerequisites.** P8.

**Stitch screens.** None new; error/empty states already required earlier.

**Database.** None.

**Tests / acceptance.** Cross-user matrix all 404/422; public matrix correct; typecheck 0; unit + e2e green;
recorded render timings for the 2k fixture; `/api/health` commit matches the deployed SHA.

**Definition of done.** Every claim in the final report is backed by a command whose output is pasted.

**Exclusions.** No new features.

---

## Stitch gate summary

| Phase | Screens that must exist before it starts |
|---|---|
| P1, P2 | none |
| **P3** | public page (exists) + 404 unknown + 404 unpublished + image-failed fallback + OG card |
| P4 | builder shell + states, component library, pages manager, shortcut overlay, empty/permission states |
| P5 | inspector tabs, token editor, colour/gradient picker, typography, background stack |
| P6 | breakpoint switcher, mobile builder sheet, move-into flow, tablet panel states |
| P7 | template gallery, asset picker, blank-canvas entry |
| P8 | autosave/conflict, preview bar, publish preflight, revisions/restore, unpublished banner |
| P9 | none |

A phase may not invent a screen. If a Stitch screen is missing when its phase starts, the phase stops and reports
the gap — it does not design one.

---

## Definition of done (MVP as a whole)

1. Blank canvas → publish a six-section page.
2. Two users from one template produce structurally different published documents.
3. Drag and keyboard are equivalent for every structural operation; undo/redo complete.
4. Custom colour/gradient/font/size persist and survive token changes.
5. Desktop/tablet/mobile render without overflow; mobile editing works.
6. Save never publishes; conflicts are surfaced.
7. Published media survives deletion of library rows.
8. Cross-user and public matrices pass.
9. Typecheck 0, unit green, e2e green, deployed build verified by SHA.
