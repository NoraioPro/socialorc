import { Platform } from "@prisma/client";
import type { BrandContext, TrendingTopic } from "./types";

/**
 * Mock trending-topic fixtures.
 *
 * These numbers are hand-written sample data: no scraping, no platform API, no
 * seeded randomness. Every helper that consumes them is pure, so the same
 * fixture always produces the same dashboard card.
 */

export const MOCK_TRENDING_TOPICS: TrendingTopic[] = [
  {
    id: "trend-ai-workflow-teardown",
    title: "AI workflow teardowns",
    summary:
      "Operators are posting screen-recorded teardowns of the AI workflows they actually run, hashtags included.",
    category: "CONVERSATION",
    platforms: [Platform.LINKEDIN, Platform.TWITTER, Platform.YOUTUBE],
    hashtags: ["#AIWorkflow", "#BuildInPublic"],
    volume24h: 18400,
    velocityPct: 132,
    saturation: 0.38,
    windowHours: 24,
  },
  {
    id: "trend-scheduling-hot-take",
    title: "\"Scheduling tools are the problem\" hot take",
    summary:
      "A contrarian claim that pre-scheduling kills engagement is circulating and pulling replies on every platform.",
    category: "INDUSTRY_NEWS",
    platforms: [Platform.TWITTER, Platform.LINKEDIN],
    hashtags: ["#SocialMediaStrategy", "#ContentOps"],
    volume24h: 9200,
    velocityPct: 74,
    saturation: 0.55,
    windowHours: 24,
  },
  {
    id: "trend-short-form-case-study",
    title: "60-second client case studies",
    summary:
      "Short vertical case-study videos with a before/after metric on screen are outperforming long testimonials.",
    category: "CREATOR_MOMENT",
    platforms: [Platform.TIKTOK, Platform.INSTAGRAM, Platform.YOUTUBE],
    hashtags: ["#CaseStudy", "#ShortForm"],
    volume24h: 26300,
    velocityPct: 41,
    saturation: 0.72,
    windowHours: 24,
  },
  {
    id: "trend-audio-corporate-lofi",
    title: "Lo-fi corporate-broll audio",
    summary:
      "A lofi track is being reused under office b-roll clips; still low saturation on B2B accounts.",
    category: "AUDIO",
    platforms: [Platform.TIKTOK, Platform.INSTAGRAM],
    hashtags: ["#LofiBusiness"],
    volume24h: 41500,
    velocityPct: 18,
    saturation: 0.61,
    windowHours: 24,
  },
  {
    id: "trend-launch-week-thread",
    title: "Launch-week build threads",
    summary:
      "Ship-in-public threads posting one update per day for a week, ending in a launch post.",
    category: "PRODUCT_LAUNCH",
    platforms: [Platform.TWITTER, Platform.LINKEDIN, Platform.TELEGRAM],
    hashtags: ["#LaunchWeek", "#ShipIt"],
    volume24h: 7300,
    velocityPct: 9,
    saturation: 0.44,
    windowHours: 24,
  },
  {
    id: "trend-hashtag-audit-season",
    title: "#MarketingAuditSeason",
    summary:
      "Accounts are publicly auditing their own ad accounts and tagging others to do the same.",
    category: "HASHTAG",
    platforms: [Platform.LINKEDIN, Platform.FACEBOOK],
    hashtags: ["#MarketingAuditSeason"],
    volume24h: 5100,
    velocityPct: -22,
    saturation: 0.83,
    windowHours: 24,
  },
  {
    id: "trend-news-privacy-changes",
    title: "Platform privacy-policy changes",
    summary:
      "Coverage of upcoming audience-targeting restrictions is being quoted by agencies explaining impact.",
    category: "INDUSTRY_NEWS",
    platforms: [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM],
    hashtags: ["#PrivacyFirst"],
    volume24h: 12900,
    velocityPct: 26,
    saturation: 0.49,
    windowHours: 24,
  },
  {
    id: "trend-seasonal-q4-planning",
    title: "Q4 planning templates",
    summary:
      "Free planning templates and calendar screenshots are being shared as teams lock their quarter.",
    category: "SEASONAL",
    platforms: [Platform.LINKEDIN, Platform.TELEGRAM],
    hashtags: ["#Q4Planning", "#GrowthPlanning"],
    volume24h: 6800,
    velocityPct: -4,
    saturation: 0.67,
    windowHours: 24,
  },
];

/**
 * A neutral stand-in brand so the dashboard card renders without a persisted
 * brand profile (Brand Brain owns the real one). Fixture data only.
 */
export const DEFAULT_BRAND_CONTEXT: BrandContext = {
  keywords: ["automation", "scheduling", "growth", "case study", "workflow", "planning"],
  audience: "small business owners",
  preferredPlatforms: [Platform.LINKEDIN, Platform.TWITTER, Platform.TELEGRAM],
};

/** Human label for the fixture source, shown in the UI. */
export const TREND_FIXTURE_NOTE =
  "Mock trending topics (fixture data) — no scraping, no live trend APIs.";
