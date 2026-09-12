import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import {
  calculateOpportunityScore,
  calculatePlatformScores,
  calculateCategoryAffinities,
  determineRecommendation,
  generateInsights,
  getTopRegionsByScore,
  getRegionsByRecommendation,
  getRegionsByContinent,
  formatPopulation,
  formatReach,
  getCompetitionColor,
  getScoreColor,
  getRecommendationBadgeColor,
} from "../../src/lib/global-map/helpers";
import type { Region, RegionMetrics, OpportunityScore, PlatformPresence } from "../../src/lib/global-map/types";
import { MOCK_REGIONS, MOCK_REGION_METRICS, MOCK_OPPORTUNITY_SCORES } from "../../src/lib/global-map/fixtures";

const mockRegion: Region = {
  id: "test",
  name: "Test Region",
  code: "TR",
  continent: "EUROPE",
  population: 50_000_000,
  internetPenetration: 0.85,
  primaryLanguages: ["en"],
  timezone: "Europe/London",
};

const mockPresence: PlatformPresence[] = [
  { platform: Platform.INSTAGRAM, monthlyActiveUsers: 20_000_000, growthRate: 0.10, avgEngagementRate: 0.025, creatorSaturation: 0.50 },
  { platform: Platform.TWITTER, monthlyActiveUsers: 10_000_000, growthRate: 0.05, avgEngagementRate: 0.015, creatorSaturation: 0.60 },
  { platform: Platform.TIKTOK, monthlyActiveUsers: 15_000_000, growthRate: 0.25, avgEngagementRate: 0.045, creatorSaturation: 0.35 },
];

const mockMetrics: RegionMetrics = {
  regionId: "test",
  totalReach: 45_000_000,
  competitionLevel: "MEDIUM",
  platformPresence: mockPresence,
  trendingCategories: ["Tech", "Fashion", "Gaming", "Food", "Travel"],
  bestPostingTimes: ["09:00 GMT", "18:00 GMT"],
};

test("calculateOpportunityScore produces valid score structure", () => {
  const score = calculateOpportunityScore(mockRegion, mockMetrics);
  
  assert.equal(score.regionId, "test");
  assert.ok(score.overallScore >= 0 && score.overallScore <= 100, "Overall score should be 0-100");
  assert.ok(score.growthPotential >= 0 && score.growthPotential <= 100);
  assert.ok(score.competitionFactor >= 0 && score.competitionFactor <= 100);
  assert.ok(score.engagementPotential >= 0 && score.engagementPotential <= 100);
  assert.ok(score.marketAccessibility >= 0 && score.marketAccessibility <= 100);
  assert.ok(Array.isArray(score.insights));
  assert.ok(score.insights.length > 0);
});

test("calculateOpportunityScore handles empty platform presence", () => {
  const emptyMetrics: RegionMetrics = {
    ...mockMetrics,
    platformPresence: [],
  };
  
  const score = calculateOpportunityScore(mockRegion, emptyMetrics);
  
  assert.equal(score.overallScore, 0);
  assert.equal(score.recommendation, "MONITOR");
  assert.ok(score.insights.includes("No active platform presence in this region"));
});

test("calculateOpportunityScore handles platforms with zero users", () => {
  const zeroUserMetrics: RegionMetrics = {
    ...mockMetrics,
    platformPresence: [
      { platform: Platform.TIKTOK, monthlyActiveUsers: 0, growthRate: 0, avgEngagementRate: 0, creatorSaturation: 0 },
      { platform: Platform.INSTAGRAM, monthlyActiveUsers: 10_000_000, growthRate: 0.10, avgEngagementRate: 0.02, creatorSaturation: 0.50 },
    ],
  };
  
  const score = calculateOpportunityScore(mockRegion, zeroUserMetrics);
  
  assert.ok(score.overallScore > 0, "Should calculate score from non-zero platforms");
  assert.ok(!score.breakdown.platformScores[Platform.TIKTOK], "TikTok should not have a score");
  assert.ok(score.breakdown.platformScores[Platform.INSTAGRAM] > 0, "Instagram should have a score");
});

