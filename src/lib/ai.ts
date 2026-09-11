import OpenAI from "openai";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY environment variable.");
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });
  }
  return _openai;
}

export interface GeneratedVariant {
  platform: Platform;
  content: string;
  hashtags: string[];
  characterCount: number;
  withinLimit: boolean;
}

export interface BrandBrainContext {
  brandName?: string | null;
  industry?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  uniqueValue?: string | null;
  tone?: string | null;
  personality?: string | null;
  writingStyle?: string | null;
  avoidTopics?: string | null;
  keyPhrases?: string | null;
  primaryGoal?: string | null;
  contentPillars?: string | null;
  callToAction?: string | null;
  hashtagStrategy?: string | null;
}

function buildBrandBrainPrompt(brandBrain: BrandBrainContext): string {
  const parts: string[] = [];
  
  if (brandBrain.brandName) {
    parts.push(`Brand: ${brandBrain.brandName}`);
  }
  if (brandBrain.industry) {
    parts.push(`Industry: ${brandBrain.industry}`);
  }
  if (brandBrain.description) {
    parts.push(`Brand Description: ${brandBrain.description}`);
  }
  if (brandBrain.targetAudience) {
    parts.push(`Target Audience: ${brandBrain.targetAudience}`);
  }
  if (brandBrain.uniqueValue) {
    parts.push(`Unique Value: ${brandBrain.uniqueValue}`);
  }
  if (brandBrain.tone) {
    parts.push(`Tone: ${brandBrain.tone}`);
  }
  if (brandBrain.personality) {
    parts.push(`Brand Personality: ${brandBrain.personality}`);
  }
  if (brandBrain.writingStyle) {
    parts.push(`Writing Style: ${brandBrain.writingStyle}`);
  }
  if (brandBrain.keyPhrases) {
    parts.push(`Key Phrases to Use: ${brandBrain.keyPhrases}`);
  }
  if (brandBrain.avoidTopics) {
    parts.push(`Topics/Words to AVOID: ${brandBrain.avoidTopics}`);
  }
  if (brandBrain.primaryGoal) {
    parts.push(`Primary Goal: ${brandBrain.primaryGoal}`);
  }
  if (brandBrain.contentPillars) {
    parts.push(`Content Pillars: ${brandBrain.contentPillars}`);
  }
  if (brandBrain.callToAction) {
    parts.push(`Preferred CTA: ${brandBrain.callToAction}`);
  }
  if (brandBrain.hashtagStrategy) {
    parts.push(`Hashtag Strategy: ${brandBrain.hashtagStrategy}`);
  }
  
  if (parts.length === 0) {
    return "";
  }
  
  return `
## Brand Context (use this to maintain brand consistency)
${parts.join("\n")}
`;
}

const PLATFORM_PROMPTS: Record<Platform, string> = {
  LINKEDIN: `LinkedIn: Professional tone, industry insights, thought leadership. Can use longer form content up to 3000 chars. Include relevant professional hashtags (3-5). Focus on value, expertise, and meaningful engagement.`,
  
  TWITTER: `X/Twitter: Concise, punchy, engaging. MUST be under 280 characters including hashtags. Use 1-3 relevant hashtags. Make it shareable and conversation-starting. Can use emojis sparingly.`,
  
  INSTAGRAM: `Instagram: Visual-first mindset, engaging captions. Up to 2200 chars but sweet spot is 125-150 for feed posts. Use 5-10 relevant hashtags at the end. Conversational, authentic voice. Include call-to-action.`,
  
  FACEBOOK: `Facebook: Conversational and community-focused. Medium length (40-80 words ideal). Use 1-2 hashtags max. Encourage discussion and sharing. Can be more personal and storytelling-oriented.`,
  
  TIKTOK: `TikTok: Trendy, casual, Gen-Z friendly. Short punchy captions under 150 chars. Use 3-5 trending/relevant hashtags. Include hook in first few words. Think video caption style.`,
  
  YOUTUBE: `YouTube: Title-focused (under 100 chars), descriptive. If for video description, include timestamps placeholder, key points, and call-to-action. Use 3-5 relevant tags. SEO-optimized keywords.`,

  TELEGRAM: `Telegram: Direct, useful, community-first. Up to 4096 chars, but keep channel posts scannable (under 500). Light formatting with clear line breaks, 0-2 hashtags, no engagement-bait. Lead with the takeaway or the link. Captions are capped at 1024 chars when media is attached.`,
};

