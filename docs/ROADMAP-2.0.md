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
| Unit test suite | **Working** | `npm run test:unit` → 21 assertions across platform-config, error-classification, content-validation |
| In-repo E2E harness | **Working** | `npm run test:e2e` → **18/18 PASS** (throwaway DB, own server on :3123, mock adapters only, gate asserted, cron auth 401s, no double-post) |
| LinkedIn / X / Meta / TikTok / YouTube | **Blocked on credentials** | no developer app exists on the estate; each needs owner-created app + consent |
| Public HTTPS origin (OAuth redirect) | **Working, ephemeral** | Cloudflare quick tunnel serves the app over HTTPS and the OAuth redirect is built on it; the hostname changes on every tunnel restart, so a named tunnel or Vercel is still needed for anything durable |

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
| M0.6 | ✅ Connector contract | Hermes | capability flags on every platform, normalized error taxonomy, capability-driven content validation, unit suite | `npm run test:unit` → 21 assertions pass; `tsc --noEmit` clean | — |
| M0.3 | LinkedIn connector live | **Hassan** | OAuth flow + real post on the operator's profile | post visible on LinkedIn | create app + consent |
| M0.4 | Stable HTTPS origin | **Hassan** | Vercel deploy, or a named Cloudflare tunnel, replacing the ephemeral quick tunnel | OAuth redirect completes against a stable hostname | deploy login |

### P1 — Manage everything

| # | Milestone | Owner | Deliverable | Exit test |
|---|---|---|---|---|
| M1.1 | X + Facebook Page connectors | website-dev | OAuth adapters on the hardened contract | publish visible on each network |
| M1.2 | Instagram + YouTube connectors | website-dev | container/upload flows (media required) | publish visible on each network |
| M1.3 | TikTok connector | website-dev | video publish (SELF_ONLY until audit) | publish visible in TikTok app |
| M1.4 | Unified calendar + queue | ios-mobile-dev | drag-to-reschedule, timezone correctness | scheduled post fires at the right local time |
| M1.5 | Unified inbox | ios-mobile-dev | comments/mentions/messages aggregation | one inbox shows ≥2 networks |
| M1.6 | Token lifecycle | website-dev | refresh, expiry alerts, reconnect prompts | expired token triggers refresh, not a failed publish |

### P2 — Intelligence

Brand Brain → AI Studio (multi-variant), Traction Score (§41), Campaign Readiness (§42),
Growth Brief (§40), Trend/Competitor agents, Network Discovery + Global Social Map (§6–7),
translation/localization with Cultural Intelligence review (§11–12).

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
| **Green tests on a tree that does not compile** | false "done" (happened: M0.2 shipped on a base failing `tsc` with 4 TELEGRAM map errors) | `npm run typecheck` is part of the Definition of Done and of `npm test`; run it before claiming PASS |

---

## 5. Next tasks (sprint-ready)

1. **M0.3** — LinkedIn app created → connector exercised end-to-end → post on the operator's profile (**needs Hassan**).
2. **M0.4** — stable OAuth origin (Vercel deploy or named tunnel) (**needs Hassan**).
3. **M1.1** — X + Facebook Page connectors built on the hardened contract (website-dev).
4. **Retry-policy wiring** — the worker currently retries everything; `isPermanent()` now exists, so permanent failures (bad credentials, rejected content) can dead-letter on the first attempt instead of burning three schedule windows. Needs a fault-injection path in the E2E suite.

---

## 6. How this roadmap is maintained

Update the status table in §1 and the milestone row whenever a milestone closes — with the
command and its output that proved it. Vision language belongs in `VISION-2.0.md`; scope
arguments belong in `PRD.md`; **this file only records what is built, what is next, who owns
it, and what blocks it.**
