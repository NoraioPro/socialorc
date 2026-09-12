# SocialOrc 2.0 — Execution Roadmap

> **Owner:** Hassan Nasr · **Technical lead:** Hermes · **Builders:** Grok Bot fleet (Website Dev, iOS Mobile Dev, Orchestrator)
> **Source of truth:** `docs/VISION-2.0.md` (spec) + `docs/PRD.md` (Generation 1 scope)
> **Rule:** a milestone is only "done" when its exit test passes on a real run, **on a tree that typechecks**, with the output pasted into the PR.

---

## 1. Where we actually are (verified, not planned)

| Capability | State | Evidence |
|---|---|---|
| Local app (Next 16 / Prisma 7 / SQLite) | **Working** | `npx next dev` serves :3000; schema valid, client generated |
| Approval gate | **Enforced** | scheduling a `DRAFT` returns `400 "Post must be approved before scheduling"` |
| Schedule → cron → publish loop | **Working** | cron before due time `processed: 0`; after, `processed: 1, published: 1` |
| Mock connector path | **Working** | `MOCK_SOCIAL_ADAPTERS=true`, mock OAuth callback → `PUBLISHED` |
| **Real-network connector** | **Working (1 platform)** | Telegram: real messages ids `16`, `17`, `19` delivered to chat `5896074160` |
| Durable job queue (retry/backoff/idempotency) | **Working** | failed publish → attempt 1 `retried`, next due +30s; immediate re-run `processed: 0`; attempt 3 dead-letters (`post FAILED`, job `FAILED after 3 attempts`); re-armed published post → `deduped: 1, published: 0`, platform id unchanged |
| Connector contract (capabilities + error taxonomy) | **Working** | `PlatformCapabilities` on 7 platforms; `classifyAdapterError()` splits retryable vs permanent; content rules enforced in `BasePlatformAdapter` for every adapter |
| Retry policy (classified, not blind) | **Working** | permanent failure (invalid token) dead-letters on attempt **1** with `AUTH_INVALID` and "reconnect the account"; transient failure (unreachable API) retries with backoff then dead-letters after 3 — `npm run test:durability` → 19/19 |
| Token refresh before publish | **Working** | an expiring token is refreshed and persisted before the send; a token that is expired on a non-refreshable connector dead-letters on attempt 1 as `AUTH_EXPIRED` with "reconnect the account" — unit 28/28 · durability 24/24 |
| Credential failure signalling | **Working** | an `AUTH_EXPIRED` publish failure triggers one refresh-and-retry; credential-shaped dead-letters set `SocialAccount.needsReconnect` + `lastError`, a successful publish clears them — unit **30/30** · durability **26/26** |
| Production build | **Working** | `npm run build` succeeds — 30 routes compiled, including all six OAuth callbacks |
| Deployment readiness | **Working** | `GET /api/health` reports database reachability, applied migrations, pending jobs and per-connector missing variable NAMES (never values); `npm run build` compiles 30 routes · runbook in `docs/DEPLOY.md` |
| Unit test suite | **Working** | `npm run test:unit` → **47** assertions across platform-config, error-classification, content-validation, token-refresh, oauth-state, health |
| In-repo E2E harnesses | **Working** | `npm run test:e2e` → **18/18** (happy path, mock adapters, own server + throwaway DB) · `npm run test:durability` → **26/26** (real adapters, injected failures) · `npm run test:live` → **27/27** (live callback paths + health; needs a running server) |
| X + Facebook Page connectors | **Blocked on credentials** | adapters + OAuth callbacks exist (M0.12); `connect` reports exactly which variables are missing (503) |
| LinkedIn / X / Meta / TikTok / YouTube | **Blocked on credentials** | no developer app exists on the estate; each needs owner-created app + consent |
| Public HTTPS origin (OAuth redirect) | **Working, ephemeral** | Cloudflare quick tunnel serves the app over HTTPS and the OAuth redirect is built on it. Two known quirks: it dials `[::1]:3000` before IPv4, so it logs transient `dial tcp [::1]:3000` origin errors whenever the dev server is restarted; and **the hostname changes on every tunnel restart**, which invalidates any redirect URI registered with a provider. Do not restart it casually — use a named tunnel or Vercel for anything durable |

