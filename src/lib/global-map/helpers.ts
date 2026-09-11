import type { Region, RegionMetrics, OpportunityScore, PlatformPresence } from "./types";
import { Platform } from "@prisma/client";

export function calculateOpportunityScore(
  region: Region,
  metrics: RegionMetrics
): OpportunityScore {
  const presence = metrics.platformPresence;
  const activePresence = presence.filter((p) => p.monthlyActiveUsers > 0);

  if (activePresence.length === 0) {
    return {
      regionId: region.id,
      overallScore: 0,
      growthPotential: 0,
      competitionFactor: 0,
      engagementPotential: 0,
      marketAccessibility: 0,
      breakdown: { platformScores: {} as Record<Platform, number>, categoryAffinities: {} },
      recommendation: "MONITOR",
      insights: ["No active platform presence in this region"],
    };
  }

  const avgGrowth = activePresence.reduce((sum, p) => sum + p.growthRate, 0) / activePresence.length;
  const avgEngagement = activePresence.reduce((sum, p) => sum + p.avgEngagementRate, 0) / activePresence.length;
  const avgSaturation = activePresence.reduce((sum, p) => sum + p.creatorSaturation, 0) / activePresence.length;

  const growthPotential = clamp(avgGrowth * 400 + 50, 0, 100);
  const competitionFactor = clamp((1 - avgSaturation) * 100, 0, 100);
  const engagementPotential = clamp(avgEngagement * 2000, 0, 100);
  const marketAccessibility = region.internetPenetration * 100;

  const overallScore = Math.round(
    growthPotential * 0.3 + competitionFactor * 0.25 + engagementPotential * 0.25 + marketAccessibility * 0.2
  );

  const platformScores = calculatePlatformScores(activePresence);
  const categoryAffinities = calculateCategoryAffinities(metrics.trendingCategories);
  const recommendation = determineRecommendation(overallScore);
  const insights = generateInsights(avgGrowth, avgSaturation, avgEngagement, region.internetPenetration);

  return {
    regionId: region.id,
    overallScore,
    growthPotential: Math.round(growthPotential),
    competitionFactor: Math.round(competitionFactor),
    engagementPotential: Math.round(engagementPotential),
    marketAccessibility: Math.round(marketAccessibility),
    breakdown: { platformScores, categoryAffinities },
    recommendation,
    insights,
  };
}

export function calculatePlatformScores(presence: PlatformPresence[]): Record<Platform, number> {
  const scores: Partial<Record<Platform, number>> = {};
  for (const p of presence) {
    if (p.monthlyActiveUsers > 0) {
      const score = p.growthRate * 200 + (1 - p.creatorSaturation) * 50 + p.avgEngagementRate * 1000;
      scores[p.platform] = clamp(Math.round(score), 0, 100);
    }
  }
  return scores as Record<Platform, number>;
}

export function calculateCategoryAffinities(categories: string[]): Record<string, number> {
  const affinities: Record<string, number> = {};
  categories.forEach((cat, idx) => {
    affinities[cat] = Math.round(90 - idx * 12);
  });
  return affinities;
}

export function determineRecommendation(
  score: number
): OpportunityScore["recommendation"] {
  if (score >= 70) return "HIGH_PRIORITY";
  if (score >= 55) return "MEDIUM_PRIORITY";
  if (score >= 40) return "LOW_PRIORITY";
  return "MONITOR";
}

export function generateInsights(
  avgGrowth: number,
  avgSaturation: number,
  avgEngagement: number,
  internetPenetration: number
): string[] {
  const insights: string[] = [];
  if (avgGrowth > 0.15) {
    insights.push(`High growth market with ${(avgGrowth * 100).toFixed(0)}% avg platform growth`);
  }
  if (avgSaturation < 0.5) {
    insights.push("Low creator saturation presents expansion opportunity");
  }
  if (avgEngagement > 0.03) {
    insights.push("Above-average engagement rates indicate receptive audience");
  }
  if (internetPenetration < 0.7) {
    insights.push("Growing internet penetration signals future potential");
  }
  if (insights.length === 0) {
    insights.push("Mature market with stable growth patterns");
  }
  return insights;
}

export function getTopRegionsByScore(
  opportunities: OpportunityScore[],
  limit: number = 5
): OpportunityScore[] {
  return [...opportunities].sort((a, b) => b.overallScore - a.overallScore).slice(0, limit);
}

export function getRegionsByRecommendation(
  opportunities: OpportunityScore[],
  recommendation: OpportunityScore["recommendation"]
): OpportunityScore[] {
  return opportunities.filter((o) => o.recommendation === recommendation);
}

export function getRegionsByContinent(
  regions: Region[],
  continent: Region["continent"]
): Region[] {
  return regions.filter((r) => r.continent === continent);
}

export function formatPopulation(population: number): string {
  if (population >= 1_000_000_000) {
    return `${(population / 1_000_000_000).toFixed(1)}B`;
  }
  if (population >= 1_000_000) {
    return `${(population / 1_000_000).toFixed(0)}M`;
  }
  if (population >= 1_000) {
    return `${(population / 1_000).toFixed(0)}K`;
  }
  return population.toString();
}

export function formatReach(reach: number): string {
  if (reach >= 1_000_000_000) {
    return `${(reach / 1_000_000_000).toFixed(2)}B`;
  }
  if (reach >= 1_000_000) {
    return `${(reach / 1_000_000).toFixed(0)}M`;
  }
  if (reach >= 1_000) {
    return `${(reach / 1_000).toFixed(0)}K`;
  }
  return reach.toString();
}

export function getCompetitionColor(level: RegionMetrics["competitionLevel"]): string {
  switch (level) {
    case "LOW":
      return "text-green-500";
    case "MEDIUM":
      return "text-yellow-500";
    case "HIGH":
      return "text-orange-500";
    case "VERY_HIGH":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return "text-green-500";
  if (score >= 55) return "text-yellow-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

export function getScoreBgColor(score: number): string {
  if (score >= 70) return "bg-green-500";
  if (score >= 55) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export function getRecommendationBadgeColor(
  recommendation: OpportunityScore["recommendation"]
): string {
  switch (recommendation) {
    case "HIGH_PRIORITY":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "MEDIUM_PRIORITY":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "LOW_PRIORITY":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "MONITOR":
      return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
