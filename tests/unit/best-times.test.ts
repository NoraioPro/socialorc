import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextOccurrence,
  toDatetimeLocalValue,
  formatBestTimeChipLabel,
  bestTimeToDatetimeLocal,
} from "../../src/lib/best-times";

test("past weekday rolls to next week", () => {
  // Wednesday 2026-09-09 15:00 local — Tuesday is already past this week
  const now = new Date(2026, 8, 9, 15, 0, 0, 0);
  assert.equal(now.getDay(), 3, "fixture is Wednesday");

  const next = nextOccurrence("Tuesday", 10, now);
  assert.equal(next.getDay(), 2);
  assert.equal(next.getHours(), 10);
  assert.equal(next.getMinutes(), 0);
  // Next Tuesday after Wed Sep 9 is Sep 15
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 8);
  assert.equal(next.getDate(), 15);
  assert.ok(next.getTime() > now.getTime());
});

test("future hour today stays today", () => {
  // Tuesday 2026-09-08 08:00 — 10:00 same day is still future
  const now = new Date(2026, 8, 8, 8, 0, 0, 0);
  assert.equal(now.getDay(), 2, "fixture is Tuesday");

  const next = nextOccurrence("Tuesday", 10, now);
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 8);
  assert.equal(next.getDate(), 8);
  assert.equal(next.getHours(), 10);
  assert.ok(next.getTime() > now.getTime());
});

test("same weekday hour already past jumps a week", () => {
  const now = new Date(2026, 8, 8, 11, 0, 0, 0); // Tuesday 11:00
  const next = nextOccurrence("Tuesday", 10, now);
  assert.equal(next.getDate(), 15);
  assert.equal(next.getHours(), 10);
});

test("toDatetimeLocalValue formats local wall time", () => {
  const d = new Date(2026, 8, 15, 10, 0, 0, 0);
  assert.equal(toDatetimeLocalValue(d), "2026-09-15T10:00");
});

test("formatBestTimeChipLabel matches Tue 10:00 · 95", () => {
  const now = new Date(2026, 8, 8, 8, 0, 0, 0); // Tue morning
  const label = formatBestTimeChipLabel("Tuesday", 10, 95, now);
  assert.equal(label, "Tue 10:00 · 95");
});

test("bestTimeToDatetimeLocal wires helpers", () => {
  const now = new Date(2026, 8, 9, 15, 0, 0, 0); // Wed
  assert.equal(bestTimeToDatetimeLocal("Tuesday", 10, now), "2026-09-15T10:00");
});
