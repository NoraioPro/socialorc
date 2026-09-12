import { Platform } from "@prisma/client";

/**
 * Trend Agent (P2) — types for the *mock* trending-topics surface.
 *
 * Scope of this slice: a deterministic, offline fixture set plus pure scoring
 * helpers rendered as a dashboard card. Nothing in this module performs a
 * network call, scrapes a platform, or reads a live trend API — the fixtures in
 * `./fixtures.ts` are the only source of trends. Wiring a real Trend Agent
 * (Vision §"Trend Agent": real-time trend detection, viral potential scoring)
 * means replacing the fixture import, not the scoring contract below.
 */

export type TrendCategory =
  | "HASHTAG"
  | "CONVERSATION"
  | "PRODUCT_LAUNCH"
  | "INDUSTRY_NEWS"
  | "AUDIO"
  | "CREATOR_MOMENT"
  | "SEASONAL";

/** Which way a topic is moving inside its detection window. */
export type TrendMomentum = "RISING" | "PEAKING" | "COOLING";

/** What the operator should do with a topic. */
export type TrendAction = "ACT_NOW" | "QUEUE" | "WATCH" | "SKIP";

export interface TrendingTopic {
  /** Stable slug — the fixture id is also the tie-breaker when ranking. */
  id: string;
  title: string;
  summary: string;
  category: TrendCategory;
  /** Platforms the topic is being observed on (mock observation set). */
  platforms: Platform[];
  hashtags: string[];
  /** Mentions counted inside `windowHours` (mock counter). */
  volume24h: number;
  /** Percent change versus the previous window (mock counter). */
  velocityPct: number;
  /** 0–1: share of the niche already posting about it. */
  saturation: number;
  /** Detection window the volume belongs to. */
  windowHours: number;
}

/** The brand the trends are being matched against. */
export interface BrandContext {
  keywords: string[];
  audience: string;
  /** Platforms the brand actually publishes on, if known. */
  preferredPlatforms?: Platform[];
}

export interface TrendMatch {
  topicId: string;
  /** 0–100 overlap with the brand context. */
  relevance: number;
  /** 0–100 momentum + volume + headroom heuristic. */
  viralPotential: number;
  /** 0–100 headroom: high means the niche has not saturated the topic yet. */
  competitionFactor: number;
  /** 0–100 weighted blend used for ranking. */
  overallScore: number;
  momentum: TrendMomentum;
  recommendation: TrendAction;
  /** One-line content angle an operator can hand to the Content Agent. */
  suggestedAngle: string;
  insights: string[];
}

export interface TrendDigest {
  /** ISO timestamp, injected by the caller so the digest stays reproducible. */
  generatedAt: string;
  /** Provenance marker — this slice is fixture-only by design. */
  provenance: "MOCK_FIXTURE";
  /** Ranked matches (best first), limited to `limit`. */
  matches: TrendMatch[];
  /** The topics the digest was built from, in fixture order. */
  topics: TrendingTopic[];
  topPickId: string | null;
  summary: string;
}
