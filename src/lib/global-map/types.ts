import { Platform } from "@prisma/client";

export interface Region {
  id: string;
  name: string;
  code: string;
  continent: "NORTH_AMERICA" | "SOUTH_AMERICA" | "EUROPE" | "ASIA" | "AFRICA" | "OCEANIA";
  population: number;
  internetPenetration: number;
  primaryLanguages: string[];
  timezone: string;
}

export interface PlatformPresence {
  platform: Platform;
  monthlyActiveUsers: number;
  growthRate: number;
  avgEngagementRate: number;
  creatorSaturation: number;
}

export interface RegionMetrics {
  regionId: string;
  totalReach: number;
  competitionLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  platformPresence: PlatformPresence[];
  trendingCategories: string[];
  bestPostingTimes: string[];
}

export interface OpportunityScore {
  regionId: string;
  overallScore: number;
  growthPotential: number;
  competitionFactor: number;
  engagementPotential: number;
  marketAccessibility: number;
  breakdown: {
    platformScores: Record<Platform, number>;
    categoryAffinities: Record<string, number>;
  };
  recommendation: "HIGH_PRIORITY" | "MEDIUM_PRIORITY" | "LOW_PRIORITY" | "MONITOR";
  insights: string[];
}

export interface GlobalMapData {
  regions: Region[];
  metrics: RegionMetrics[];
  opportunities: OpportunityScore[];
  lastUpdated: Date;
}
