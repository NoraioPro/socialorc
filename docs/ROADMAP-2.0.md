# SocialOrc 2.0 — Execution Roadmap

> **Owner:** Hassan Nasr · **Technical lead:** Hermes (agent) · **Builders:** Grok Bot agent fleet
> **Source of truth:** `docs/VISION-2.0.md` (spec) + `docs/PRD.md` (Generation 1 scope)
> **Rule:** a milestone is only "done" when its exit test passes on a real run, with the output pasted into the PR.

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
| **P0** | Prove the loop | §60 (MVP) | 1 real platform publishing on a schedule, gate enforced |
| **P1** | Manage everything | §60, §4, §5 | 6 core platforms connected, unified calendar + inbox |
| **P2** | Intelligence | §39–44, §6–7 | Growth Brief, Traction Score, Campaign Readiness, Global Map |
| **P3** | Network beta | §14–29 | profiles, follow, feed modes, communities, XP/levels |
| **P4** | Economy + scale | §30–38, §57–58 | creator marketplace, monetization, Connector SDK, open API |
| **P5** | Global layer | §36–38, §59, §65 | cross-network identity, reputation graph, connector marketplace |

**P0 is where we are.** Milestones below are sized so each one is a single agent task with
one testable exit criterion.

---

## 3. Milestones

### P0 — Prove the loop (finish this first)

| # | Milestone | Deliverable | Exit test | Blocker |
|---|---|---|---|---|
| M0.1 | ✅ Telegram real publish | adapter + connect route | message id returned + visible in chat | — |
| M0.2 | CI-style E2E harness in-repo | `tests/e2e/publish.test.ts` (or script) runnable in CI with mock adapter | `npm run test:e2e` exits 0 | — |
| M0.3 | LinkedIn connector live | OAuth flow + real post on the operator's profile | post visible on LinkedIn | **owner: create app + consent** |
| M0.4 | Public HTTPS origin | Vercel deploy (prod + preview) with `CRON_SECRET`, DB, encryption key | OAuth redirect completes against the deployed URL | **owner: Vercel login** |
| M0.5 | ✅ Durable job queue | retry with exponential backoff (30s → 60s → dead-letter), idempotency guard on `platformPostId`, oldest-first scheduling, queue counters in the cron response | forced adapter failure retries 3× then dead-letters; re-armed published post is deduped, never re-sent | — |
| M0.6 | Connector contract hardening | `validateCredentials`, capability flags, media upload, per-platform error mapping | unit tests per adapter | — |

### P1 — Manage everything

| # | Milestone | Deliverable | Exit test |
|---|---|---|---|
| M1.1 | X + Facebook Page connectors | OAuth adapters, real posts | publish visible on each network |
| M1.2 | Instagram + YouTube connectors | container/upload flows (media required) | publish visible on each network |
| M1.3 | TikTok connector | video publish (SELF_ONLY until audit) | publish visible in TikTok app |
| M1.4 | Unified calendar + queue | drag-to-reschedule, timezone correctness | scheduled post fires at the right local time |
| M1.5 | Unified inbox | comments/mentions/messages aggregation | one inbox shows ≥2 networks |
| M1.6 | Token lifecycle | refresh, expiry alerts, re-connect prompts | expired token triggers refresh, not a failed publish |

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
| No platform developer apps exist | blocks every non-Telegram connector | M0.3/M0.4 first; keep token-based connectors as the wedge |
| App-review latency (Meta, TikTok audit, YouTube verification) | weeks of calendar time | build against mock + test users; isolate review-gated scopes behind capability flags |
| localhost rejected as OAuth redirect | blocks all OAuth work locally | deploy to Vercel early (M0.4); tunnels are unreliable on this network |
| Broken IPv6 route on build hosts | server-side `fetch` stalls ~10s then `fetch failed` | run servers with `NODE_OPTIONS=--dns-result-order=ipv4first` |
| Approval gate regressions | the one thing that must never break | gate test is part of every PR's evidence; treat a bypass as a release blocker |
| Agents claiming "done" without proof | untrustworthy build state | Definition of Done requires pasted command output (see `docs/AGENT-BRIEF.md`) |

---

## 5. Next five tasks (sprint-ready)

1. **M0.2** — move the E2E publish script into the repo, runnable headless against the mock adapter.
2. **M0.3** — LinkedIn app created → connector exercised end-to-end → post on profile.
3. **M0.4** — Vercel deploy with real env vars, cron verified in the cloud.
4. **M0.5** — job queue retry/backoff + idempotency so a transient API failure can never double-post.
5. **M0.6** — adapter unit tests + capability flags so P1 connectors land on a tested contract.

---

## 6. How this roadmap is maintained

Update the status table in §1 and the milestone row whenever a milestone closes — with the
command and its output that proved it. Vision language belongs in `VISION-2.0.md`; scope
arguments belong in `PRD.md`; **this file only records what is built, what is next, and what
blocks it.**
