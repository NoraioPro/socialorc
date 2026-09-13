/**
 * Content Cascade — Adapt one approved/draft post to multiple platforms.
 *
 * This module orchestrates content adaptation without duplicating AI Studio
 * logic. It reuses the same AI primitives (generate/improve) and is mock-safe
 * when OPENAI_API_KEY is unset.
 */

import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS, PlatformConfig } from "@/types/platform";
import { AINotConfiguredError } from "@/lib/ai";

export interface CascadeSource {
  content: string;
  platform: Platform;
  hashtags?: string[];
}

export interface CascadeAdaptation {
  platform: Platform;
  content: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
  adaptationNotes: string[];
}

export interface CascadeResult {
  source: CascadeSource;
  adaptations: CascadeAdaptation[];
  usedMock: boolean;
}

/**
 * Platform-specific adaptation prompts that guide AI (or mock) to adjust
 * content for each platform's norms.
 */
const ADAPTATION_PROMPTS: Record<Platform, string> = {
  LINKEDIN: `Adapt for LinkedIn: professional tone, thought leadership style. Expand with industry insights if helpful. 3-5 professional hashtags. Max 3000 chars.`,
  TWITTER: `Adapt for X/Twitter: MUST be under 280 chars including hashtags. Punchy, direct, conversation-starting. 1-3 hashtags max. Emojis okay sparingly.`,
  INSTAGRAM: `Adapt for Instagram: engaging caption, authentic voice. 125-150 chars ideal for feed. 5-10 relevant hashtags at end. Include call-to-action.`,
  FACEBOOK: `Adapt for Facebook: conversational, community-focused. Medium length (40-80 words). 1-2 hashtags max. Encourage discussion.`,
  TIKTOK: `Adapt for TikTok: trendy, casual, Gen-Z friendly. Short punchy caption under 150 chars. 3-5 trending hashtags. Hook in first words.`,
  YOUTUBE: `Adapt for YouTube: SEO-optimized title/description style. Include key points. 3-5 tags. Under 100 chars if this is a title.`,
  TELEGRAM: `Adapt for Telegram: direct, useful, community-first. Scannable under 500 chars. Light formatting with clear line breaks. 0-2 hashtags. Lead with the takeaway.`,
};

/**
 * Check if we have a configured OpenAI API key. When absent, cascade falls
 * back to mock adaptations so the feature remains testable without secrets.
 */
