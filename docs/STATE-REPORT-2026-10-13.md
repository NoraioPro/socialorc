# SocialOrc — state report for review, 2026-10-13

Written for review, not for the log. Every number below was measured on this machine or on the live
deployment at the time of writing; nothing here is estimated. Where something is still broken or
unverified it says so in the same paragraph as the good news.

---

## 1. Where the app is right now

| | |
|---|---|
| `main` and production | **`76a405f`**, Vercel deployment Ready, `/api/health` → `{"status":"ok"}` |
| Local == remote | nothing unpushed, nothing uncommitted (one untracked scratch script, `scripts/audit-platforms.ts`, not from this work) |
| API routes | **48** (was 44) |
| Pages | 21 |
| Unit tests | **658 passing, 0 failing** across 58 files |
| e2e (real HTTP, real database) | **publish 22/22 · engagement 15/15 · roles 37/37** — all exit 0 |
| Type check / build | `tsc --noEmit` 0 errors · `next build` exit 0 |
| Migrations | sqlite **13**, postgres **6** — both **verified in sync** with the schema |
| Commits today | 20 (`cc36f32` → `76a405f`) |

Two databases matter here and both were proven, not assumed: the sqlite history now matches its
schema, and `prisma migrate diff` against the **live production database** prints
`-- This is an empty migration`, which is the only honest way to say "production's schema is what the
migrations say it is".

---

## 2. What changed today, and how each one was proven

Everything below is on `main`, deployed, and covered by the tests named in the last column.

### The publishing gate — the highest-risk area

The gate had **two** doors and both were open. `POST /publish` never checked approval, and the queue
had no concept of "wait for human approval".

| commit | what was wrong | what it does now | proof |
|---|---|---|---|
| `cc36f32` | immediate publish accepted a DRAFT | refuses anything not approved, with a reason the UI can show | publish e2e: DRAFT publish → 400 |
| `42af4d2` | accounts flagged for reconnect were invisible | settings shows a reconnect banner with the reason | unit + rendered |
| `4acaeb2` | a crash mid-publish left posts stuck in `PUBLISHING` forever, unreachable by any retry | lease recovery releases them | unit + e2e |

### The race that could publish unapproved content (`3d7e777`)

Every status change was **check-then-act**: read the post, decide it is APPROVED, then
`update({ where: { id } })`. An edit landing in between returns the post to DRAFT and clears
`approvedAt` — and the write put it back to `SCHEDULED` anyway. The worker only looks at the status,
so it published content nobody had approved.

Now every transition is a guarded `updateMany` that restates the state it decided about, and
`count === 0` becomes a **409 "this post changed, reload"** instead of a silent overwrite. Same for
the worker's `PUBLISHING` claim. `approvedAt` is part of every approval-dependent guard, because the
status alone is not proof.

*Proof:* the publish suite asserts the exact interleaving (edit an approved post → schedule → 400),
and the old `schedule-gate.test.ts`, which was a tautology that tested a copy of its own logic, now
tests the real guards and fails if any route goes back to an unguarded `update`.

### The worker (`c3014c6`, `d1d300a`, `a4648f1`)

- **Immediate publish to Telegram could never work**: the queue passed the account's destination
  (chat id) and this route did not, so the adapter refused every send with `MISSING_CHAT`.
- **The reconnect banner could not fire for the case it exists for**: the expired-token path called
  its failure handler without the account id, and the flag is only set when the account is named.
- **A function that died mid-send got its job re-queued**, which re-arms the exact duplicate the
  first attempt might have caused. A crash after the platform accepts a post is indistinguishable
  from a crash before it, so the job and post now fail with an explicit *outcome unknown — check the
  platform* note, and the deliberate Retry button re-queues it.
- Both publish routes declare a function time ceiling and the worker stops claiming work it cannot
  finish. (60s, because the current Vercel plan allows no more; a Pro plan can raise it in one line.)

### Security (`78747de`, `a4648f1`, `54cb05e`)

- **The OAuth state cookie was plain JSON.** Any client could mint one with somebody else's user id
  and finish a connect it never started. It is now signed (`hmac.base64url`, verified with
  `timingSafeEqual`) and an unsigned or edited value is simply not a cookie.
- **Telegram's connect endpoint is a GET a victim can be made to open**, and it accepted a chat id
  from the query — enough to point another tenant's account at the attacker's chat. A chat id from
  the query now requires a verified state cookie belonging to *that* session.
- **Fourteen write paths were session-only**: media upload/delete, brains, the brand brain, feed
  comments and reactions, and inbox replies — the one place a reply is actually sent to a real
  platform. They now check a permission, the five permissions that were missing entirely are in the
  matrix with least-privilege assignments, and a test walks the API tree so a **new** unprotected
  mutating route fails the build.
- **`/api/health` described the deployment to anyone**: migration count, queued job count, and the
  names of the environment variables each connector was missing. Anonymous callers now get four
  fields (status, commit, environment, timestamp); the rest needs the cron token.

### Reaching the product (`1b5ccda`, `22f792a`)

- **`ScheduleControl` existed and nothing imported it.** The approve → schedule pipeline — the one
  the worker actually runs on — was unreachable from the UI; those three pages could only be filled
  by calling the API by hand. It is now on the post card, rendering nothing unless the post is
  approved and still carries its approval stamp.