test("calculatePlatformScores produces valid scores", () => {
  const scores = calculatePlatformScores(mockPresence);
  
  assert.ok(scores[Platform.INSTAGRAM] >= 0 && scores[Platform.INSTAGRAM] <= 100);
  assert.ok(scores[Platform.TWITTER] >= 0 && scores[Platform.TWITTER] <= 100);
  assert.ok(scores[Platform.TIKTOK] >= 0 && scores[Platform.TIKTOK] <= 100);
  assert.ok(scores[Platform.TIKTOK] > scores[Platform.TWITTER], "Higher growth platform should score higher");
});

test("calculateCategoryAffinities assigns descending scores", () => {
  const categories = ["A", "B", "C", "D", "E"];
  const affinities = calculateCategoryAffinities(categories);
  
  assert.equal(affinities["A"], 90);
  assert.equal(affinities["B"], 78);
  assert.equal(affinities["C"], 66);
  assert.ok(affinities["A"] > affinities["B"]);
  assert.ok(affinities["B"] > affinities["C"]);
});

test("determineRecommendation returns correct categories", () => {
  assert.equal(determineRecommendation(85), "HIGH_PRIORITY");
  assert.equal(determineRecommendation(70), "HIGH_PRIORITY");
  assert.equal(determineRecommendation(65), "MEDIUM_PRIORITY");
  assert.equal(determineRecommendation(55), "MEDIUM_PRIORITY");
  assert.equal(determineRecommendation(50), "LOW_PRIORITY");
  assert.equal(determineRecommendation(40), "LOW_PRIORITY");
  assert.equal(determineRecommendation(30), "MONITOR");
  assert.equal(determineRecommendation(0), "MONITOR");
});

test("generateInsights produces relevant insights", () => {
  const highGrowthInsights = generateInsights(0.20, 0.60, 0.02, 0.90);
  assert.ok(highGrowthInsights.some(i => i.includes("High growth")));
  
  const lowSaturationInsights = generateInsights(0.05, 0.40, 0.02, 0.90);
  assert.ok(lowSaturationInsights.some(i => i.includes("saturation")));
  
  const highEngagementInsights = generateInsights(0.05, 0.60, 0.04, 0.90);
  assert.ok(highEngagementInsights.some(i => i.includes("engagement")));
  
  const lowPenetrationInsights = generateInsights(0.05, 0.60, 0.02, 0.60);
  assert.ok(lowPenetrationInsights.some(i => i.includes("penetration")));
  
  const matureMarketInsights = generateInsights(0.05, 0.60, 0.02, 0.90);
  assert.ok(matureMarketInsights.some(i => i.includes("Mature market")));
});

test("getTopRegionsByScore returns correct number of results sorted by score", () => {
  const emptyPlatformScores = {} as Record<Platform, number>;
  const mockOpportunities: OpportunityScore[] = [
    { regionId: "a", overallScore: 50, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "LOW_PRIORITY", insights: [] },
    { regionId: "b", overallScore: 80, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "HIGH_PRIORITY", insights: [] },
    { regionId: "c", overallScore: 60, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "MEDIUM_PRIORITY", insights: [] },
  ];
  
  const top2 = getTopRegionsByScore(mockOpportunities, 2);
  
  assert.equal(top2.length, 2);
  assert.equal(top2[0].regionId, "b");
  assert.equal(top2[1].regionId, "c");
});

test("getRegionsByRecommendation filters correctly", () => {
  const emptyPlatformScores = {} as Record<Platform, number>;
  const mockOpportunities: OpportunityScore[] = [
    { regionId: "a", overallScore: 50, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "LOW_PRIORITY", insights: [] },
    { regionId: "b", overallScore: 80, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "HIGH_PRIORITY", insights: [] },
    { regionId: "c", overallScore: 75, growthPotential: 0, competitionFactor: 0, engagementPotential: 0, marketAccessibility: 0, breakdown: { platformScores: emptyPlatformScores, categoryAffinities: {} }, recommendation: "HIGH_PRIORITY", insights: [] },
  ];
  
  const highPriority = getRegionsByRecommendation(mockOpportunities, "HIGH_PRIORITY");
  
  assert.equal(highPriority.length, 2);
  assert.ok(highPriority.every(o => o.recommendation === "HIGH_PRIORITY"));
});

test("getRegionsByContinent filters correctly", () => {
  const europeanRegions = getRegionsByContinent(MOCK_REGIONS, "EUROPE");
  
  assert.ok(europeanRegions.length > 0);
  assert.ok(europeanRegions.every(r => r.continent === "EUROPE"));
  assert.ok(europeanRegions.some(r => r.code === "GB"));
  assert.ok(europeanRegions.some(r => r.code === "DE"));
});

