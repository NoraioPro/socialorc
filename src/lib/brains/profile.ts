import { z } from "zod";

/**
 * A brain's brand profile: the voice, audience and rules generation follows for
 * that brand. Stored as JSON text on Brain.profile (so SQLite and Postgres behave
 * the same) and validated here at every boundary.
 */

export const VOICES = ["Plain", "Confident", "Warm", "Playful", "Technical", "Bold", "No hype"] as const;
export const BRAIN_PLATFORMS = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;
export const BRAIN_COLORS = ["#48ED85", "#7CB7FF", "#F5C451", "#FF8A7A", "#C9A7FF", "#5FD4D0"] as const;

const list = (max: number, len: number) => z.array(z.string().trim().min(1).max(len)).max(max);

export const brainProfileSchema = z.object({
  description: z.string().trim().max(600).default(""),
  industry: z.string().trim().max(120).default(""),
  audience: z.string().trim().max(600).default(""),
  voice: z.array(z.enum(VOICES)).max(3).default([]),
  avoid: list(30, 80).default([]),
  pillars: list(12, 80).default([]),
  example: z.string().trim().max(3000).default(""),
  /** Channels this brand intends to post to; real accounts are connected separately. */
  channels: z.array(z.enum(BRAIN_PLATFORMS)).max(7).default([]),
});

export type BrainProfile = z.infer<typeof brainProfileSchema>;

export const EMPTY_PROFILE: BrainProfile = brainProfileSchema.parse({});

/** Read a stored profile. A missing or corrupt value is an empty profile, never an error. */
export function readBrainProfile(json: string | null | undefined): BrainProfile {
  if (!json) return { ...EMPTY_PROFILE };
  try {
    const parsed = brainProfileSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : { ...EMPTY_PROFILE };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

/** The fields generation can use that this profile leaves empty, for the editor's note. */
export function missingFields(p: BrainProfile): string[] {
  const out: string[] = [];
  if (!p.description) out.push("description");
  if (!p.audience) out.push("audience");
  if (!p.voice.length) out.push("voice");
  if (!p.pillars.length) out.push("pillars");
  if (!p.avoid.length) out.push("avoid list");
  if (!p.example) out.push("example post");
  return out;
}

export function hasContent(p: BrainProfile): boolean {
  return Boolean(p.description || p.industry || p.audience || p.example || p.voice.length || p.avoid.length || p.pillars.length);
}

export const brainUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.enum(BRAIN_COLORS).nullable().optional(),
  handle: z.string().trim().max(60).nullable().optional(),
  profile: brainProfileSchema.optional(),
});
