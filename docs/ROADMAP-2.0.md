# SocialOrc 2.0 â€” Execution Roadmap

> **Owner:** Hassan Nasr Â· **Technical lead:** Hermes (agent) Â· **Builders:** Grok Bot agent fleet
> **Source of truth:** `docs/VISION-2.0.md` (spec) + `docs/PRD.md` (Generation 1 scope)
> **Rule:** a milestone is only "done" when its exit test passes on a real run, with the output pasted into the PR.

---

## 1. Where we actually are (verified, not planned)

| Capability | State | Evidence |
|---|---|---|
| Local app (Next 16 / Prisma 7 / SQLite) | **Working** | `npx next dev` serves :3000; schema valid, client generated |
| Approval gate | **Enforced** | scheduling a `DRAFT` returns `400 "Post must be approved before scheduling"` |
| Schedule â†’ cron â†’ publish loop | **Working** | cron before due time `processed: 0`; after, `processed: 1, published: 1` |
| Mock connector path | **Working** | `MOCK_SOCIAL_ADAPTERS=true`, mock OAuth callback â†’ `PUBLISHED` |
| **Real-network connector** | **Working (1 platform)** | Telegram: real messages ids `16`, `17` delivered to chat `5896074160` |
| LinkedIn / X / Meta / TikTok / YouTube | **Blocked on credentials** | no developer app exists on the estate; each needs owner-created app + consent |
| Public HTTPS origin (OAuth redirect) | **Blocked** | localhost is rejected by LinkedIn/Meta; Cloudflare quick tunnel never issued a URL on this network |

**Reference implementation for all future connectors:** `src/lib/adapters/telegram.ts` +
`src/app/api/social/telegram/connect/route.ts` (commit `2f2aa3b`, PR #1). It proves both
credential shapes the framework must support: OAuth-redirect (LinkedIn/X/Meta) and
token-based (Telegram, and later Discord/WhatsApp/Slack).

---

## 2. Delivery model

Five phases, taken from the spec (Â§59â€“64) and mapped to things that can actually be
shipped and tested. The architecture stays global from day one; the rollout is regional.

| Phase | Theme | Spec refs | Exit condition |
|---|---|---|---|
| **P0** | Prove the loop | Â§60 (MVP) | 1 real platform publishing on a schedule, gate enforced |
| **P1** | Manage everything | Â§60, Â§4, Â§5 | 6 core platforms connected, unified calendar + inbox |
| **P2** | Intelligence | Â§39â€“44, Â§6â€“7 | Growth Brief, Traction Score, Campaign Readiness, Global Map |
| **P3** | Network beta | Â§14â€“29 | profiles, follow, feed modes, communities, XP/levels |
| **P4** | Economy + scale | Â§30â€“38, Â§57â€“58 | creator marketplace, monetization, Connector SDK, open API |
| **P5** | Global layer | Â§36â€“38, Â§59, Â§65 | cross-network identity, reputation graph, connector marketplace |

**P0 is where we are.** Milestones below are sized so each one is a single agent task with
one testable exit criterion.

---

## 3. Milestones

### P0 â€” Prove the loop (finish this first)

| # | Milestone | Deliverable | Exit test | Blocker |
|---|---|---|---|---|
| M0.1 | âœ… Telegram real publish | adapter + connect route | message id returned + visible in chat | â€” |
| M0.2 | ✅ CI-style E2E harness in-repo | `tests/e2e/run.mjs` + `npm run test:e2e` (branch `website-dev/e2e-harness`) | `npm run test:e2e` → **18/18 PASS**; gate `400 Post must be approved before scheduling`; mock publish; second cron no double-post | — |
| M0.3 | LinkedIn connector live | OAuth flow + real post on the operator's profile | post visible on LinkedIn | **owner: create app + consent** |
| M0.4 | Public HTTPS origin | Vercel deploy (prod + preview) with `CRON_SECRET`, DB, encryption key | OAuth redirect completes against the deployed URL | **owner: Vercel login** |
| M0.5 | Durable job queue | replace "cron scans pending rows" with retry/backoff + dead-letter + idempotency key | a forced adapter failure retries 3Ã— then dead-letters, no duplicate publish | â€” |
| M0.6 | Connector contract hardening | `validateCredentials`, capability flags, media upload, per-platform error mapping | unit tests per adapter | â€” |

### P1 â€” Manage everything

| # | Milestone | Deliverable | Exit test |
|---|---|---|---|
| M1.1 | X + Facebook Page connectors | OAuth adapters, real posts | publish visible on each network |
| M1.2 | Instagram + YouTube connectors | container/upload flows (media required) | publish visible on each network |
| M1.3 | TikTok connector | video publish (SELF_ONLY until audit) | publish visible in TikTok app |
| M1.4 | Unified calendar + queue | drag-to-reschedule, timezone correctness | scheduled post fires at the right local time |
| M1.5 | Unified inbox | comments/mentions/messages aggregation | one inbox shows â‰¥2 networks |
| M1.6 | Token lifecycle | refresh, expiry alerts, re-connect prompts | expired token triggers refresh, not a failed publish |

### P2 â€” Intelligence

Brand Brain â†’ AI Studio (multi-variant), Traction Score (Â§41), Campaign Readiness (Â§42),
Growth Brief (Â§40), Trend/Competitor agents, Network Discovery + Global Social Map (Â§6â€“7),
translation/localization with Cultural Intelligence review (Â§11â€“12).

### P3â€“P5 â€” as specced

Network beta (Â§14â€“29: interest graph, goal feed, feed modes, XP/levels/badges, communities,
matchmaking), economy (Â§30â€“34), then the global layer (Â§36â€“38, Â§57â€“58): cross-network
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

1. **M0.2** â€” move the E2E publish script into the repo, runnable headless against the mock adapter.
2. **M0.3** â€” LinkedIn app created â†’ connector exercised end-to-end â†’ post on profile.
3. **M0.4** â€” Vercel deploy with real env vars, cron verified in the cloud.
4. **M0.5** â€” job queue retry/backoff + idempotency so a transient API failure can never double-post.
5. **M0.6** â€” adapter unit tests + capability flags so P1 connectors land on a tested contract.

---

## 6. How this roadmap is maintained

Update the status table in Â§1 and the milestone row whenever a milestone closes â€” with the
command and its output that proved it. Vision language belongs in `VISION-2.0.md`; scope
arguments belong in `PRD.md`; **this file only records what is built, what is next, and what
blocks it.**
