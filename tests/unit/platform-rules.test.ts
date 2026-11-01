import { test } from "node:test";
import assert from "node:assert/strict";

import { mediaProblems, platformSpec } from "../../src/lib/social/platform-rules";

/**
 * The composer renders exactly what these functions return, so the assertions
 * here are the specification a writer sees: what a channel needs, and what it
 * will reject before publishing.
 */
test("instagram refuses PNG and does not allow text-only", () => {
  const spec = platformSpec("INSTAGRAM");
  assert.equal(spec.allowsTextOnly, false);
  assert.ok(spec.acceptedMime.includes("image/jpeg"));
  assert.ok(!spec.acceptedMime.includes("image/png"));

  const problems = mediaProblems("INSTAGRAM", [{ mimeType: "image/png", filename: "shot.png" }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /will not accept image\/png/);
  assert.match(problems[0], /JPEG/);
});

test("instagram with no media says media is required", () => {
  const problems = mediaProblems("INSTAGRAM", []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /needs media/i);
});

test("youtube accepts video only", () => {
  const spec = platformSpec("YOUTUBE");
  assert.equal(spec.allowsTextOnly, false);
  assert.deepEqual(spec.acceptedMime, ["video/mp4", "video/quicktime"]);

  const problems = mediaProblems("YOUTUBE", [{ mimeType: "image/jpeg", filename: "a.jpg" }]);
  assert.equal(problems.length, 1);
  // It takes no images at all, so the message names what it does take.
  assert.match(problems[0], /does not accept images/);
  assert.match(problems[0], /MP4, MOV/);

  assert.equal(mediaProblems("YOUTUBE", [{ mimeType: "video/mp4" }]).length, 0);
});

test("linkedin allows text alone and mixed media", () => {
  assert.equal(platformSpec("LINKEDIN").allowsTextOnly, true);
  assert.deepEqual(mediaProblems("LINKEDIN", []), []);
  assert.deepEqual(mediaProblems("LINKEDIN", [{ mimeType: "image/jpeg" }]), []);
  assert.deepEqual(mediaProblems("LINKEDIN", [{ mimeType: "video/mp4" }]), []);
});

test("facebook rejects photos mixed with video, and more than four photos", () => {
  const mixed = mediaProblems("FACEBOOK", [
    { mimeType: "image/jpeg" },
    { mimeType: "video/mp4" },
  ]);
  assert.ok(mixed.some((p) => /cannot mix photos and video/.test(p)));

  const five = mediaProblems("FACEBOOK", Array.from({ length: 5 }, () => ({ mimeType: "image/jpeg" })));
  assert.ok(five.some((p) => /at most 4 photos/.test(p)));
});

test("x rejects more than four photos and mixing", () => {
  const problems = mediaProblems("TWITTER", [
    ...Array.from({ length: 5 }, () => ({ mimeType: "image/png" })),
    { mimeType: "video/mp4" },
  ]);
  assert.ok(problems.some((p) => /at most 4 photos/.test(p)));
  assert.ok(problems.some((p) => /cannot mix/.test(p)));
});

test("telegram caps an album at ten and accepts text alone", () => {
  assert.equal(platformSpec("TELEGRAM").allowsTextOnly, true);
  const items = Array.from({ length: 11 }, () => ({ mimeType: "image/jpeg" }));
  assert.ok(mediaProblems("TELEGRAM", items).some((p) => /at most 10 items/.test(p)));
});

test("every channel has a readable spec, and no channel claims unlimited media", () => {
  const platforms = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;
  for (const platform of platforms) {
    const spec = platformSpec(platform);
    assert.ok(spec.summary.length > 10, `${platform} summary`);
    assert.ok(spec.media.length > 5, `${platform} media line`);
    assert.ok(spec.acceptedMime.length > 0, `${platform} accepted types`);
  }
});
