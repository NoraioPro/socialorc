import { MOCK_COMPETITORS } from "./fixtures";
import type { CompetitorCard, CompetitorDigest, ThreatLevel } from "./types";

export type { CompetitorCard, CompetitorDigest, ThreatLevel, CompetitorPlatform } from "./types";
export { MOCK_COMPETITORS } from "./fixtures";

const THREAT_RANK: Record<ThreatLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** Returns the mock competitor set (never hits the network). */
export function listCompetitors(): CompetitorCard[] {
  return [...MOCK_COMPETITORS];
}

export function getCompetitorDigest(): CompetitorDigest {
  return {
    generatedAt: new Date(0).toISOString(),
    source: "mock",
    competitors: listCompetitors(),
  };
}

export function rankByThreat(competitors: CompetitorCard[] = MOCK_COMPETITORS): CompetitorCard[] {
  return [...competitors].sort((a, b) => {
    const threatDelta = THREAT_RANK[b.threatLevel] - THREAT_RANK[a.threatLevel];
    if (threatDelta !== 0) return threatDelta;
    return b.overlapScore - a.overlapScore;
  });
}

export function topThreats(limit = 3): CompetitorCard[] {
  return rankByThreat().slice(0, Math.max(0, limit));
}

export function averageOverlap(competitors: CompetitorCard[] = MOCK_COMPETITORS): number {
  if (competitors.length === 0) return 0;
  const sum = competitors.reduce((acc, c) => acc + c.overlapScore, 0);
  return Math.round(sum / competitors.length);
}