- **A timezone bug**: the control sent a raw `datetime-local` wall clock, so the server resolved it
  in *its* zone (UTC on Vercel) — a 14:30 Cairo schedule went out at 17:30. The browser now resolves
  the instant and sends the ISO string.
- **The marketing page opened with invented numbers** — "LIVE COMMAND CENTER" over hard-coded
  figures and a statistic about the reader's own LinkedIn audience — presented as measurements. The
  panel is now labelled sample data and the fabricated claims are gone.

### Team roles (`3a4639c`) — a gap the tests found

Rewriting the role harness surfaced that **only ADMIN and EDITOR could ever exist**: signup produced
the first account as ADMIN and everyone after as EDITOR, and nothing anywhere could assign anything
else. MANAGER and CLIENT were in the permission matrix and in no database — two of four roles with
checks nobody could exercise.

Now: an ADMIN invites an address **with a role**; the token is shown once, stored hashed, matched in
constant time, admits only the address it names, once, for a week, and overrides the otherwise
invite-only signup policy. Roles can be changed, with two refusals that matter — nobody changes their
own role, and the last ADMIN cannot be demoted. Migration generated for both providers and verified
applied to production.

### The harness itself (`eb5c6b7`, `8636e26`)

- It built its throwaway database with `db push`, which syncs the schema instead of applying the
  migrations — and it was **hiding real drift**: the sqlite history was missing the profile columns
  and the feed tables, so things "proven" locally were proven against a database the migrations
  cannot produce. Fixed, and the branch now uses `migrate deploy`.
- Two stale assumptions (invite-only signup, least-privilege roles) made every check fail on 403/401
  and looked like a broken app.
- `roles.e2e` drove a dev-only role-minting endpoint that no longer exists — and must not. It is
  rewritten against the real signup policy, and it asserts that endpoint stays **404**.
- **The harness runs locally with no Postgres at all.** Earlier notes in this project claimed e2e was
  blocked without it; that was wrong.

---

## 3. What is still not done

Ordered by what I would fix first. Nothing here is hidden behind "phase 2" language — these are the
gaps as they stand.

**Code, mine to do, needs your go-ahead:**

1. **No rate limiting anywhere** (login, upload, AI generation). Needs one decision from you: a
   table-backed limiter in the app, or the platform's edge limiter.
2. **The brand brain is write-only.** All 14 fields are saved and nothing reads them; the generation
   path falls back to a hard-coded demo brand (`ai.ts:265`), and a real model call receives *that*
   brand when no context exists.
3. **`forceMock` is honoured unconditionally**, so a production caller can save mock text.
4. **`/api/workspaces` does not exist** and the settings AI page calls it, so that tab is dead.
5. **No Team UI**: the invitation and role API is complete and tested, the settings page has no
   member list or invite form.
6. **Two roles remain unexercised end to end**: CLIENT has never been through any flow (MANAGER now
   has).

**Product decisions only you can make** — the 14 in `docs/PRODUCTION-PLAN-2026-10-13.md` §5, of
which these block the most:

- **Multi-tenancy**: `workspace.ts` says of itself that it "does not filter anything yet", and part 2
  of that comment is now false — tenant keys are written, so rows carry a tenant while nothing reads
  it. Enforce, or delete the field and the plan with it?
- **Inbox**: the production adapters return nothing (7 × "Not implemented") while the page promises
  "all your comments, mentions and messages in one place". Mount it for real, or take it out of the
  nav?
- **The unmounted intelligence panels** (competitor, trends, localization, network, global map): they
  carry honest "mock" labels and are imported by nothing. Mount or delete.
- **Preview deployments**: every environment variable in the Vercel project is scoped to Production
  only, so no PR has ever had a working preview, and this is where the e2e suite should run in CI.

**Known-unknowns, stated plainly:** no real platform has ever been driven (every send in every test
goes through the mock adapter), so the first real publish on each of the seven connectors is still
unproven; and the durability suite has not been run against a Postgres instance.

---

## 4. How to check any of this yourself

```bash
cd ~/Desktop/Projects/WEB/socialorc

# types, units, production build
npx tsc --noEmit && npm run test:unit && npx prisma generate && npx next build

# the real thing over HTTP — boots its own server and database, no Postgres needed
export DATABASE_URL="file:/tmp/e2e.db" && npx prisma generate
node tests/e2e/run.mjs          # publish 22/22 + engagement 15/15
bash /tmp/so-roles-run.sh       # roles 37/37, needs its own server (see the skill)

# is production actually serving what main says?
curl -s https://socialorc.vercel.app/api/health      # .commit must match git rev-parse HEAD

# is production's schema what the migrations say?
export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)"   # read-only introspection
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.postgres.prisma --script
# expected: "-- This is an empty migration."
```

## 5. The documents this session produced

- `docs/PRODUCTION-PLAN-2026-10-13.md` — Claude Opus's production plan (PR0–PR8 landed; §5 is the
  decision list that is still yours)
- `docs/FEATURE-REVIEW-2026-10-13.md` — feature-by-feature status of all 22 surfaces
- `docs/AUDIT-2026-10-13.md` — the Claude Code audit of the codebase
- `docs/ROADMAP-2.0.md` §5 — the landed work, the two defects found, and what is left
