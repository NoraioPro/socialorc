# SocialOrk Professional Portfolio — OPEN ISSUES

Only genuine blockers that cannot be resolved from repository evidence or a sound technical decision.
Everything else is settled in `FINAL-ARCHITECTURE.md` and `DECISION-LOG.md`. Each item states exactly what is
missing and which phase it blocks.

---

## O-01 — Blob durability and copy stability are unverified **[blocks P8 acceptance]**

**Missing evidence.** The `@vercel/blob` package in use (2.8.0) exports `copy`, `del`, `head`, `list` **[V]**,
but nothing in the repository or the documentation read so far states (a) that a copied object survives deletion of
its source object, or (b) what the store's retention policy is.

**Why a decision cannot cover it.** The immutability guarantee for published media rests on it. Assuming it would
be exactly the kind of unverified claim this document set forbids.

**How it is closed.** One experiment on the real store, run in P8: publish a revision → delete the source
`MediaAsset` row and its blob → fetch the pinned URL and compare bytes → wait past any retention window the
dashboard exposes. If the guarantee does not hold, the fallback is to store the bytes in the revision path at
first pin (`putFromUrl` instead of `copy`) and to keep the pin record as the only reader.

---

## O-02 — Cache revalidation behaviour on this deployment is unverified **[blocks P8 acceptance]**

**Missing evidence.** `src/app` contains no `revalidateTag`, `revalidatePath` or `unstable_cache` usage **[V]**.
Next 16.4.3 documents these primitives, but this repo has no working precedent on its deployment target, and the
public page's "publish → visible" latency depends on it.

**How it is closed.** In P8, on a preview deployment: publish twice and measure the time until `/p/<handle>`
serves the new revision, with `revalidateTag` first and `no-store` as the fallback. The chosen behaviour is recorded
here before P8 is marked done.

---

## O-03 — Stitch designs for the builder surfaces do not exist yet **[blocks P4, P5, P6, P7, P8]**

**Missing evidence.** The Stitch export covers four screens: public profile, profile editor, studio dashboard,
theme customizer. It contains **no** builder shell, component library, inspector, breakpoint switcher, mobile
editor, template gallery, asset picker, autosave/conflict states, publish preflight, or revision history.

**Why it cannot be decided here.** The instruction is explicit: Stitch is the visual source of truth and the
builder must not invent screens. The exact list per phase is in `IMPLEMENTATION-PLAN.md` §"Stitch gate summary".

**How it is closed.** You add those screens to the Stitch project. P1–P3 are unaffected.

---

## O-04 — `@dnd-kit` dependency approval **[blocks P4]**

**Missing evidence.** Approval, not information. The repository has no drag-and-drop library **[V]**; the four
packages and their versions are proposed with justification in `DECISION-LOG.md` D-26.

**How it is closed.** One-line approval. Without it, P4 can ship keyboard + explicit move commands only, which
fails the "real visual builder" bar the product decision sets.

---

## O-05 — A database that can run the e2e/perf matrix **[blocks P2 migration test, P8 and P9 verification]**

**Missing evidence.** This machine has no local Postgres and no Docker **[V]** (earlier phases established this),
so `npm run test:e2e`, `test:durability` and the throwaway-database migration check cannot be executed here.

**How it is closed.** Either a CI job with a Postgres service, or a throwaway hosted database URL you provide for
verification runs. Until then, P2/P8/P9 can only be typechecked and unit-tested locally, and the report must say so.

---

## Non-blocking notes (recorded, not blockers)

- **N-01** `DELETE /api/media` is scoped by `workspaceId`, so a workspace member with `media:delete` can delete a
  teammate's library row **[V]**. Portfolio media checks are `userId`-based and unaffected; changing the media
  route is out of scope for this feature and should be its own task.
- **N-02** `MediaAsset.width/height` are nullable and never populated on upload **[V]**. Pinning reads dimensions
  from the file at publish time; populating them at upload is a separate improvement.
- **N-03** The three starter templates need authored content. The implementing engineer writes them as JSON
  fixtures validated by `parseDocument()`; if you want an editorial review of the copy, that is a content task,
  not a blocker.
