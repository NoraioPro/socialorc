import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";

// Import cascade functions
import {
  cascadeContent,
  extractHashtags,
  validateCascadeSource,
  getAvailableCascadeTargets,
} from "../../src/lib/cascade";

const allPlatforms = Object.values(Platform) as Platform[];

test("extractHashtags returns empty array for content without hashtags", () => {
  const result = extractHashtags("This is plain text without hashtags");
  assert.deepEqual(result, []);
});

test("extractHashtags extracts multiple hashtags", () => {
  const result = extractHashtags("Check out #SocialMedia and #Marketing tips #growth");
  assert.deepEqual(result, ["SocialMedia", "Marketing", "growth"]);
});

test("extractHashtags handles hashtags at end of content", () => {
  const result = extractHashtags("Great content!\n\n#one #two #three");
  assert.deepEqual(result, ["one", "two", "three"]);
});

test("validateCascadeSource rejects empty content", () => {
  const result = validateCascadeSource("", Platform.LINKEDIN);
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("empty"));
});

test("validateCascadeSource rejects very short content", () => {
  const result = validateCascadeSource("Hi", Platform.LINKEDIN);
  assert.equal(result.valid, false);
  assert.ok(result.reason?.includes("short"));
});

test("validateCascadeSource accepts valid content", () => {
  const result = validateCascadeSource(
    "This is a great post about social media marketing strategies.",
    Platform.LINKEDIN
  );
  assert.equal(result.valid, true);
  assert.equal(result.reason, undefined);
});

test("getAvailableCascadeTargets excludes source platform", () => {
  const targets = getAvailableCascadeTargets(Platform.LINKEDIN);
  const targetPlatforms = targets.map((t) => t.id);

  assert.ok(!targetPlatforms.includes(Platform.LINKEDIN));
  assert.equal(targetPlatforms.length, allPlatforms.length - 1);
});

test("getAvailableCascadeTargets returns valid PlatformConfig objects", () => {
  const targets = getAvailableCascadeTargets(Platform.TWITTER);

  for (const target of targets) {
    assert.ok(target.id in Platform, `${target.id} is a valid Platform`);
    assert.ok(target.name.length > 0, "target has a name");
    assert.ok(target.maxTextLength > 0, "target has maxTextLength");
    assert.ok(target.capabilities, "target has capabilities");
  }
});

test("cascadeContent with forceMock=true uses mock adaptations", async () => {
  const result = await cascadeContent(
    {
      content: "Check out our new product launch! It's going to revolutionize the industry.",
      platform: Platform.LINKEDIN,
      hashtags: ["launch", "innovation"],
    },
    [Platform.TWITTER, Platform.INSTAGRAM],
    true // forceMock
  );

  assert.equal(result.usedMock, true);
  assert.equal(result.adaptations.length, 2);
  assert.equal(result.source.platform, Platform.LINKEDIN);

  const twitterAdapt = result.adaptations.find((a) => a.platform === Platform.TWITTER);
  assert.ok(twitterAdapt, "has Twitter adaptation");
  assert.ok(twitterAdapt.characterCount <= 280, "Twitter adaptation within limit");

  const instaAdapt = result.adaptations.find((a) => a.platform === Platform.INSTAGRAM);
  assert.ok(instaAdapt, "has Instagram adaptation");
});

test("cascadeContent filters out source platform from targets", async () => {
  const result = await cascadeContent(
    {
      content: "Testing cascade functionality with mock mode enabled.",
      platform: Platform.FACEBOOK,
      hashtags: [],
    },
    [Platform.FACEBOOK, Platform.TWITTER, Platform.TELEGRAM], // includes source
    true
  );

  assert.equal(result.adaptations.length, 2);
  const adaptedPlatforms = result.adaptations.map((a) => a.platform);
  assert.ok(!adaptedPlatforms.includes(Platform.FACEBOOK));
  assert.ok(adaptedPlatforms.includes(Platform.TWITTER));
  assert.ok(adaptedPlatforms.includes(Platform.TELEGRAM));
});

test("mock adaptation for Twitter truncates long content", async () => {
  const longContent = "A".repeat(300) + " with some hashtags";
  const result = await cascadeContent(
    {
      content: longContent,
      platform: Platform.LINKEDIN,
      hashtags: ["test"],
    },
    [Platform.TWITTER],
    true
  );

  const twitterAdapt = result.adaptations[0];
  assert.equal(twitterAdapt.platform, Platform.TWITTER);
  assert.ok(twitterAdapt.characterCount <= 280, `Twitter char count ${twitterAdapt.characterCount} should be <= 280`);
  assert.ok(twitterAdapt.adaptationNotes.some((n) => n.toLowerCase().includes("truncat")));
});

test("mock adaptation for Instagram adds engagement CTA", async () => {
  const result = await cascadeContent(
    {
      content: "Just sharing some thoughts about content creation",
      platform: Platform.LINKEDIN,
      hashtags: [],
    },
    [Platform.INSTAGRAM],
    true
  );

  const instaAdapt = result.adaptations[0];
  assert.ok(
    instaAdapt.content.includes("?") || instaAdapt.content.toLowerCase().includes("think"),
    "Instagram adaptation should have engagement element"
  );
});

test("mock adaptation preserves hashtags with platform-specific limits", async () => {
  const manyHashtags = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
  const result = await cascadeContent(
    {
      content: "Testing hashtag handling",
      platform: Platform.LINKEDIN,
      hashtags: manyHashtags,
    },
    [Platform.TWITTER, Platform.INSTAGRAM],
    true
  );

  const twitterAdapt = result.adaptations.find((a) => a.platform === Platform.TWITTER);
  const instaAdapt = result.adaptations.find((a) => a.platform === Platform.INSTAGRAM);

  assert.ok(twitterAdapt!.hashtags.length <= 2, "Twitter should limit to 2 hashtags");
  assert.ok(instaAdapt!.hashtags.length >= 5, "Instagram should have more hashtags");
});

test("cascadeContent handles all platforms", async () => {
  const result = await cascadeContent(
    {
      content: "Universal content that should work on any platform.",
      platform: Platform.LINKEDIN,
      hashtags: ["universal"],
    },
    allPlatforms.filter((p) => p !== Platform.LINKEDIN),
    true
  );

  assert.equal(result.adaptations.length, allPlatforms.length - 1);

  for (const adaptation of result.adaptations) {
    assert.ok(adaptation.content.length > 0, `${adaptation.platform} has content`);
    assert.ok(adaptation.characterCount > 0, `${adaptation.platform} has char count`);
    assert.equal(
      typeof adaptation.withinLimit,
      "boolean",
      `${adaptation.platform} has withinLimit boolean`
    );
    assert.ok(
      Array.isArray(adaptation.adaptationNotes),
      `${adaptation.platform} has adaptation notes`
    );
  }
});

test("each adaptation includes platform-specific notes", async () => {
  const result = await cascadeContent(
    {
      content: "Testing platform-specific adaptations",
      platform: Platform.LINKEDIN,
      hashtags: [],
    },
    [Platform.TELEGRAM, Platform.YOUTUBE, Platform.TIKTOK],
    true
  );

  for (const adaptation of result.adaptations) {
    assert.ok(
      adaptation.adaptationNotes.length > 0,
      `${adaptation.platform} should have adaptation notes`
    );
  }
});

test("validateCascadeSource validates all platforms", () => {
  const validContent = "This is a sufficiently long piece of content for testing.";

  for (const platform of allPlatforms) {
    const result = validateCascadeSource(validContent, platform);
    assert.equal(result.valid, true, `Should accept valid content for ${platform}`);
  }
});