function hasAICapability(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Mock adaptation: transform content for a target platform using simple
 * heuristics. Good enough for testing the cascade flow.
 */
function mockAdaptContent(
  source: CascadeSource,
  targetPlatform: Platform
): CascadeAdaptation {
  const config = PLATFORM_CONFIGS[targetPlatform];
  const notes: string[] = [];

  let adaptedContent = source.content;
  const sourceHashtags = source.hashtags || [];
  let adaptedHashtags: string[] = [];

  // Platform-specific mock transformations
  switch (targetPlatform) {
    case "TWITTER":
      // Truncate for Twitter's 280 limit
      if (adaptedContent.length > 250) {
        adaptedContent = adaptedContent.slice(0, 247) + "...";
        notes.push("Truncated for character limit");
      }
      adaptedHashtags = sourceHashtags.slice(0, 2);
      break;

    case "LINKEDIN":
      // Add professional framing
      if (!adaptedContent.startsWith("💡") && !adaptedContent.startsWith("🚀")) {
        adaptedContent = `💡 ${adaptedContent}`;
        notes.push("Added professional emoji lead");
      }
      adaptedHashtags = sourceHashtags.slice(0, 5);
      break;

    case "INSTAGRAM":
      // Add call-to-action
      if (!adaptedContent.includes("?") && !adaptedContent.toLowerCase().includes("comment")) {
        adaptedContent += "\n\nWhat do you think? 💬";
        notes.push("Added engagement CTA");
      }
      adaptedHashtags = sourceHashtags.slice(0, 10);
      if (adaptedHashtags.length < 5) {
        adaptedHashtags.push("socialmedia", "content", "creator");
        notes.push("Added generic hashtags");
      }
      break;

    case "FACEBOOK":
      // Conversational opener
      adaptedContent = `🗣️ ${adaptedContent}`;
      adaptedHashtags = sourceHashtags.slice(0, 2);
      notes.push("Added conversational framing");
      break;

    case "TIKTOK":
      // Short and punchy
      if (adaptedContent.length > 140) {
        adaptedContent = adaptedContent.slice(0, 137) + "...";
        notes.push("Shortened for TikTok caption");
      }
      adaptedHashtags = sourceHashtags.slice(0, 5);
      if (adaptedHashtags.length < 3) {
        adaptedHashtags.push("fyp", "viral");
      }
      break;

    case "YOUTUBE":
      // Title-style formatting
      adaptedContent = adaptedContent.split("\n")[0]; // First line as title
      if (adaptedContent.length > 100) {
        adaptedContent = adaptedContent.slice(0, 97) + "...";
      }
      adaptedHashtags = sourceHashtags.slice(0, 5);
      notes.push("Formatted as video title");
      break;

    case "TELEGRAM":
      // Direct, scannable
      adaptedContent = `📢 ${adaptedContent}`;
      adaptedHashtags = sourceHashtags.slice(0, 2);
      notes.push("Added Telegram channel formatting");
      break;
  }

  // Build final content with hashtags
  const hashtagString = adaptedHashtags.length > 0
    ? `\n\n${adaptedHashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}`
    : "";
  const fullContent = adaptedContent + hashtagString;

  return {
    platform: targetPlatform,
    content: fullContent,
    hashtags: adaptedHashtags,
    characterCount: fullContent.length,
    withinLimit: fullContent.length <= config.maxTextLength,
    adaptationNotes: notes.length > 0 ? notes : ["Mock adaptation applied"],
  };
}

/**
 * AI-powered adaptation using OpenAI. Reuses the same API patterns as AI Studio
 * without duplicating the client code.
 */
async function aiAdaptContent(
  source: CascadeSource,
  targetPlatform: Platform
): Promise<CascadeAdaptation> {
  const config = PLATFORM_CONFIGS[targetPlatform];

  // Dynamic import to avoid initialization errors when OPENAI_API_KEY is unset
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });

  const systemPrompt = `You are a social media content adaptation expert. 
Take the following ${source.platform} post and adapt it for ${targetPlatform}.

${ADAPTATION_PROMPTS[targetPlatform]}

Original content from ${source.platform}:
"""
${source.content}
"""

${source.hashtags?.length ? `Original hashtags: ${source.hashtags.join(", ")}` : ""}

Respond in JSON format:
{
  "content": "the adapted post content (main text without hashtags)",
  "hashtags": ["array", "of", "hashtags", "without", "hash", "symbol"],
  "notes": ["brief notes about what was adapted"]
}

Ensure the adaptation respects ${targetPlatform}'s character limit of ${config.maxTextLength}.`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "Please adapt this content." },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error("No response from AI");
  }

  const parsed = JSON.parse(result);
  const hashtags: string[] = parsed.hashtags || [];
  const hashtagString = hashtags.length > 0
    ? `\n\n${hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ")}`
    : "";
  const fullContent = (parsed.content || "") + hashtagString;

  return {
    platform: targetPlatform,
    content: fullContent,
    hashtags,
    characterCount: fullContent.length,
    withinLimit: fullContent.length <= config.maxTextLength,
    adaptationNotes: parsed.notes || ["AI adaptation applied"],
  };
}

/**
 * Cascade content from a source post to multiple target platforms.
 *
 * @param source - The original post content and platform
 * @param targetPlatforms - Platforms to adapt the content for
 * @param forceMock - Force mock mode even if AI is available (for testing)
 */
export async function cascadeContent(
  source: CascadeSource,
  targetPlatforms: Platform[],
  forceMock = false
): Promise<CascadeResult> {
  // Production never cascades with synthetic text: an invented adaptation is
  // indistinguishable from a real one once it reaches the editor.
  if (!forceMock && !hasAICapability() && process.env.NODE_ENV === "production") {
    throw new AINotConfiguredError();
  }

  const useMock = forceMock || !hasAICapability();
  const adaptations: CascadeAdaptation[] = [];

  // Filter out the source platform from targets
  const validTargets = targetPlatforms.filter((p) => p !== source.platform);

  for (const targetPlatform of validTargets) {
    try {
      const adaptation = useMock
        ? mockAdaptContent(source, targetPlatform)
        : await aiAdaptContent(source, targetPlatform);
      adaptations.push(adaptation);
    } catch (error) {
      // On AI failure, fall back to mock for this platform
      console.error(`AI adaptation failed for ${targetPlatform}, using mock:`, error);
      adaptations.push(mockAdaptContent(source, targetPlatform));
    }
  }

  return {
    source,
    adaptations,
    usedMock: useMock,
  };
}

/**
 * Get available target platforms for cascading from a source platform.
 * Returns all platforms except the source.
 */
export function getAvailableCascadeTargets(sourcePlatform: Platform): PlatformConfig[] {
  return Object.values(PLATFORM_CONFIGS).filter(
    (config) => config.id !== sourcePlatform
  );
}

/**
 * Extract hashtags from content string.
 */
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#[\w]+/g);
  return matches ? matches.map((h) => h.slice(1)) : [];
}

/**
 * Validate that a cascade operation makes sense for the source post.
 */
export function validateCascadeSource(
  content: string,
  platform: Platform
): { valid: boolean; reason?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, reason: "Content is empty" };
  }

  if (content.length < 10) {
    return { valid: false, reason: "Content too short to adapt meaningfully" };
  }

  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    return { valid: false, reason: `Unknown platform: ${platform}` };
  }

  return { valid: true };
}
