import type { Region, RegionMetrics, OpportunityScore, PlatformPresence } from "./types";
import { Platform } from "@prisma/client";

export const MOCK_REGIONS: Region[] = [
  {
    id: "us",
    name: "United States",
    code: "US",
    continent: "NORTH_AMERICA",
    population: 331_000_000,
    internetPenetration: 0.92,
    primaryLanguages: ["en"],
    timezone: "America/New_York",
  },
  {
    id: "uk",
    name: "United Kingdom",
    code: "GB",
    continent: "EUROPE",
    population: 67_000_000,
    internetPenetration: 0.95,
    primaryLanguages: ["en"],
    timezone: "Europe/London",
  },
  {
    id: "de",
    name: "Germany",
    code: "DE",
    continent: "EUROPE",
    population: 83_000_000,
    internetPenetration: 0.93,
    primaryLanguages: ["de"],
    timezone: "Europe/Berlin",
  },
  {
    id: "fr",
    name: "France",
    code: "FR",
    continent: "EUROPE",
    population: 67_000_000,
    internetPenetration: 0.92,
    primaryLanguages: ["fr"],
    timezone: "Europe/Paris",
  },
  {
    id: "jp",
    name: "Japan",
    code: "JP",
    continent: "ASIA",
    population: 125_000_000,
    internetPenetration: 0.93,
    primaryLanguages: ["ja"],
    timezone: "Asia/Tokyo",
  },
  {
    id: "br",
    name: "Brazil",
    code: "BR",
    continent: "SOUTH_AMERICA",
    population: 214_000_000,
    internetPenetration: 0.81,
    primaryLanguages: ["pt"],
    timezone: "America/Sao_Paulo",
  },
  {
    id: "in",
    name: "India",
    code: "IN",
    continent: "ASIA",
    population: 1_400_000_000,
    internetPenetration: 0.52,
    primaryLanguages: ["hi", "en"],
    timezone: "Asia/Kolkata",
  },
  {
    id: "au",
    name: "Australia",
    code: "AU",
    continent: "OCEANIA",
    population: 26_000_000,
    internetPenetration: 0.91,
    primaryLanguages: ["en"],
    timezone: "Australia/Sydney",
  },
  {
    id: "mx",
    name: "Mexico",
    code: "MX",
    continent: "NORTH_AMERICA",
    population: 128_000_000,
    internetPenetration: 0.75,
    primaryLanguages: ["es"],
    timezone: "America/Mexico_City",
  },
  {
    id: "ng",
    name: "Nigeria",
    code: "NG",
    continent: "AFRICA",
    population: 218_000_000,
    internetPenetration: 0.55,
    primaryLanguages: ["en", "ha", "yo"],
    timezone: "Africa/Lagos",
  },
  {
    id: "za",
    name: "South Africa",
    code: "ZA",
    continent: "AFRICA",
    population: 60_000_000,
    internetPenetration: 0.72,
    primaryLanguages: ["en", "af", "zu"],
    timezone: "Africa/Johannesburg",
  },
  {
    id: "ae",
    name: "United Arab Emirates",
    code: "AE",
    continent: "ASIA",
    population: 9_900_000,
    internetPenetration: 0.99,
    primaryLanguages: ["ar", "en"],
    timezone: "Asia/Dubai",
  },
];