**Reference implementation for all future connectors:** `src/lib/adapters/telegram.ts` +
`src/app/api/social/telegram/connect/route.ts` (commit `2f2aa3b`, PR #1). It proves both
credential shapes the framework must support: OAuth-redirect (LinkedIn/X/Meta) and
token-based (Telegram, and later Discord/WhatsApp/Slack).

---

## 2. Delivery model

Five phases, taken from the spec (§59–64) and mapped to things that can actually be
shipped and tested. The architecture stays global from day one; the rollout is regional.

| Phase | Theme | Spec refs | Exit condition |
|---|---|---|---|
| **P0** | Prove the loop | §60 (MVP) | 1 real platform publishing on a schedule, gate enforced, queue durable |
| **P1** | Manage everything | §60, §4, §5 | 6 core platforms connected, unified calendar + inbox |
| **P2** | Intelligence | §39–44, §6–7 | Growth Brief, Traction Score, Campaign Readiness, Global Map |
| **P3** | Network beta | §14–29 | profiles, follow, feed modes, communities, XP/levels |
| **P4** | Economy + scale | §30–38, §57–58 | creator marketplace, monetization, Connector SDK, open API |
| **P5** | Global layer | §36–38, §59, §65 | cross-network identity, reputation graph, connector marketplace |

**P0 is where we are.** Milestones below are sized so each one is a single agent task with
one testable exit criterion — and one named owner, so two agents never build the same thing.

---

## 3. Milestones

### P0 — Prove the loop (finish this first)

| # | Milestone | Owner | Deliverable | Exit test | Blocker |
|---|---|---|---|---|---|
| M0.1 | ✅ Telegram real publish | Hermes | adapter + connect route | message id returned + visible in chat | — |
| M0.2 | ✅ E2E harness in-repo | website-dev | `tests/e2e/run.mjs` + `npm run test:e2e` (throwaway DB, own server, mock adapters) | **18/18 PASS**; gate `400`; cron auth 401; second cron no double-post | — |
| M0.5 | ✅ Durable job queue | Hermes | retry with exponential backoff (30s → 60s → dead-letter), idempotency guard on `platformPostId`, oldest-first scheduling, queue counters | forced adapter failure retries 3× then dead-letters; re-armed published post is deduped | — |
| M0.6 | ✅ Connector contract | Hermes | capability flags on every platform (expanded: `AuthMethod` type, `nativeScheduling`, `mentions`, `hashtags`, `linkPreview`, `directMessages`, `stories`, `polls`, `threads`), normalized error taxonomy, capability-driven content validation, registry helpers (`getCapabilities`, `filterByCapability`, `platformsByAuthMethod`), unit suite | `npm run test:unit` → **52 assertions pass**; `tsc --noEmit` clean | — |
| M0.7 | ✅ Classified retry policy | Hermes | worker honors `isRetryable`/`isPermanent`: permanent failures dead-letter on attempt 1, transient ones back off; `permanent` counter in the cron response; `TELEGRAM_API_BASE` override for self-hosted Bot API + fault injection | `npm run test:durability` → **19/19** (transient retry+backoff+dead-letter, permanent immediate dead-letter, dedupe) | — |
| M0.8 | ✅ Token refresh before publish | Hermes | expiring tokens are refreshed and persisted before the send; expired + non-refreshable dead-letters immediately as `AUTH_EXPIRED`; `needsTokenRefresh`/`canRefresh` are pure and unit-tested | unit **28/28** · durability **24/24** (case D: expired token, attempt 1 dead-letter, actionable message) | — |
| M0.9 | ✅ Credential failure signalling | Hermes | refresh-and-retry once on an `AUTH_EXPIRED` publish failure; credential-shaped dead-letters set `SocialAccount.needsReconnect` + `lastError` and a successful publish clears them; `requiresReconnect()` is pure and unit-tested | unit **30/30** · durability **26/26** (case B asserts the account flags + reason) | — |
| M0.10 | Reconnect banner in the UI | **website-dev** | render `needsReconnect`/`lastError` on `/settings/accounts` with a reconnect action; contract is already written by the worker | a flagged account shows a banner and the reconnect flow clears the flag | — |
| M0.11 | ✅ Migration baseline | Hermes | committed `prisma/migrations/0_init` (10 tables, generated with `migrate diff`), dev DB marked applied, durability suite runs `migrate deploy` from an empty database | `prisma migrate status` → "Database schema is up to date"; a fresh DB built from migrations alone has all 10 tables + `_prisma_migrations` | — |
| M0.12 | ✅ Shared OAuth callback + state hardening | Hermes | one `createOAuthCallback(platform)` handler behind all six redirect connectors (previously only LinkedIn could finish a connection), PKCE verifier passthrough for X, state validated for TTL + user + platform, reconnecting clears `needsReconnect` | unit **41/41** · live `npm run test:oauth` → **18/18** (no-session, provider-declined, missing params, unknown/forged/cross-platform state, 503 per unconfigured platform) | — |
| M0.13 | ✅ Health endpoint + deploy runbook | Hermes | `GET /api/health` (db, migrations, worker depth, per-connector readiness) and `docs/DEPLOY.md` covering env vars, redirect URIs, the Postgres-vs-container decision, verification and rollback | live `npm run test:live` → **27/27**, including a guard that the payload contains no token-shaped string | — |
| M0.3 | LinkedIn connector live | **Hassan** | OAuth flow + real post on the operator's profile | post visible on LinkedIn | create app + consent |
| M0.4 | Stable HTTPS origin | **Hassan** | Vercel deploy, or a named Cloudflare tunnel, replacing the ephemeral quick tunnel | OAuth redirect completes against a stable hostname | deploy login |

### P1 — Manage everything

| # | Milestone | Owner | Deliverable | Exit test |
|---|---|---|---|---|
| M1.1 | X + Facebook Page connectors | website-dev | OAuth adapters on the hardened contract | publish visible on each network |
| M1.2 | Instagram + YouTube connectors | website-dev | container/upload flows (media required) | publish visible on each network |
| M1.3 | TikTok connector | website-dev | video publish (SELF_ONLY until audit) | publish visible in TikTok app |
| M1.4 | ✅ Unified calendar + queue | website-dev | drag-to-reschedule calendar, timezone-aware display, queue view | unit tests include timezone roundtrip + gate checks; `/dashboard/calendar` and `/dashboard/queue` |
| M1.5 | ✅ Unified inbox | website-dev | comments/mentions/messages aggregation | one inbox shows ≥2 networks — inbox UI at `/dashboard/inbox` aggregates mock items from 7 platforms |
| M1.6 | Token lifecycle | website-dev | refresh, expiry alerts, reconnect prompts | expired token triggers refresh, not a failed publish |

### P2 — Intelligence

| # | Milestone | Owner | Deliverable | Exit test |
|---|---|---|---|---|
| M2.1 | ✅ Content Cascade | new-bot | Select an approved/draft post, adapt to other platforms via AI (mock-safe), create drafts | `npm run test:unit` → 16 cascade tests pass; E2E gate still 400; `/api/posts/[id]/cascade` endpoint + UI dialog |

Brand Brain → AI Studio (multi-variant), Traction Score (§41), Campaign Readiness (§42),
Growth Brief (§40), Trend/Competitor agents, Network Discovery + Global Social Map (§6–7),
translation/localization with Cultural Intelligence review (§11–12). The Experiment Agent
(A/B testing, hypothesis generation, result analysis — VISION §114) starts here as a stub.

| # | Milestone | Owner | Deliverable | Exit test |
|---|---|---|---|---|
| M2.7 | ✅ Experiment flag stub (mock) | new-bot | `src/lib/experiments.ts` — 4 fixture A/B experiments + 4 feature flags with deterministic hash-bucketed assignment (same subject → same arm, no RNG, no clock), weighted variants, kill switch, exposure events that carry a hashed subject only, and a lift/leader result stub; read-only `GET /api/experiments` (session-gated, no write handler). **No live ads APIs and no scraping** — a unit test fails if the lib or the route ever calls `fetch`/`axios`/an ads host, and another if the lib reads the clock. Scheduling is untouched: `evaluateFlag(..., { intent: "SCHEDULE_POST" })` is always `GATE_PRESERVED` | `npx tsc --noEmit` clean · `npm run test:unit` → **69/69** (22 new experiment tests, incl. the offline + determinism guards, the rollout/kill-switch paths and the gate invariant) · `npm run test:e2e` → **18/18** with the approval gate still asserted (`DRAFT` → schedule `400`) · live `GET /api/experiments` → **401** anonymous, **200** for a real session with the fixture registry, the hashed subject and the kill-switch state (17/17 normal, 18/18 with `EXPERIMENTS_KILL_SWITCH="true"`) |

### P3–P5 — as specced

Network beta (§14–29: interest graph, goal feed, feed modes, XP/levels/badges, communities,
matchmaking), economy (§30–34), then the global layer (§36–38, §57–58): cross-network
identity, reputation integrity, Connector SDK, marketplace.

---

## 4. Hard dependencies and risks

| Risk | Impact | Mitigation |
|---|---|---|
| No platform developer apps exist | blocks every non-Telegram connector | M0.3/M0.4 first; token-based connectors stay the wedge |
| App-review latency (Meta, TikTok audit, YouTube verification) | weeks of calendar time | build against mock + test users; isolate review-gated scopes behind capability flags |
| localhost rejected as OAuth redirect | blocks all OAuth work locally | quick tunnel works today; make it stable (M0.4) before real OAuth |
| Broken IPv6 route on build hosts | server-side `fetch` stalls ~10s then `fetch failed` | run servers with `NODE_OPTIONS=--dns-result-order=ipv4first` |
| Approval gate regressions | the one thing that must never break | gate assertion is part of both test suites; a bypass is a release blocker |
| **Two agents in one working copy** | lost edits, stashed work, branch ping-pong (happened: M0.2 was built twice) | **one git worktree per agent** (`git worktree add ../socialorc-<task> -b <agent>/<task>`), one branch per agent, never commit on another agent's branch |
| **Production target mismatch** | the datasource is SQLite via `better-sqlite3`, which cannot run on Vercel serverless — the PRD specifies Postgres for production | M0.4 must choose: switch to a Postgres driver adapter (schema + `TOKEN_ENCRYPTION_KEY` unchanged) or deploy the current stack to a container/VPS; decide before wiring real OAuth credentials. **Not rehearsable on this machine** — no Docker CLI and no local Postgres, so the Postgres path stays unverified until it runs against a real instance. Steps: `docs/DEPLOY.md` |
| **No migration history (`db push` only)** | schema changes were unreviewable — **fixed**: `prisma/migrations/0_init` baselines the schema and the dev DB is marked applied ("Database schema is up to date") | keep `db push` out of shared databases; new changes go through `migrate diff` → committed SQL → `migrate deploy` (the durability suite now runs `migrate deploy`, so the baseline is re-proven on every test run) |
| **`dev.db` is tracked in git** | every agent and worktree carries a stale copy, so registration/login state differs per clone (a fresh worktree has zero users, which broke the live suite until the dev user was re-registered), and the binary churns the index | gitignore `dev.db`, commit `prisma/` + migrations instead, and have each environment build its own database via `migrate deploy`; the suites already do this |
| **Green tests on a tree that does not compile** | false "done" (happened: M0.2 shipped on a base failing `tsc` with 4 TELEGRAM map errors) | `npm run typecheck` is part of the Definition of Done and of `npm test`; run it before claiming PASS |

---

## 5. Next tasks (sprint-ready)

1. **M0.3** — LinkedIn app created → connector exercised end-to-end → post on the operator's profile (**needs Hassan**).
2. **M0.4** — stable OAuth origin (Vercel deploy or named tunnel) (**needs Hassan**).
3. **M1.1** — X + Facebook Page connectors built on the hardened contract (website-dev).
4. **Migrate the fleet's harness too** — `tests/e2e/run.mjs` still prepares its database with `db push`; switching it to `migrate deploy` (website-dev's file) makes both suites prove the baseline, not just the durability one.

---

## 6. How this roadmap is maintained

Update the status table in §1 and the milestone row whenever a milestone closes — with the
command and its output that proved it. Vision language belongs in `VISION-2.0.md`; scope
arguments belong in `PRD.md`; **this file only records what is built, what is next, who owns
it, and what blocks it.**
