# SocialOrc E2E publish harness (M0.2)

Proves the whole approval-gated publish chain works, headless, against the **mock adapter only**.

```bash
npm run test:e2e          # fresh throwaway DB + own dev server on :3123 → exit 0 on pass
E2E_PORT=3200 npm run test:e2e
```

No credentials, no network side effects: the runner creates its own SQLite DB under
`tests/e2e/.tmp/` (gitignored, discarded on the next run), its own `NEXTAUTH_SECRET`,
`TOKEN_ENCRYPTION_KEY` and `CRON_SECRET`, and boots the app with
`MOCK_SOCIAL_ADAPTERS="true"` — the mock adapter signs every publish as
`mock_post_<PLATFORM>_<ts>`, which the harness asserts.

## What it asserts (18 checks)

| # | Check |
|---|---|
| 1–4 | register → csrf → credentials login → session identifies the user |
| 5–6 | connect hands back a mock OAuth url; a `mock_*` account is connected |
| 7 | draft post created as `DRAFT` |
| 8 | **the approval gate**: scheduling a `DRAFT` returns `400 "Post must be approved…"` |
| 9–10 | post approves, then schedules |
| 11–12 | cron rejects a missing and a wrong bearer token with `401` |
| 13 | cron before the due time publishes nothing (`processed 0`) |
| 14 | cron after the due time publishes exactly once (`processed 1, published 1, failed 0`) |
| 15–17 | post is `PUBLISHED`, `platformPostId` is a `mock_post_*`, `publishedAt` is set |
| 18 | a second cron run does not double-post |

Check 8 is the gate assertion: it is never skipped, never expected to pass, and any change
that makes the gate disappear fails this suite (see `docs/AGENT-BRIEF.md` §1).

## Constraints

- **One `next dev` per checkout.** Next 16 refuses to start a second dev server for the same
  directory, and this harness starts its own. Stop any running dev server first; the runner
  detects the condition and prints the exact `taskkill`/`kill` command with the blocking PID.
- `NODE_OPTIONS=--dns-result-order=ipv4first` is set for the harness server, because this
  network's broken IPv6 route makes server-side `fetch` stall without it.
- Already-running server? Point the chain at it instead of booting one:
  `E2E_BASE_URL=http://localhost:3000 E2E_CRON_SECRET=<value> node tests/e2e/run.mjs`
  (that server must itself run with `MOCK_SOCIAL_ADAPTERS="true"` and its DB is what gets
  written — use only for local smoke checks, never as the CI gate).

## Files

- `run.mjs` — DB prep, server boot, readiness wait, teardown, exit code.
- `publish.e2e.mjs` — the HTTP chain and every assertion (exports `runPublishE2E`).
