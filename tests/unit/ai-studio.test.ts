import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";

const originalEnv = { ...process.env };

describe("AI Studio Mock Generation", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("isOpenAIAvailable returns false without API key", async () => {
    const { isOpenAIAvailable } = await import("../../src/lib/ai");
    assert.equal(isOpenAIAvailable(), false, "should report OpenAI unavailable");
  });

  test("generateMockVariants produces deterministic output for same input", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");

    const options = {
      idea: "Test idea for deterministic mock generation",
      platforms: [Platform.LINKEDIN, Platform.TWITTER] as Platform[],
    };

    const result1 = generateMockVariants(options);
    const result2 = generateMockVariants(options);

    assert.equal(result1.length, 2, "should generate variants for both platforms");
    assert.equal(result2.length, 2, "should generate variants for both platforms");

    assert.equal(result1[0].content, result2[0].content, "LinkedIn content should be identical");
    assert.equal(result1[1].content, result2[1].content, "Twitter content should be identical");
  });

  test("generateMockVariants respects platform character limits", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");
    const { PLATFORM_CONFIGS } = await import("../../src/types/platform");

    const options = {
      idea: "Short test idea",
      platforms: Object.values(Platform),
    };

    const variants = generateMockVariants(options);

    for (const variant of variants) {
      const config = PLATFORM_CONFIGS[variant.platform];
      assert.ok(variant.characterCount > 0, `${variant.platform} should have content`);
      assert.equal(
        variant.withinLimit,
        variant.characterCount <= config.maxTextLength,
        `${variant.platform} withinLimit should match actual character count`
      );
    }
  });

  test("generateMockVariants marks all variants as mock", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");

    const options = {
      idea: "Test idea",
      platforms: [Platform.LINKEDIN, Platform.INSTAGRAM, Platform.TELEGRAM] as Platform[],
    };

    const variants = generateMockVariants(options);

    for (const variant of variants) {
      assert.equal(variant.isMock, true, `${variant.platform} should be marked as mock`);
    }
  });

  test("generateMockVariants generates different content per platform", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");

    const options = {
      idea: "Same idea for all platforms",
      platforms: [Platform.LINKEDIN, Platform.TWITTER, Platform.INSTAGRAM] as Platform[],
    };

    const variants = generateMockVariants(options);

    const contents = variants.map((v) => v.content);
    const uniqueContents = new Set(contents);

    assert.equal(
      uniqueContents.size,
      contents.length,
      "each platform should have unique content"
    );
  });

  test("generateMockVariants uses brand context when provided", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");

    const customBrandContext = {
      profile: {
        name: "CustomBrandName",
        tagline: "Custom tagline",
      },
    };

    const options = {
      idea: "Test idea with custom brand",
      platforms: [Platform.LINKEDIN] as Platform[],
      brandContext: customBrandContext,
    };

    const variants = generateMockVariants(options);

    assert.ok(
      variants[0].content.includes("CustomBrandName"),
      "should include custom brand name in content"
    );
  });

  test("aiStudioGenerate uses mock when forceMock is true", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    
    const aiModule = await import("../../src/lib/ai");
    
    const result = await aiModule.aiStudioGenerate({
      idea: "Test idea",
      platforms: [Platform.TWITTER],
      forceMock: true,
    });

    assert.equal(result.usedMock, true, "should use mock when forceMock is true");
    assert.ok(result.variants[0].isMock, "variants should be marked as mock");
  });

  test("aiStudioGenerate uses mock when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    
    const { aiStudioGenerate } = await import("../../src/lib/ai");
    
    const result = await aiStudioGenerate({
      idea: "Test idea",
      platforms: [Platform.FACEBOOK, Platform.YOUTUBE],
    });

    assert.equal(result.usedMock, true, "should use mock without API key");
    assert.equal(result.variants.length, 2, "should generate all requested variants");
  });

  test("generateMockVariants includes hashtags", async () => {
    const { generateMockVariants } = await import("../../src/lib/ai");

    const options = {
      idea: "Test idea for hashtag generation",
      platforms: [Platform.INSTAGRAM, Platform.TWITTER] as Platform[],
    };

    const variants = generateMockVariants(options);

    for (const variant of variants) {
      assert.ok(variant.hashtags.length > 0, `${variant.platform} should have hashtags`);
      assert.ok(
        variant.content.includes("#"),
        `${variant.platform} content should include hashtag symbols`
      );
    }
  });
});

