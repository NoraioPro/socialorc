# Agent Brief — how to build SocialOrc without breaking it

> Applies to **every** agent working this repo: Grok Bot fleet (Website Dev, iOS Mobile Dev,
> Orchestrator, …), Cursor cloud agents, and Hermes. Read once before your first PR.

---

## 0. Working alongside other agents (hard rules)

Several agents work this repo at the same time. Respect the lanes or work gets lost:

1. **One git worktree per agent.** Never share a working copy:
   `git worktree add ../socialorc-<task> -b <agent>/<task>`. Two agents in one checkout
   means stashed work, branch ping-pong and duplicated milestones — all of which happened.
2. **One branch per agent.** Before committing, run `git branch --show-current`. If the
   branch is not yours, stop — do not commit there.
3. **Check the roadmap's Owner column before starting.** If a milestone already has an owner,
   do not build it in parallel; pick the next unowned one or ask.
4. **Never leave uncommitted work in a checkout you are about to switch away from**, and if
   you must stash someone else's, say where you put it.
5. **`npm run typecheck` before claiming PASS.** A green suite on a tree that does not compile
   is not done — that is how M0.2 was briefly reported as finished on a base failing `tsc`.

---

## 1. The three non-negotiables

1. **The approval gate is sacred.** `DRAFT → SCHEDULED` is blocked in code. Only `APPROVED`
   content can be scheduled; only scheduled content is published. If a task "needs" the gate
   weakened, the task is wrong — stop and say so.
2. **Never commit or paste a secret.** No `.env`, no tokens, no client secrets, no
   `CRON_SECRET`, in commits, PR bodies, screenshots, or chat. Credentials live in `.env`
   (gitignored) or the deployment's env vars.
3. **Real side effects only when asked.** Publishing to a live account, sending a DM, opening
   an external PR — those are user decisions. Test against mock adapters by default.

---

## 2. Definition of Done

A task is done when, and only when, all five hold:

- [ ] **Code** is on a branch named `<agent>/<task>` (e.g. `website-dev/linkedin-connector`).
- [ ] **It runs** — the exact command and its real output are pasted into the PR description.
      "Should work" is not evidence; a status code, a returned id, or a test summary is.
- [ ] **The gate still holds** — a run showing `POST /schedule` on an unapproved post returns
      `400` accompanies any change touching post status, scheduling, or publishing.
- [ ] **`npx tsc --noEmit` and `npm run lint` are clean** (or the remaining errors are listed
      with a reason).
- [ ] **The roadmap row is updated** — `docs/ROADMAP-2.0.md` §1/§3 with the evidence line.

Report format, kept short:

```
Milestone: M0.3
Branch:    website-dev/linkedin-connector
Command:   <what you ran>
Output:    <the actual result — status codes / ids / test summary>
Blocked:   <what you need, or "nothing">
```

---

## 3. Architecture rules

- **Connectors are adapters, not special cases.** Implement `PlatformAdapter`
  (`src/types/platform.ts`), register it in `src/lib/adapters/index.ts`, add the enum value in
  `prisma/schema.prisma` **and** the entry in `PLATFORM_CONFIGS` (TypeScript enforces
  `Record<Platform, PlatformConfig>`; omit one and the build breaks).
- **Two credential shapes must both work:** OAuth-redirect (LinkedIn, X, Meta, YouTube) and
  token-based (Telegram today; Discord/WhatsApp/Slack later). Telegram
  (`src/lib/adapters/telegram.ts` + `src/app/api/social/telegram/connect/route.ts`) is the
  reference for the second shape.
- **Never hard-code a platform list into UI or logic.** The Connector Framework and, later, the
  Connector Marketplace depend on the registry staying the single source of truth.
- **Publishing must be idempotent.** A retried job must never double-post; carry a
  platform-side idempotency key or a stored `platformPostId` check before re-sending.
- **Errors are data.** Store the adapter's failure reason on the post and the job. Silent
  failures are how an approval-gated scheduler loses trust.

---

## 4. Local environment traps (learned the hard way)

- Run the dev server as `npx next dev`, not `npm run dev`: killing the npm wrapper leaves the
  real child alive on port 3000, and the next start silently moves to :3001 so you test stale
  code.
- On hosts with a broken IPv6 route, server-side `fetch` to IPv4-only APIs stalls ~10s and
  fails with `fetch failed` even though plain `node -e fetch` and `curl` succeed. Start the
  server with `NODE_OPTIONS=--dns-result-order=ipv4first`.
- Prisma 7 reads `DATABASE_URL` from the environment; the repo's `prisma7.config.ts` is not
  auto-loaded (non-standard filename), so export env vars explicitly.
- SQLite emulates enums as `TEXT`, so adding a platform value needs only `prisma generate` —
  no `db push` and no migration.
- `MOCK_SOCIAL_ADAPTERS="true"` overrides **every** platform with the mock adapter. If you are
  validating a real connector, that flag must be `false` or you will "succeed" against a fake.

---

## 5. Working with the technical lead

- Bring **blocked** items immediately: OAuth app creation, consent screens, app-review
  submissions, deployment logins. These are owner actions; agents must not fake their way past
  them.
- Bring **decisions**, not open questions: state the options, the trade-off, and your
  recommendation.
- Do not open a PR that merely restates a plan. A PR carries working code, or a doc that
  closes a gap the roadmap names.
