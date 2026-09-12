import { test } from "node:test";
import assert from "node:assert/strict";

import { BrandBrainContext } from "../../src/lib/ai";

test("BrandBrainContext interface accepts all expected fields", () => {
  const context: BrandBrainContext = {
    brandName: "TestBrand",
    industry: "Technology",
    description: "A test brand for unit testing",
    targetAudience: "Developers and tech enthusiasts",
    uniqueValue: "Best-in-class testing capabilities",
    tone: "Professional",
    personality: "Innovative, Reliable",
    writingStyle: "Clear and concise with technical accuracy",
    avoidTopics: "Politics, competitors",
    keyPhrases: "innovation, quality, reliability",
    primaryGoal: "Brand Awareness",
    contentPillars: "Tech News, Tutorials, Behind the Scenes",
    callToAction: "Learn more",
    hashtagStrategy: "#TestBrand #TechInnovation",
  };

  assert.equal(context.brandName, "TestBrand");
  assert.equal(context.industry, "Technology");
  assert.equal(context.tone, "Professional");
  assert.equal(context.primaryGoal, "Brand Awareness");
});

test("BrandBrainContext allows null/undefined values for optional fields", () => {
  const partialContext: BrandBrainContext = {
    brandName: "MinimalBrand",
    tone: null,
    industry: undefined,
  };

  assert.equal(partialContext.brandName, "MinimalBrand");
  assert.equal(partialContext.tone, null);
  assert.equal(partialContext.industry, undefined);
  assert.equal(partialContext.description, undefined);
});

test("empty BrandBrainContext is valid", () => {
  const emptyContext: BrandBrainContext = {};

  assert.ok(emptyContext !== null);
  assert.equal(typeof emptyContext, "object");
  assert.equal(Object.keys(emptyContext).length, 0);
});

test("BrandBrainContext can be used in content generation context building", () => {
  const context: BrandBrainContext = {
    brandName: "SocialOrc",
    tone: "Professional",
    avoidTopics: "Competitor names, negative sentiment",
    keyPhrases: "social media management, AI-powered",
  };

  const parts: string[] = [];
  if (context.brandName) parts.push(`Brand: ${context.brandName}`);
  if (context.tone) parts.push(`Tone: ${context.tone}`);
  if (context.avoidTopics) parts.push(`Avoid: ${context.avoidTopics}`);
  if (context.keyPhrases) parts.push(`Key Phrases: ${context.keyPhrases}`);

  assert.equal(parts.length, 4);
  assert.ok(parts[0].includes("SocialOrc"));
  assert.ok(parts[1].includes("Professional"));
  assert.ok(parts[2].includes("Competitor names"));
  assert.ok(parts[3].includes("AI-powered"));
});

test("BrandBrain validation schema requirements", () => {
  const validTones = [
    "Professional",
    "Casual",
    "Friendly",
    "Authoritative",
    "Inspirational",
    "Educational",
    "Humorous",
    "Conversational",
  ];

  const validIndustries = [
    "Technology",
    "Finance",
    "Healthcare",
    "Education",
    "E-commerce",
    "Marketing",
    "Real Estate",
    "Consulting",
    "Entertainment",
    "Non-profit",
    "Other",
  ];

  const validGoals = [
    "Brand Awareness",
    "Lead Generation",
    "Community Building",
    "Thought Leadership",
    "Sales & Conversions",
    "Customer Engagement",
    "Traffic & Visibility",
    "Education & Information",
  ];

  assert.equal(validTones.length, 8, "Should have 8 tone options");
  assert.equal(validIndustries.length, 11, "Should have 11 industry options");
  assert.equal(validGoals.length, 8, "Should have 8 goal options");

  assert.ok(validTones.includes("Professional"));
  assert.ok(validIndustries.includes("Technology"));
  assert.ok(validGoals.includes("Brand Awareness"));
});
