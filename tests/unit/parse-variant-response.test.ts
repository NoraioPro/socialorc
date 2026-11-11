import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVariantResponse } from "@/lib/ai";

test("accepts the variants object", () => {
  const out = parseVariantResponse(JSON.stringify({ variants: [{ platform: "TWITTER", content: "Hi", hashtags: ["a"] }] }));
  assert.equal(out.length, 1);
  assert.equal(out[0].content, "Hi\n\n#a");
});

test("accepts a bare array with no hashtags field", () => {
  const out = parseVariantResponse(JSON.stringify([{ platform: "TWITTER", content: "Hi" }]));
  assert.equal(out.length, 1);
  assert.equal(out[0].hashtags.length, 0);
});

test("accepts a markdown-fenced reply and other key names", () => {
  const raw = "```json\n" + JSON.stringify({ results: [{ platform: "LINKEDIN", content: "Yo", hashtags: [] }] }) + "\n```";
  assert.equal(parseVariantResponse(raw).length, 1);
});

test("returns an empty list when nothing usable", () => {
  assert.deepEqual(parseVariantResponse(JSON.stringify({ message: "ok" })), []);
});