export async function generatePlatformVariants(
  originalIdea: string,
  platforms: Platform[],
  tone?: string,
  additionalContext?: string,
  brandBrain?: BrandBrainContext
): Promise<GeneratedVariant[]> {
  const platformInstructions = platforms
    .map((p) => PLATFORM_PROMPTS[p])
    .join("\n\n");

  const brandContext = brandBrain ? buildBrandBrainPrompt(brandBrain) : "";
  const effectiveTone = tone || brandBrain?.tone;

  const systemPrompt = `You are a social media content expert. Your job is to transform a content idea into platform-optimized posts.
${brandContext}
For each platform, consider:
- Character limits and formatting constraints
- Platform-specific tone and style
- Hashtag best practices
- Engagement optimization
${brandContext ? "- Maintain brand voice and avoid topics marked as off-limits" : ""}

${platformInstructions}

${effectiveTone ? `Desired tone: ${effectiveTone}` : ""}
${additionalContext ? `Additional context: ${additionalContext}` : ""}

Respond in JSON format with an array of objects, each containing:
- platform: the platform name (LINKEDIN, TWITTER, INSTAGRAM, FACEBOOK, TIKTOK, or YOUTUBE)
- content: the optimized post content (main text without hashtags)
- hashtags: array of hashtags (without # symbol)

Ensure content is properly tailored for each platform's audience and constraints.${brandContext ? " Make sure to incorporate the brand's voice, key phrases, and preferred call-to-action while avoiding any topics marked as off-limits." : ""}`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Original idea:\n\n${originalIdea}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const parsed = JSON.parse(content);
  const variants: { platform: string; content: string; hashtags: string[] }[] = parsed.variants || parsed.posts || [];

  return variants.map((v) => {
    const platform = v.platform as Platform;
    const config = PLATFORM_CONFIGS[platform];
    const fullContent = v.hashtags.length > 0
      ? `${v.content}\n\n${v.hashtags.map((h) => `#${h}`).join(" ")}`
      : v.content;
    
    return {
      platform,
      content: fullContent,
      hashtags: v.hashtags,
      characterCount: fullContent.length,
      withinLimit: fullContent.length <= config.maxTextLength,
    };
  });
}

export async function improveContent(
  content: string,
  platform: Platform,
  instruction: string
): Promise<string> {
  const config = PLATFORM_CONFIGS[platform];
  
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a social media content editor. Improve the following ${platform} post based on the user's instruction. Keep it within ${config.maxTextLength} characters. Return only the improved content, nothing else.`,
      },
      {
        role: "user",
        content: `Current content:\n${content}\n\nInstruction: ${instruction}`,
      },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || content;
}

export async function suggestBestTimes(platform: Platform): Promise<{
  times: { day: string; hour: number; score: number }[];
  notes: string;
}> {
  const bestTimes: Record<Platform, { day: string; hour: number; score: number }[]> = {
    LINKEDIN: [
      { day: "Tuesday", hour: 10, score: 95 },
      { day: "Wednesday", hour: 10, score: 92 },
      { day: "Thursday", hour: 10, score: 90 },
      { day: "Tuesday", hour: 12, score: 88 },
      { day: "Wednesday", hour: 12, score: 85 },
    ],
    TWITTER: [
      { day: "Wednesday", hour: 9, score: 95 },
      { day: "Friday", hour: 9, score: 92 },
      { day: "Tuesday", hour: 10, score: 90 },
      { day: "Thursday", hour: 12, score: 88 },
      { day: "Monday", hour: 9, score: 85 },
    ],
    INSTAGRAM: [
      { day: "Tuesday", hour: 11, score: 95 },
      { day: "Wednesday", hour: 11, score: 93 },
      { day: "Friday", hour: 10, score: 90 },
      { day: "Monday", hour: 11, score: 88 },
      { day: "Thursday", hour: 14, score: 85 },
    ],
    FACEBOOK: [
      { day: "Wednesday", hour: 11, score: 95 },
      { day: "Friday", hour: 10, score: 92 },
      { day: "Monday", hour: 9, score: 90 },
      { day: "Tuesday", hour: 13, score: 88 },
      { day: "Thursday", hour: 11, score: 85 },
    ],
    TIKTOK: [
      { day: "Tuesday", hour: 19, score: 95 },
      { day: "Thursday", hour: 19, score: 93 },
      { day: "Friday", hour: 17, score: 90 },
      { day: "Saturday", hour: 11, score: 88 },
      { day: "Sunday", hour: 19, score: 85 },
    ],
    YOUTUBE: [
      { day: "Thursday", hour: 15, score: 95 },
      { day: "Friday", hour: 15, score: 93 },
      { day: "Saturday", hour: 11, score: 90 },
      { day: "Sunday", hour: 11, score: 88 },
      { day: "Wednesday", hour: 15, score: 85 },
    ],
    TELEGRAM: [
      { day: "Tuesday", hour: 9, score: 93 },
      { day: "Wednesday", hour: 9, score: 91 },
      { day: "Thursday", hour: 18, score: 89 },
      { day: "Monday", hour: 9, score: 87 },
      { day: "Friday", hour: 12, score: 84 },
    ],
  };

  const notes: Record<Platform, string> = {
    LINKEDIN: "B2B audiences most active during business hours. Tuesday-Thursday mornings see highest engagement.",
    TWITTER: "Fast-moving platform. Morning posts catch commuters. Mid-week performs best.",
    INSTAGRAM: "Late morning/lunch breaks ideal. Weekdays outperform weekends for business content.",
    FACEBOOK: "Mid-week, late morning optimal. Avoid posting too early or late.",
    TIKTOK: "Evening hours when users are relaxing. Weekend mornings also perform well.",
    YOUTUBE: "Publish before peak viewing hours (evenings/weekends). Thursday-Saturday optimal.",
    TELEGRAM: "Notifications land immediately, so cadence matters more than timing. Mid-morning and early evening read best; avoid posting more than once a day.",
  };

  return {
    times: bestTimes[platform],
    notes: notes[platform],
  };
}