const createPlatformPresence = (regionId: string): PlatformPresence[] => {
  const presenceByRegion: Record<string, PlatformPresence[]> = {
    us: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 130_000_000, growthRate: 0.05, avgEngagementRate: 0.018, creatorSaturation: 0.85 },
      { platform: "FACEBOOK", monthlyActiveUsers: 180_000_000, growthRate: -0.02, avgEngagementRate: 0.008, creatorSaturation: 0.95 },
      { platform: "TWITTER", monthlyActiveUsers: 75_000_000, growthRate: 0.01, avgEngagementRate: 0.012, creatorSaturation: 0.78 },
      { platform: "TIKTOK", monthlyActiveUsers: 150_000_000, growthRate: 0.12, avgEngagementRate: 0.045, creatorSaturation: 0.65 },
      { platform: "YOUTUBE", monthlyActiveUsers: 240_000_000, growthRate: 0.04, avgEngagementRate: 0.025, creatorSaturation: 0.88 },
      { platform: "LINKEDIN", monthlyActiveUsers: 95_000_000, growthRate: 0.08, avgEngagementRate: 0.021, creatorSaturation: 0.45 },
    ],
    uk: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 32_000_000, growthRate: 0.04, avgEngagementRate: 0.020, creatorSaturation: 0.82 },
      { platform: "FACEBOOK", monthlyActiveUsers: 45_000_000, growthRate: -0.03, avgEngagementRate: 0.007, creatorSaturation: 0.92 },
      { platform: "TWITTER", monthlyActiveUsers: 18_000_000, growthRate: 0.00, avgEngagementRate: 0.014, creatorSaturation: 0.75 },
      { platform: "TIKTOK", monthlyActiveUsers: 25_000_000, growthRate: 0.15, avgEngagementRate: 0.052, creatorSaturation: 0.58 },
      { platform: "YOUTUBE", monthlyActiveUsers: 55_000_000, growthRate: 0.03, avgEngagementRate: 0.028, creatorSaturation: 0.85 },
      { platform: "LINKEDIN", monthlyActiveUsers: 35_000_000, growthRate: 0.09, avgEngagementRate: 0.024, creatorSaturation: 0.42 },
    ],
    de: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 28_000_000, growthRate: 0.03, avgEngagementRate: 0.019, creatorSaturation: 0.70 },
      { platform: "FACEBOOK", monthlyActiveUsers: 32_000_000, growthRate: -0.04, avgEngagementRate: 0.006, creatorSaturation: 0.90 },
      { platform: "TWITTER", monthlyActiveUsers: 8_000_000, growthRate: -0.01, avgEngagementRate: 0.011, creatorSaturation: 0.60 },
      { platform: "TIKTOK", monthlyActiveUsers: 21_000_000, growthRate: 0.18, avgEngagementRate: 0.058, creatorSaturation: 0.48 },
      { platform: "YOUTUBE", monthlyActiveUsers: 50_000_000, growthRate: 0.02, avgEngagementRate: 0.030, creatorSaturation: 0.82 },
      { platform: "LINKEDIN", monthlyActiveUsers: 19_000_000, growthRate: 0.10, avgEngagementRate: 0.026, creatorSaturation: 0.38 },
    ],
    fr: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 26_000_000, growthRate: 0.04, avgEngagementRate: 0.021, creatorSaturation: 0.72 },
      { platform: "FACEBOOK", monthlyActiveUsers: 35_000_000, growthRate: -0.03, avgEngagementRate: 0.007, creatorSaturation: 0.88 },
      { platform: "TWITTER", monthlyActiveUsers: 12_000_000, growthRate: 0.00, avgEngagementRate: 0.013, creatorSaturation: 0.68 },
      { platform: "TIKTOK", monthlyActiveUsers: 22_000_000, growthRate: 0.20, avgEngagementRate: 0.055, creatorSaturation: 0.45 },
      { platform: "YOUTUBE", monthlyActiveUsers: 45_000_000, growthRate: 0.03, avgEngagementRate: 0.027, creatorSaturation: 0.80 },
      { platform: "LINKEDIN", monthlyActiveUsers: 24_000_000, growthRate: 0.07, avgEngagementRate: 0.022, creatorSaturation: 0.40 },
    ],
    jp: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 48_000_000, growthRate: 0.06, avgEngagementRate: 0.025, creatorSaturation: 0.75 },
      { platform: "FACEBOOK", monthlyActiveUsers: 25_000_000, growthRate: -0.05, avgEngagementRate: 0.005, creatorSaturation: 0.85 },
      { platform: "TWITTER", monthlyActiveUsers: 67_000_000, growthRate: 0.02, avgEngagementRate: 0.018, creatorSaturation: 0.82 },
      { platform: "TIKTOK", monthlyActiveUsers: 28_000_000, growthRate: 0.22, avgEngagementRate: 0.062, creatorSaturation: 0.52 },
      { platform: "YOUTUBE", monthlyActiveUsers: 78_000_000, growthRate: 0.04, avgEngagementRate: 0.032, creatorSaturation: 0.78 },
      { platform: "LINKEDIN", monthlyActiveUsers: 4_000_000, growthRate: 0.05, avgEngagementRate: 0.015, creatorSaturation: 0.25 },
    ],
    br: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 120_000_000, growthRate: 0.07, avgEngagementRate: 0.028, creatorSaturation: 0.68 },
      { platform: "FACEBOOK", monthlyActiveUsers: 110_000_000, growthRate: -0.01, avgEngagementRate: 0.009, creatorSaturation: 0.85 },
      { platform: "TWITTER", monthlyActiveUsers: 20_000_000, growthRate: 0.01, avgEngagementRate: 0.015, creatorSaturation: 0.55 },
      { platform: "TIKTOK", monthlyActiveUsers: 82_000_000, growthRate: 0.25, avgEngagementRate: 0.068, creatorSaturation: 0.42 },
      { platform: "YOUTUBE", monthlyActiveUsers: 142_000_000, growthRate: 0.05, avgEngagementRate: 0.035, creatorSaturation: 0.72 },
      { platform: "LINKEDIN", monthlyActiveUsers: 63_000_000, growthRate: 0.12, avgEngagementRate: 0.028, creatorSaturation: 0.35 },
    ],
    in: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 315_000_000, growthRate: 0.10, avgEngagementRate: 0.032, creatorSaturation: 0.55 },
      { platform: "FACEBOOK", monthlyActiveUsers: 350_000_000, growthRate: 0.02, avgEngagementRate: 0.011, creatorSaturation: 0.75 },
      { platform: "TWITTER", monthlyActiveUsers: 27_000_000, growthRate: 0.03, avgEngagementRate: 0.016, creatorSaturation: 0.48 },
      { platform: "TIKTOK", monthlyActiveUsers: 0, growthRate: 0, avgEngagementRate: 0, creatorSaturation: 0 },
      { platform: "YOUTUBE", monthlyActiveUsers: 462_000_000, growthRate: 0.08, avgEngagementRate: 0.038, creatorSaturation: 0.62 },
      { platform: "LINKEDIN", monthlyActiveUsers: 100_000_000, growthRate: 0.15, avgEngagementRate: 0.030, creatorSaturation: 0.30 },
    ],
    au: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 13_000_000, growthRate: 0.04, avgEngagementRate: 0.022, creatorSaturation: 0.78 },
      { platform: "FACEBOOK", monthlyActiveUsers: 18_000_000, growthRate: -0.02, avgEngagementRate: 0.008, creatorSaturation: 0.90 },
      { platform: "TWITTER", monthlyActiveUsers: 5_500_000, growthRate: 0.00, avgEngagementRate: 0.014, creatorSaturation: 0.72 },
      { platform: "TIKTOK", monthlyActiveUsers: 10_000_000, growthRate: 0.18, avgEngagementRate: 0.055, creatorSaturation: 0.55 },
      { platform: "YOUTUBE", monthlyActiveUsers: 21_000_000, growthRate: 0.03, avgEngagementRate: 0.029, creatorSaturation: 0.82 },
      { platform: "LINKEDIN", monthlyActiveUsers: 14_000_000, growthRate: 0.08, avgEngagementRate: 0.025, creatorSaturation: 0.40 },
    ],
    mx: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 42_000_000, growthRate: 0.08, avgEngagementRate: 0.026, creatorSaturation: 0.58 },
      { platform: "FACEBOOK", monthlyActiveUsers: 95_000_000, growthRate: 0.01, avgEngagementRate: 0.010, creatorSaturation: 0.82 },
      { platform: "TWITTER", monthlyActiveUsers: 14_000_000, growthRate: 0.02, avgEngagementRate: 0.014, creatorSaturation: 0.52 },
      { platform: "TIKTOK", monthlyActiveUsers: 58_000_000, growthRate: 0.28, avgEngagementRate: 0.072, creatorSaturation: 0.38 },
      { platform: "YOUTUBE", monthlyActiveUsers: 85_000_000, growthRate: 0.06, avgEngagementRate: 0.033, creatorSaturation: 0.68 },
      { platform: "LINKEDIN", monthlyActiveUsers: 21_000_000, growthRate: 0.11, avgEngagementRate: 0.024, creatorSaturation: 0.32 },
    ],
    ng: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 12_000_000, growthRate: 0.12, avgEngagementRate: 0.035, creatorSaturation: 0.35 },
      { platform: "FACEBOOK", monthlyActiveUsers: 28_000_000, growthRate: 0.05, avgEngagementRate: 0.014, creatorSaturation: 0.55 },
      { platform: "TWITTER", monthlyActiveUsers: 9_000_000, growthRate: 0.08, avgEngagementRate: 0.022, creatorSaturation: 0.40 },
      { platform: "TIKTOK", monthlyActiveUsers: 18_000_000, growthRate: 0.35, avgEngagementRate: 0.085, creatorSaturation: 0.25 },
      { platform: "YOUTUBE", monthlyActiveUsers: 32_000_000, growthRate: 0.10, avgEngagementRate: 0.042, creatorSaturation: 0.45 },
      { platform: "LINKEDIN", monthlyActiveUsers: 8_000_000, growthRate: 0.18, avgEngagementRate: 0.032, creatorSaturation: 0.20 },
    ],
    za: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 8_000_000, growthRate: 0.09, avgEngagementRate: 0.030, creatorSaturation: 0.45 },
      { platform: "FACEBOOK", monthlyActiveUsers: 25_000_000, growthRate: 0.02, avgEngagementRate: 0.012, creatorSaturation: 0.68 },
      { platform: "TWITTER", monthlyActiveUsers: 4_500_000, growthRate: 0.04, avgEngagementRate: 0.018, creatorSaturation: 0.50 },
      { platform: "TIKTOK", monthlyActiveUsers: 12_000_000, growthRate: 0.30, avgEngagementRate: 0.078, creatorSaturation: 0.30 },
      { platform: "YOUTUBE", monthlyActiveUsers: 28_000_000, growthRate: 0.07, avgEngagementRate: 0.038, creatorSaturation: 0.55 },
      { platform: "LINKEDIN", monthlyActiveUsers: 10_000_000, growthRate: 0.14, avgEngagementRate: 0.028, creatorSaturation: 0.28 },
    ],
    ae: [
      { platform: "INSTAGRAM", monthlyActiveUsers: 7_000_000, growthRate: 0.06, avgEngagementRate: 0.024, creatorSaturation: 0.72 },
      { platform: "FACEBOOK", monthlyActiveUsers: 8_500_000, growthRate: 0.00, avgEngagementRate: 0.009, creatorSaturation: 0.85 },
      { platform: "TWITTER", monthlyActiveUsers: 3_200_000, growthRate: 0.02, avgEngagementRate: 0.016, creatorSaturation: 0.65 },
      { platform: "TIKTOK", monthlyActiveUsers: 6_800_000, growthRate: 0.22, avgEngagementRate: 0.065, creatorSaturation: 0.50 },
      { platform: "YOUTUBE", monthlyActiveUsers: 8_900_000, growthRate: 0.04, avgEngagementRate: 0.030, creatorSaturation: 0.75 },
      { platform: "LINKEDIN", monthlyActiveUsers: 5_500_000, growthRate: 0.10, avgEngagementRate: 0.026, creatorSaturation: 0.55 },
    ],
  };
  return presenceByRegion[regionId] || [];
};