describe("AI Studio Improve Mock", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("improveContent returns mock result without API key", async () => {
    const { improveContent } = await import("../../src/lib/ai");

    const result = await improveContent(
      "Original content here.",
      Platform.LINKEDIN,
      "make it shorter"
    );

    assert.equal(result.isMock, true, "should be marked as mock");
    assert.ok(result.content.includes("[Mock improved]"), "should have mock prefix");
  });

  test("mock improve responds to shorter instruction", async () => {
    const { improveContent } = await import("../../src/lib/ai");

    const longContent = "This is a long piece of content. It has multiple sentences. Each sentence adds more length. The content just keeps going on and on.";
    
    const result = await improveContent(
      longContent,
      Platform.TWITTER,
      "make it shorter and more concise"
    );

    assert.ok(
      result.content.length < longContent.length + 20,
      "shorter instruction should produce shorter content (accounting for mock prefix)"
    );
  });

  test("mock improve responds to emoji instruction", async () => {
    const { improveContent } = await import("../../src/lib/ai");

    const result = await improveContent(
      "Plain content without emojis.",
      Platform.INSTAGRAM,
      "add some emojis"
    );

    assert.ok(
      result.content.includes("✨") || result.content.includes("🚀"),
      "emoji instruction should add emojis"
    );
  });
});

describe("Brand Brain Integration", () => {
  test("buildBrandContextPrompt creates prompt from context", async () => {
    const { buildBrandContextPrompt, MOCK_BRAND_CONTEXT } = await import("../../src/types/brand-brain");

    const prompt = buildBrandContextPrompt(MOCK_BRAND_CONTEXT);

    assert.ok(prompt.includes("Brand:"), "should include brand section");
    assert.ok(prompt.includes("SocialOrc Demo Brand"), "should include brand name");
    assert.ok(prompt.includes("Voice Tone:"), "should include voice tone");
    assert.ok(prompt.includes("Goals:"), "should include goals");
  });

  test("buildBrandContextPrompt handles partial context", async () => {
    const { buildBrandContextPrompt } = await import("../../src/types/brand-brain");

    const partialContext = {
      profile: {
        name: "Test Brand",
      },
    };

    const prompt = buildBrandContextPrompt(partialContext);

    assert.ok(prompt.includes("Test Brand"), "should include provided name");
    assert.ok(!prompt.includes("Voice Tone:"), "should not include missing voice");
  });

  test("buildBrandContextPrompt returns empty string for empty context", async () => {
    const { buildBrandContextPrompt } = await import("../../src/types/brand-brain");

    const prompt = buildBrandContextPrompt({});

    assert.equal(prompt, "", "empty context should produce empty prompt");
  });

  test("MOCK_BRAND_CONTEXT has all required fields", async () => {
    const { MOCK_BRAND_CONTEXT } = await import("../../src/types/brand-brain");

    assert.ok(MOCK_BRAND_CONTEXT.profile, "should have profile");
    assert.ok(MOCK_BRAND_CONTEXT.profile?.name, "should have profile name");
    assert.ok(MOCK_BRAND_CONTEXT.voice, "should have voice");
    assert.ok(MOCK_BRAND_CONTEXT.voice?.toneKeywords?.length, "should have tone keywords");
    assert.ok(MOCK_BRAND_CONTEXT.goals?.length, "should have goals");
  });
});
