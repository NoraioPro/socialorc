import { Platform } from "@prisma/client";

/**
 * Brand Brain — the "personality engine" that informs AI content generation.
 * P2 AI Studio uses this to maintain consistent brand voice across platforms.
 */

export interface BrandVoice {
  /** Primary tone descriptors (e.g., "professional", "witty", "empathetic") */
  toneKeywords: string[];
  /** Words/phrases the brand likes to use */
  vocabularyIncludes: string[];
  /** Words/phrases the brand avoids */
  vocabularyExcludes: string[];
  /** Example phrases that capture the brand voice */
  examplePhrases: string[];
  /** Formality level: 1 (very casual) to 5 (very formal) */
  formalityLevel: 1 | 2 | 3 | 4 | 5;
}

export interface BrandGoal {
  id: string;
  /** Goal description (e.g., "Increase thought leadership in AI space") */
  description: string;
  /** Target platforms for this goal */
  platforms: Platform[];
  /** Priority: 1 (highest) to 5 (lowest) */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Keywords/topics relevant to this goal */
  keywords: string[];
}

export interface BrandProfile {
  /** Brand/business name */
  name: string;
  /** Short tagline or mission statement */
  tagline?: string;
  /** Detailed description of what the brand does */
  description: string;
  /** Industry/vertical */
  industry: string;
  /** Target audience description */
  targetAudience: string;
  /** Key differentiators / unique selling points */
  differentiators: string[];
  /** Competitors to be aware of (for positioning) */
  competitors?: string[];
}

export interface BrandBrain {
  id: string;
  userId: string;
  profile: BrandProfile;
  voice: BrandVoice;
  goals: BrandGoal[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Context passed to AI generation when Brand Brain is available.
 * Can also be used with mock/stub data when Brand Brain isn't fully configured.
 */
export interface BrandContext {
  profile?: Partial<BrandProfile>;
  voice?: Partial<BrandVoice>;
  goals?: BrandGoal[];
}

/**
 * Default mock Brand Brain for development/testing without a configured brand.
 */
export const MOCK_BRAND_CONTEXT: BrandContext = {
  profile: {
    name: "SocialOrc Demo Brand",
    tagline: "Orchestrating your social presence",
    description: "A modern social media management platform for creators and businesses",
    industry: "Technology / SaaS",
    targetAudience: "Social media managers, content creators, and small businesses",
    differentiators: [
      "AI-powered content generation",
      "Cross-platform publishing",
      "Brand voice consistency",
    ],
  },
  voice: {
    toneKeywords: ["professional", "helpful", "innovative"],
    vocabularyIncludes: ["streamline", "empower", "optimize", "growth"],
    vocabularyExcludes: ["synergy", "disrupt", "guru"],
    examplePhrases: [
      "Your social presence, orchestrated.",
      "Work smarter, not harder.",
    ],
    formalityLevel: 3,
  },
  goals: [
    {
      id: "goal-1",
      description: "Build thought leadership in social media automation",
      platforms: ["LINKEDIN", "TWITTER"] as Platform[],
      priority: 1,
      keywords: ["automation", "AI", "productivity", "social media"],
    },
  ],
};

/**
 * Builds a prompt segment from brand context for AI generation.
 */
export function buildBrandContextPrompt(context: BrandContext): string {
  const segments: string[] = [];

  if (context.profile) {
    const p = context.profile;
    segments.push(`Brand: ${p.name || "Unknown"}`);
    if (p.tagline) segments.push(`Tagline: ${p.tagline}`);
    if (p.description) segments.push(`About: ${p.description}`);
    if (p.industry) segments.push(`Industry: ${p.industry}`);
    if (p.targetAudience) segments.push(`Target Audience: ${p.targetAudience}`);
    if (p.differentiators?.length) {
      segments.push(`Key Differentiators: ${p.differentiators.join(", ")}`);
    }
  }

  if (context.voice) {
    const v = context.voice;
    if (v.toneKeywords?.length) {
      segments.push(`Voice Tone: ${v.toneKeywords.join(", ")}`);
    }
    if (v.vocabularyIncludes?.length) {
      segments.push(`Preferred Words: ${v.vocabularyIncludes.join(", ")}`);
    }
    if (v.vocabularyExcludes?.length) {
      segments.push(`Avoid: ${v.vocabularyExcludes.join(", ")}`);
    }
    if (v.examplePhrases?.length) {
      segments.push(`Example phrases: "${v.examplePhrases.join('", "')}"`);
    }
    if (v.formalityLevel) {
      const formalityLabels = ["very casual", "casual", "balanced", "formal", "very formal"];
      segments.push(`Formality: ${formalityLabels[v.formalityLevel - 1]}`);
    }
  }

  if (context.goals?.length) {
    const goalStrs = context.goals.map(
      (g) => `- ${g.description} (${g.platforms.join(", ")})`
    );
    segments.push(`Goals:\n${goalStrs.join("\n")}`);
  }

  return segments.length > 0
    ? `\n\nBrand Context:\n${segments.join("\n")}\n`
    : "";
}
