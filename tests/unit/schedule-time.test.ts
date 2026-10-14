import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INVALID_DATE_MESSAGE,
  parseInstant,
  parseScheduleInput,
  scheduleInputMessage,
} from "../../src/lib/posts/schedule-time";

/**
 * The timezone bug this fixes was invisible in a UTC test environment and wrong
 * for every user east or west of it: the input's wall-clock string was sent
 * raw, so the server resolved it in its own zone. The assertions below pin the
 * conversion to an instant, which is the only form that survives the trip.
 */

const NOW = new Date("2026-10-13T09:00:00.000Z");

test("a local wall-clock time becomes an instant with an offset", () => {
  // 14:30 on 2026-10-13 as read by a browser. Whatever zone the test runs in,
  // the result must be a real instant and must round-trip to the same wall clock.
  const result = parseScheduleInput("2026-10-13T14:30", NOW);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  const roundTrip = new Date(result.iso);
  assert.equal(roundTrip.getTime(), result.at.getTime());
  assert.equal(roundTrip.getHours(), 14);
  assert.equal(roundTrip.getMinutes(), 30);
  assert.match(result.iso, /Z$/, "the wire format must carry the zone");
});

test("an empty value is a message about picking one, not a crash", () => {
  const result = parseScheduleInput("", NOW);
  assert.deepEqual(result, { ok: false, reason: "empty" });
  assert.match(scheduleInputMessage("empty"), /pick a date/i);
});

test("an unreadable value is refused", () => {
  assert.deepEqual(parseScheduleInput("tomorrow", NOW), { ok: false, reason: "invalid" });
  assert.match(scheduleInputMessage("invalid"), /not readable/i);
});

test("a past time is refused, and the boundary is not a schedule", () => {
  assert.deepEqual(parseScheduleInput("2026-10-13T08:59", NOW), { ok: false, reason: "past" });
  assert.equal(parseScheduleInput("2026-10-13T09:00:00.000Z", NOW).ok, false);
  assert.match(scheduleInputMessage("past"), /future/i);
});

test("the control sends the iso instant, never the raw input value", () => {
  const source = readFileSync("src/components/posts/schedule-control.tsx", "utf8");
  assert.match(source, /parseScheduleInput\(/);
  assert.match(source, /scheduledFor: resolved\.iso/);
  assert.doesNotMatch(
    source,
    /JSON\.stringify\(\{ scheduledFor \}\)/,
    "the raw datetime-local value must not be what the server receives"
  );
});

test("parseInstant: a real timestamp parses, garbage is null (not an Invalid Date)", () => {
  assert.equal(parseInstant("2026-10-13T11:30:00.000Z")?.toISOString(), "2026-10-13T11:30:00.000Z");
  assert.equal(parseInstant("not a date"), null);
  assert.equal(parseInstant(""), null);
  assert.match(INVALID_DATE_MESSAGE, /invalid date/i);
});

test("bad dates and bodies are 400s in the post routes, never 500s", () => {
  const schedule = readFileSync("src/app/api/posts/[id]/schedule/route.ts", "utf8");
  assert.match(schedule, /req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(schedule, /parseInstant\(validation\.data\.scheduledFor\)/);
  assert.match(
    schedule,
    /if \(!scheduledFor\) \{\s*return NextResponse\.json\(\{ error: INVALID_DATE_MESSAGE \}, \{ status: 400 \}\)/
  );

  const patch = readFileSync("src/app/api/posts/[id]/route.ts", "utf8");
  assert.match(patch, /req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(patch, /parseInstant\(scheduledFor\)/);
  assert.doesNotMatch(patch, /new Date\(scheduledFor\)/);

  const create = readFileSync("src/app/api/posts/route.ts", "utf8");
  assert.match(create, /parseInstant\(scheduledFor\)/);
  assert.doesNotMatch(create, /new Date\(scheduledFor\)/);
});