test("formatPopulation formats numbers correctly", () => {
  assert.equal(formatPopulation(1_400_000_000), "1.4B");
  assert.equal(formatPopulation(331_000_000), "331M");
  assert.equal(formatPopulation(50_000), "50K");
  assert.equal(formatPopulation(500), "500");
});

test("formatReach formats numbers correctly", () => {
  assert.equal(formatReach(1_500_000_000), "1.50B");
  assert.equal(formatReach(250_000_000), "250M");
  assert.equal(formatReach(75_000), "75K");
  assert.equal(formatReach(999), "999");
});

test("getCompetitionColor returns appropriate colors", () => {
  assert.equal(getCompetitionColor("LOW"), "text-green-500");
  assert.equal(getCompetitionColor("MEDIUM"), "text-yellow-500");
  assert.equal(getCompetitionColor("HIGH"), "text-orange-500");
  assert.equal(getCompetitionColor("VERY_HIGH"), "text-red-500");
});

test("getScoreColor returns appropriate colors", () => {
  assert.equal(getScoreColor(80), "text-green-500");
  assert.equal(getScoreColor(70), "text-green-500");
  assert.equal(getScoreColor(60), "text-yellow-500");
  assert.equal(getScoreColor(55), "text-yellow-500");
  assert.equal(getScoreColor(45), "text-orange-500");
  assert.equal(getScoreColor(40), "text-orange-500");
  assert.equal(getScoreColor(30), "text-red-500");
});

test("getRecommendationBadgeColor returns appropriate classes", () => {
  const high = getRecommendationBadgeColor("HIGH_PRIORITY");
  assert.ok(high.includes("green"));
  
  const medium = getRecommendationBadgeColor("MEDIUM_PRIORITY");
  assert.ok(medium.includes("yellow"));
  
  const low = getRecommendationBadgeColor("LOW_PRIORITY");
  assert.ok(low.includes("orange"));
  
  const monitor = getRecommendationBadgeColor("MONITOR");
  assert.ok(monitor.includes("gray"));
});

test("MOCK_REGIONS contains expected regions", () => {
  assert.ok(MOCK_REGIONS.length >= 10, "Should have at least 10 regions");
  
  const regionIds = MOCK_REGIONS.map(r => r.id);
  assert.ok(regionIds.includes("us"));
  assert.ok(regionIds.includes("uk"));
  assert.ok(regionIds.includes("jp"));
  assert.ok(regionIds.includes("br"));
  assert.ok(regionIds.includes("in"));
  
  for (const region of MOCK_REGIONS) {
    assert.ok(region.id, "Region should have id");
    assert.ok(region.name, "Region should have name");
    assert.ok(region.code, "Region should have code");
    assert.ok(region.population > 0, "Region should have population");
    assert.ok(region.internetPenetration > 0 && region.internetPenetration <= 1, "Internet penetration should be 0-1");
  }
});

test("MOCK_REGION_METRICS matches regions", () => {
  assert.equal(MOCK_REGION_METRICS.length, MOCK_REGIONS.length);
  
  for (const metrics of MOCK_REGION_METRICS) {
    assert.ok(MOCK_REGIONS.some(r => r.id === metrics.regionId), `Metrics for ${metrics.regionId} should have matching region`);
    assert.ok(metrics.platformPresence.length > 0, "Should have platform presence data");
    assert.ok(metrics.trendingCategories.length > 0, "Should have trending categories");
  }
});

test("MOCK_OPPORTUNITY_SCORES are valid and match regions", () => {
  assert.equal(MOCK_OPPORTUNITY_SCORES.length, MOCK_REGIONS.length);
  
  for (const opportunity of MOCK_OPPORTUNITY_SCORES) {
    assert.ok(MOCK_REGIONS.some(r => r.id === opportunity.regionId));
    assert.ok(opportunity.overallScore >= 0 && opportunity.overallScore <= 100);
    assert.ok(["HIGH_PRIORITY", "MEDIUM_PRIORITY", "LOW_PRIORITY", "MONITOR"].includes(opportunity.recommendation));
    assert.ok(opportunity.insights.length > 0);
  }
});
