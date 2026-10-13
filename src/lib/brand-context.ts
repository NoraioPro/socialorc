/**
 * The stored Brand Brain, as context for generation.
 *
 * The Brand Brain page has been saving fourteen fields since it was built and
 * nothing read them: the generation path took its brand from the request body and
 * fell back to a hard-coded demo brand, so a customer who filled the page in got
 * the same output as one who never opened it.
 *
 * This turns the row into the shape the prompt builder wants, and returns null
 * when there is nothing worth sending — an absent brand must produce a prompt with
 * no brand section, not a fictional one.
 */
import prisma from "@/lib/prisma";
import type { BrandContext } from "@/types/brand-brain";

/** Split a stored line into list items: newline or comma separated. */
function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function loadBrandContext(userId: string): Promise<BrandContext | null> {
  const brain = await prisma.brandBrain.findUnique({ where: { userId } });
  if (!brain) return null;

  const profile = {
    name: brain.brandName ?? undefined,
    tagline: undefined,
    description: brain.description ?? undefined,
    industry: brain.industry ?? undefined,
    targetAudience: brain.targetAudience ?? undefined,
    differentiators: [brain.uniqueValue].filter((v): v is string => Boolean(v)),
  };

  const voice = {
    toneKeywords: splitList(brain.tone),
    vocabularyIncludes: [...splitList(brain.keyPhrases), ...splitList(brain.writingStyle)],
    vocabularyExcludes: splitList(brain.avoidTopics),
    examplePhrases: [],
  };

  const goals = splitList(brain.contentPillars).map((description, index) => ({
    id: `pillar-${index + 1}`,
    description,
    platforms: [],
    priority: 3 as const,
    keywords: [],
  }));

  const hasProfile = Object.values(profile).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  );
  const hasVoice = [
    voice.toneKeywords,
    voice.vocabularyIncludes,
    voice.vocabularyExcludes,
  ].some((list) => list.length > 0);

  // Nothing filled in is the same as nothing stored: say so, so the caller does
  // not announce "brand context used" for an empty row.
  if (!hasProfile && !hasVoice && goals.length === 0) return null;

  return {
    profile: hasProfile ? profile : undefined,
    voice: hasVoice ? voice : undefined,
    goals: goals.length ? goals : undefined,
  };
}
