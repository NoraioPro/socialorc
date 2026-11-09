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
import { hasContent, readBrainProfile } from "@/lib/brains/profile";

/** Split a stored line into list items: newline or comma separated. */
function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The brand for generation. The active brain's own profile (Brains page) comes
 * first; anything it leaves empty falls back to the workspace Brand Brain, so a
 * workspace that only filled in Brand Brain keeps getting the same output.
 */
export async function loadBrandContext(workspaceId: string, brainId?: string | null): Promise<BrandContext | null> {
  const [brain, own] = await Promise.all([
    prisma.brandBrain.findUnique({ where: { workspaceId } }),
    brainId
      ? prisma.brain.findFirst({ where: { id: brainId, workspaceId }, select: { name: true, profile: true } })
      : Promise.resolve(null),
  ]);
  const p = readBrainProfile(own?.profile);
  const useOwn = Boolean(own) && hasContent(p);
  if (!brain && !useOwn) return null;

  const profile = {
    name: (useOwn ? own?.name : undefined) ?? brain?.brandName ?? undefined,
    tagline: undefined,
    description: (useOwn && p.description) || brain?.description || undefined,
    industry: (useOwn && p.industry) || brain?.industry || undefined,
    targetAudience: (useOwn && p.audience) || brain?.targetAudience || undefined,
    differentiators: [brain?.uniqueValue].filter((v): v is string => Boolean(v)),
  };

  const voice = {
    toneKeywords: useOwn && p.voice.length ? [...p.voice] : splitList(brain?.tone),
    vocabularyIncludes: [...splitList(brain?.keyPhrases), ...splitList(brain?.writingStyle)],
    vocabularyExcludes: useOwn && p.avoid.length ? [...p.avoid] : splitList(brain?.avoidTopics),
    // The example post teaches length and rhythm, not wording.
    examplePhrases: useOwn && p.example ? [p.example] : [],
  };

  const pillars = useOwn && p.pillars.length ? p.pillars : splitList(brain?.contentPillars);
  const goals = pillars.map((description, index) => ({
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
    voice.examplePhrases,
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
