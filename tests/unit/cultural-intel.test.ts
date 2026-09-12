import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeText } from "../../src/lib/cultural-intel/rules";

test("returns empty for blank", () => {
  assert.equal(analyzeText("").length, 0);
});

test("flags all-caps shouting", () => {
  const w = analyzeText("THIS IS A VERY LOUD ANNOUNCEMENT");
  assert.ok(w.some((x) => x.ruleId === "all-caps"));
});

test("flags informal slang", () => {
  const w = analyzeText("shipping this lol tomorrow");
  assert.ok(w.some((x) => x.ruleId === "informal-slang"));
});

test("flags holiday-sensitive copy as block-advisory", () => {
  const w = analyzeText("Merry Christmas to our customers");
  assert.ok(w.some((x) => x.ruleId === "holiday-sensitive" && x.severity === "block-advisory"));
});

test("warns when non-ascii without locale", () => {
  const w = analyzeText("café special");
  assert.ok(w.some((x) => x.ruleId === "locale-missing"));
});

test("skips missing-locale when locale provided", () => {
  const w = analyzeText("café special", "fr-FR");
  assert.ok(!w.some((x) => x.ruleId === "locale-missing"));
});
