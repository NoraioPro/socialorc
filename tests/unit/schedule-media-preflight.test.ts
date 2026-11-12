import test from "node:test";
import assert from "node:assert/strict";
import { blockingMediaProblems } from "../../src/lib/social/platform-rules";

test("Instagram refuses PNG and text-only, accepts JPEG", () => {
  assert.ok(blockingMediaProblems("INSTAGRAM", [{ mimeType: "image/png" }]).length > 0);
  assert.ok(blockingMediaProblems("INSTAGRAM", []).length > 0);
  assert.equal(blockingMediaProblems("INSTAGRAM", [{ mimeType: "image/jpeg" }]).length, 0);
});

test("TikTok and YouTube need a video; a photo is blocked", () => {
  assert.ok(blockingMediaProblems("TIKTOK", [{ mimeType: "image/jpeg" }]).length > 0);
  assert.ok(blockingMediaProblems("YOUTUBE", [{ mimeType: "image/png" }]).length > 0);
  assert.equal(blockingMediaProblems("TIKTOK", [{ mimeType: "video/mp4" }]).length, 0);
  assert.equal(blockingMediaProblems("YOUTUBE", [{ mimeType: "video/mp4" }]).length, 0);
});

test("text channels schedule without media; extra attachments are advice, not a block", () => {
  for (const p of ["LINKEDIN", "TWITTER", "FACEBOOK", "TELEGRAM"] as const) {
    assert.equal(blockingMediaProblems(p, []).length, 0, p);
  }
  assert.equal(blockingMediaProblems("INSTAGRAM", [{ mimeType: "image/jpeg" }, { mimeType: "image/jpeg" }]).length, 0);
});

test("single-item connectors block a second attachment instead of failing at publish", () => {
  const two = [{ mimeType: "image/jpeg" }, { mimeType: "image/jpeg" }];
  for (const p of ["LINKEDIN", "FACEBOOK", "TELEGRAM"] as const) {
    const problems = blockingMediaProblems(p, two);
    assert.ok(problems.some((x) => x.includes("one image or video per post")), `${p}: ${problems.join(" | ")}`);
    assert.equal(blockingMediaProblems(p, [{ mimeType: "image/jpeg" }]).length, 0, p);
  }
  // X sends up to four, Instagram a carousel.
  assert.equal(blockingMediaProblems("TWITTER", two).length, 0);
  assert.equal(blockingMediaProblems("INSTAGRAM", two).length, 0);
  assert.ok(blockingMediaProblems("TWITTER", Array(5).fill({ mimeType: "image/jpeg" })).length > 0);
});
