/**
 * Brain Health — the completeness score shown at the top of OrcBrain.
 *
 * It measures *how much the platform can know about this brand*, not how much
 * content was produced: a workspace that filled its voice and audience is more
 * useful than one that uploaded ten documents with no identity. Weights sum to
 * exactly 1 so the score is a real percentage, and each incomplete item carries
 * where to fix it — the number is a call to action, not a grade.
 *
 * Pure: the caller reads the rows, this decides the score.
 */

import type { BrainHealth, BrainHealthItem } from "./types";

export interface BrainHealthInput {
  profile: {
    brandName?: string | null;
    description?: string | null;
    industry?: string | null;
    website?: string | null;
    tone?: string | null;
    personality?: string | null;
    writingStyle?: string | null;
    audiencePrimary?: string | null;
    audiencePainPoints?: string | null;
    products?: unknown;
    goals?: unknown;
    competitors?: unknown;
    contentStrategy?: unknown;
  } | null;
  /** Sources whose text was extracted and embedded. */
  readySourceCount: number;
  /** Sources still processing or failed — reported, not scored as knowledge. */
  pendingSourceCount?: number;
  socialAccountCount: number;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmpty(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

const ITEMS: Array<{
  key: string;
  label: string;
  weight: number;
  fixPath: string;
  isComplete: (input: BrainHealthInput) => boolean;
}> = [
  {
    key: "identity",
    label: "Brand identity",
    weight: 0.16,
    fixPath: "/brain/profile",
    isComplete: (i) =>
      filled(i.profile?.brandName) &&
      (filled(i.profile?.description) || filled(i.profile?.industry)),
  },
  {
    key: "voice",
    label: "Brand voice",
    weight: 0.16,
    fixPath: "/brain/profile",
    isComplete: (i) =>
      filled(i.profile?.tone) &&
      (filled(i.profile?.writingStyle) || filled(i.profile?.personality)),
  },
  {
    key: "audience",
    label: "Target audience",
    weight: 0.16,
    fixPath: "/brain/profile",
    isComplete: (i) =>
      filled(i.profile?.audiencePrimary) || filled(i.profile?.audiencePainPoints),
  },
  {
    key: "products",
    label: "Products or services",
    weight: 0.12,
    fixPath: "/brain/profile",
    isComplete: (i) => nonEmpty(i.profile?.products),
  },
  {
    key: "goals",
    label: "Business goals",
    weight: 0.12,
    fixPath: "/brain/profile",
    isComplete: (i) => nonEmpty(i.profile?.goals),
  },
  {
    key: "competitors",
    label: "Competitors",
    weight: 0.06,
    fixPath: "/brain/profile",
    isComplete: (i) => nonEmpty(i.profile?.competitors),
  },
  {
    key: "social",
    label: "Connected social accounts",
    weight: 0.06,
    fixPath: "/settings/accounts",
    isComplete: (i) => i.socialAccountCount > 0,
  },
  {
    key: "knowledge",
    label: "Indexed knowledge",
    weight: 0.16,
    fixPath: "/brain/knowledge",
    isComplete: (i) => i.readySourceCount > 0,
  },
];

export function computeBrainHealth(input: BrainHealthInput): BrainHealth {
  const items: BrainHealthItem[] = ITEMS.map(({ key, label, weight, fixPath, isComplete }) => ({
    key,
    label,
    weight,
    fixPath,
    complete: isComplete(input),
  }));

  const total = items.reduce((sum, item) => sum + (item.complete ? item.weight : 0), 0);

  return {
    score: Math.round(total * 100),
    items,
    suggestions: items
      .filter((item) => !item.complete)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3),
  };
}

/** Weight sum is exactly 1 — asserted in tests so the score stays a percentage. */
export const BRAIN_HEALTH_WEIGHT_TOTAL = ITEMS.reduce((sum, item) => sum + item.weight, 0);