const TRENDING_CATEGORIES_BY_REGION: Record<string, string[]> = {
  us: ["Tech Reviews", "Finance", "Wellness", "Gaming", "Home Improvement"],
  uk: ["Fashion", "Football", "Sustainability", "Food & Drink", "Music"],
  de: ["Automotive", "Engineering", "Travel", "Fitness", "Sustainability"],
  fr: ["Fashion", "Cuisine", "Art & Culture", "Wine & Spirits", "Luxury"],
  jp: ["Anime", "Gaming", "Technology", "Food", "Fashion"],
  br: ["Music", "Football", "Beauty", "Comedy", "Dance"],
  in: ["Cricket", "Bollywood", "Tech Education", "Cooking", "Spirituality"],
  au: ["Outdoor Sports", "Wildlife", "Food & Wine", "Fitness", "Travel"],
  mx: ["Food", "Music", "Family", "Comedy", "Sports"],
  ng: ["Music", "Comedy", "Tech", "Fashion", "Finance"],
  za: ["Music", "Sports", "Fashion", "Finance", "Food"],
  ae: ["Luxury", "Travel", "Real Estate", "Finance", "Fashion"],
};

const BEST_POSTING_TIMES_BY_REGION: Record<string, string[]> = {
  us: ["09:00 EST", "12:00 EST", "19:00 EST"],
  uk: ["08:00 GMT", "12:30 GMT", "18:00 GMT"],
  de: ["08:00 CET", "12:00 CET", "19:00 CET"],
  fr: ["08:30 CET", "12:00 CET", "19:30 CET"],
  jp: ["07:00 JST", "12:00 JST", "21:00 JST"],
  br: ["09:00 BRT", "13:00 BRT", "20:00 BRT"],
  in: ["09:00 IST", "12:30 IST", "19:00 IST"],
  au: ["08:00 AEST", "12:00 AEST", "19:00 AEST"],
  mx: ["09:00 CST", "13:00 CST", "20:00 CST"],
  ng: ["08:00 WAT", "13:00 WAT", "19:00 WAT"],
  za: ["08:00 SAST", "12:00 SAST", "18:00 SAST"],
  ae: ["09:00 GST", "13:00 GST", "21:00 GST"],
};

