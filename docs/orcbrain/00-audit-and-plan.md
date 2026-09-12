# OrcBrain — audit and implementation plan

Branch: `hermes/orcbrain` (off `hermes/integration-check`, which holds the whole
fleet's work: `lead/integration` + roles + TikTok provider + the design pass).

This file is STEP 1–3 of the OrcBrain master brief: what the repository actually
is, what already exists that OrcBrain must reuse, and the order we build in.

## 1. Audit — what is really there (verified 2026-09-12)

| Area | Reality | Consequence for OrcBrain |
|---|---|---|
| Framework | Next.js **16.3.4** App Router, React 19.2.8, Turbopack | server routes + server components as usual; read `node_modules/next/dist/docs/` before reaching for remembered APIs |
| Database | **SQLite** via Prisma **7.10** (`file:./dev.db`, tracked in git) | **no pgvector.** Embeddings live in `brain_chunks.embedding` as a base64 Float32 blob and retrieval is brute-force cosine in JS, capped. Migration path to Postgres + pgvector documented, not pre-built |
| Auth | NextAuth v4, credentials + JWT; `User.role` (ADMIN/MANAGER/EDITOR/CLIENT) from the roles work | brain permissions reuse the same roles |
| Multi-tenancy | **no Workspace model at all.** Social accounts, posts and jobs hang off `User` | OrcBrain needs `Workspace` + `WorkspaceMember`, with a default workspace **backfilled for every existing user** and every contract (Brain, chat, social) workspace-scoped from day one |
| AI layer | `src/lib/ai.ts` (204 lines): a module-level `OpenAI` client, `gpt-4o-mini` hardcoded, no streaming, no embeddings, no provider abstraction. Keys: `OPENAI_API_KEY` / `OPENAI_BASE_URL` | build `src/lib/brain/ai.ts` as an abstraction (`chat`, `stream`, `completeJson`, `embed`, `title`, `summarize`) over the same OpenAI-compatible SDK; **do not** wire OrcBrain directly to a vendor SDK |
| Data honesty smell | `suggestBestTimes()` returns **hardcoded** per-platform day/hour tables with scores, presented as recommendations | the brief forbids fake analytics. OrcBrain insights must carry evidence or they do not render; the existing hardcoded table stays as-is (not OrcBrain's business) but must never be merged into "AI Learnings" |
| File storage | `@vercel/blob` already used by `/api/media` | reuse for Brain uploads; keep `MediaAsset` for post media, add `brain_sources.blobUrl` for knowledge files |
| UI kit | Tailwind v4 + **Base UI** (not Radix) + shadcn-style primitives in `src/components/ui/*` | reuse; note `dropdown-menu.tsx` now exports `DropdownMenuGroupLabel` for grouped labels (Base UI requires a group context) |
| Tests | `node:test` via tsx: `npm run test:unit`, `npm run test:e2e` (18/18 gate + publish chain), `npm run test:durability` | OrcBrain gets unit tests for the pure core plus named acceptance tests |
| Roles | `requirePermission()` in `src/lib/auth.ts`; `session.user.role` + `permissions` | brain writes = `posts:create`-class roles; brain-admin (delete sources, edit brand profile) = ADMIN/MANAGER |
| Social layer | 7 connector callbacks, shared `createOAuthCallback`, `src/lib/social/*` (capabilities, media, errors, PKCE) | `socialContextService` reads `SocialAccount` + `PublishingJob` **capability-first**, never assuming a metric exists |

## 2. Decisions that shape everything

1. **One OrcBrain per workspace, not per agent.** Agents are roles with
   instructions and tool permissions over one shared intelligence. A learning
   from Growth Orc is immediately visible to Content Orc.
2. **Workspace is the isolation boundary.** Every brain/chat/social query takes
   `workspaceId` from the **server-side session + membership check**, never from
   the request body. Acceptance test E depends on this.
3. **Three knowledge kinds, kept distinct** (brief §13):
   `profile` (user typed) · `source` (documents, URLs, social accounts) ·
   `memory` (AI-inferred, with confidence and an approve/edit/dismiss step).
4. **Retrieval, not dumping.** `getBrainContext()` assembles:
   system → agent instructions → workspace/brand profile → retrieved chunks →
   social facts → conversation summary → recent messages → user message.
5. **No fabricated analytics.** An insight without evidence does not render.
   With no analytics collected yet, the Insights panel shows an honest empty
   state instead of invented numbers.
6. **Degraded-but-honest offline mode.** With no embedding provider configured,
   the pipeline falls back to a deterministic local hashed-ngram vector so
   ingestion, retrieval and tests work offline; the UI labels the index
   `local-hash (degraded)` rather than pretending it is semantic.

## 3. Build order

**Slice 1 — foundation (this branch, now)**
1. Schema: `Workspace`, `WorkspaceMember`, `BrandProfile`, `BrainSource`,
   `BrainChunk`, `BrainMemory`, `BrainInsight`, `Conversation`, `Message`,
   `MessageAttachment`, `AiAgent`; `SocialAccount.workspaceId`; backfill
   migration (one workspace + OWNER membership per existing user).
2. `src/lib/brain/`: `ai.ts` (provider abstraction + streaming), `chunk.ts`,
   `embed.ts` (provider + local fallback + cosine), `health.ts` (Brain Health
   score), `agents.ts` (the eight Orc charters), `retrieve.ts` (RAG assembly).
3. Unit tests for chunking, embedding determinism/cosine, health scoring,
   agent registry, and retrieval ordering.

**Slice 2 — API + ingestion**: `/api/brain*`, `/api/conversations*`,
`/api/chat/stream`, source ingestion (text, URL, file via blob, social account
sync), re-index and delete-with-cascade.

**Slice 3 — UI**: `/brain` (health, brand profile, sources, search, learnings,
memories), `/chat` (conversation sidebar, streaming, agent selector, OrcBrain
context indicator, citations), empty-state onboarding wizard.

**Slice 4 — intelligence**: `socialContextService` + Growth/Trend insights from
real stored metrics only, proactive recommendation cards, Chief Orc orchestration
across agents, page-context chat.

**Slice 5 — actions**: tool layer (`create_draft_post`, `schedule_post`,
`save_brain_memory`, …) with mandatory confirmation for publishing, messaging,
deleting or spending.

## 4. Acceptance tests (from the brief) and where they land

| Test | Scenario | Slice | Status |
|---|---|---|---|
| A | brand profile persists across refresh | 2+3 | pending |
| B | PDF upload → Processing → Ready → indexed | 2 | pending |
| C | chat answers using brand voice | 3+4 | pending |
| D | document question returns the chunk + source citation | 3+4 | pending |
| E | **workspace A never retrieves workspace B data** | 1+2 | pending (design fixed: workspace id only from session) |
| F | chat attachment is conversation-scoped unless "add to Brain" | 2+3 | pending |
| G | deleting a source removes its chunks from retrieval | 2 | pending |
| H | long conversation is summarized, recent context intact | 2 | pending |
| I | conversation history survives refresh | 2+3 | pending |
| J | provider failure shows a retry state, never a fabricated answer | 2+3 | pending |

## 5. Known constraints to state up front

- SQLite brute-force retrieval is fine for thousands of chunks, not millions.
  The retrieval service takes a `maxChunks` budget and reports when it truncated.
- No AI provider key is configured in this environment, so every AI-dependent
  acceptance test (C, D, H) is verified with a **stubbed provider** in unit tests
  and must be re-run against a real key before it is called done.
- File extraction (PDF/DOCX) needs a parser. Plan: extract text for `txt/md/csv`
  natively, and for PDF/DOCX store the blob + mark the source `processing` until a
  parser dependency is approved — never mark a source `ready` without extracted text.
