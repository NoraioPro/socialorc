import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The publishing worker is the only thing that sends a scheduled post, so the
 * cron's granularity IS the schedule's accuracy: a `*\/5` cron means a post set
 * for 23:36 is sent at 23:40 — the "I picked a time and it went out four
 * minutes later" bug (measured in production 2026-10-31: a job due 21:36:00 was
 * claimed at 21:40:11).
 *
 * Vercel rejects a sub-daily cron on Hobby, and this project is on Pro, where a
 * per-minute cron is allowed — that is what makes sub-minute-late publishing
 * possible. If this test fails, the schedule silently drifted back to 0-5
 * minutes of latency.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function cronSchedule(): { path: string; schedule: string } {
  const raw = readFileSync(path.join(repoRoot, "vercel.json"), "utf8");
  const config = JSON.parse(raw) as { crons?: { path: string; schedule: string }[] };
  assert.ok(Array.isArray(config.crons) && config.crons.length > 0, "vercel.json has no crons");
  const publish = config.crons.find((c) => c.path === "/api/cron/publish");
  assert.ok(publish, "the publishing worker is not registered as a cron");
  return publish;
}

const EVERY_MINUTE = new Set(["* * * * *", "*/1 * * * *"]);

test("the publishing worker runs every minute, so a scheduled time is honoured", () => {
  const { schedule } = cronSchedule();
  assert.ok(
    EVERY_MINUTE.has(schedule),
    `the publish cron must run every minute to keep scheduled times accurate; found "${schedule}" ` +
      `(a 5-minute tick sends a post due at :36 at :40)`
  );
});

test("no cron entry claims the same path twice", () => {
  const raw = readFileSync(path.join(repoRoot, "vercel.json"), "utf8");
  const { crons = [] } = JSON.parse(raw) as { crons?: { path: string }[] };
  const paths = crons.map((c) => c.path);
  assert.equal(new Set(paths).size, paths.length, `duplicate cron paths: ${paths.join(", ")}`);
});