export const MOCK_REGION_METRICS: RegionMetrics[] = MOCK_REGIONS.map((region) => {
  const presence = createPlatformPresence(region.id);
  const totalReach = presence.reduce((sum, p) => sum + p.monthlyActiveUsers, 0);
  const avgSaturation =
    presence.filter((p) => p.monthlyActiveUsers > 0).reduce((sum, p) => sum + p.creatorSaturation, 0) /
    presence.filter((p) => p.monthlyActiveUsers > 0).length;

  let competitionLevel: RegionMetrics["competitionLevel"] = "LOW";
  if (avgSaturation >= 0.8) competitionLevel = "VERY_HIGH";
  else if (avgSaturation >= 0.65) competitionLevel = "HIGH";
  else if (avgSaturation >= 0.45) competitionLevel = "MEDIUM";

  return {
    regionId: region.id,
    totalReach,
    competitionLevel,
    platformPresence: presence,
    trendingCategories: TRENDING_CATEGORIES_BY_REGION[region.id] || [],
    bestPostingTimes: BEST_POSTING_TIMES_BY_REGION[region.id] || [],
  };
});

export const MOCK_OPPORTUNITY_SCORES: OpportunityScore[] = MOCK_REGIONS.map((region) => {
  const metrics = MOCK_REGION_METRICS.find((m) => m.regionId === region.id)!;
  const presence = metrics.platformPresence;

  const avgGrowth =
    presence.filter((p) => p.monthlyActiveUsers > 0).reduce((sum, p) => sum + p.growthRate, 0) /
    presence.filter((p) => p.monthlyActiveUsers > 0).length;
  const avgEngagement =
    presence.filter((p) => p.monthlyActiveUsers > 0).reduce((sum, p) => sum + p.avgEngagementRate, 0) /
    presence.filter((p) => p.monthlyActiveUsers > 0).length;
  const avgSaturation =
    presence.filter((p) => p.monthlyActiveUsers > 0).reduce((sum, p) => sum + p.creatorSaturation, 0) /
    presence.filter((p) => p.monthlyActiveUsers > 0).length;

  const growthPotential = Math.min(100, Math.max(0, avgGrowth * 400 + 50));
  const competitionFactor = Math.min(100, Math.max(0, (1 - avgSaturation) * 100));
  const engagementPotential = Math.min(100, Math.max(0, avgEngagement * 2000));
  const marketAccessibility = region.internetPenetration * 100;

  const overallScore = Math.round(
    growthPotential * 0.3 + competitionFactor * 0.25 + engagementPotential * 0.25 + marketAccessibility * 0.2
  );

  const platformScores: Record<string, number> = {};
  presence.forEach((p) => {
    if (p.monthlyActiveUsers > 0) {
      const score =
        p.growthRate * 200 + (1 - p.creatorSaturation) * 50 + p.avgEngagementRate * 1000;
      platformScores[p.platform] = Math.min(100, Math.max(0, Math.round(score)));
    }
  });

  const categoryAffinities: Record<string, number> = {};
  metrics.trendingCategories.forEach((cat, idx) => {
    categoryAffinities[cat] = Math.round(90 - idx * 12);
  });

  let recommendation: OpportunityScore["recommendation"] = "MONITOR";
  if (overallScore >= 70) recommendation = "HIGH_PRIORITY";
  else if (overallScore >= 55) recommendation = "MEDIUM_PRIORITY";
  else if (overallScore >= 40) recommendation = "LOW_PRIORITY";

  const insights: string[] = [];
  if (avgGrowth > 0.15) insights.push(`High growth market with ${(avgGrowth * 100).toFixed(0)}% avg platform growth`);
  if (avgSaturation < 0.5) insights.push("Low creator saturation presents expansion opportunity");
  if (avgEngagement > 0.03) insights.push("Above-average engagement rates indicate receptive audience");
  if (region.internetPenetration < 0.7) insights.push("Growing internet penetration signals future potential");
  if (insights.length === 0) insights.push("Mature market with stable growth patterns");

  return {
    regionId: region.id,
    overallScore,
    growthPotential: Math.round(growthPotential),
    competitionFactor: Math.round(competitionFactor),
    engagementPotential: Math.round(engagementPotential),
    marketAccessibility: Math.round(marketAccessibility),
    breakdown: {
      platformScores: platformScores as Record<Platform, number>,
      categoryAffinities,
    },
    recommendation,
    insights,
  };
});
