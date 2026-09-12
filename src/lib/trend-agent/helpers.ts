import type {
  BrandContext,
  TrendAction,
  TrendDigest,
  TrendMatch,
  TrendMomentum,
  TrendingTopic,
} from "./types";

/**
 * Pure scoring helpers for the mock Trend Agent.
 *
 * Contract: every function here is deterministic and side-effect free — no
 * clock reads (timestamps are injected), no randomness, no network. That keeps
 * the dashboard card reproducible and the unit tests meaningful.
 */

/** Momentum thresholds, in percent velocity vs the previous window. */
export const RISING_VELOCITY_PCT = 20;
export const COOLING_VELOCITY_PCT = 0;

const MOMENTUM_LABELS: Record<TrendMomentum, string> = {
  RISING: "Rising",
  PEAKING: "Steady",
  COOLING: "Cooling",
};

const ACTION_LABELS: Record<TrendAction, string> = {
  ACT_NOW: "Act now",
  QUEUE: "Queue",
  WATCH: "Watch",
  SKIP: "Skip",
};

export function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function momentumLabel(momentum: TrendMomentum): string {
  return MOMENTUM_LABELS[momentum];
}

export function actionLabel(action: TrendAction): string {
  return ACTION_LABELS[action];
}

/** Rising above {@link RISING_VELOCITY_PCT}, cooling below zero, otherwise steady. */
export function computeMomentum(topic: TrendingTopic): TrendMomentum {
  if (topic.velocityPct >= RISING_VELOCITY_PCT) return "RISING";
  if (topic.velocityPct <= COOLING_VELOCITY_PCT - 10) return "COOLING";
  return "PEAKING";
}

/**
 * 0–100 viral-potential heuristic: velocity carries the most weight, a high
 * mention volume adds reach, and an already-saturated topic loses headroom.
 */
export function computeViralPotential(topic: TrendingTopic): number {
  const velocityComponent = clamp(topic.velocityPct, -50, 200) * 0.4;
  const volumeComponent = Math.min(topic.volume24h, 50_000) / 1_000;
  const headroomComponent = (1 - clamp(topic.saturation, 0, 1)) * 25;
  return Math.round(clamp(velocityComponent + volumeComponent + headroomComponent));
}

/** 0–100 headroom for a topic the niche has not exhausted yet. */
export function computeCompetitionFactor(topic: TrendingTopic): number {
  return Math.round(clamp((1 - clamp(topic.saturation, 0, 1)) * 100));
}

/**
 * Squash to lowercase alphanumerics so "#CaseStudy", "case-study" and
 * "case study" all compare equal.
 */
function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 0–100 overlap between a topic and the brand: keyword hits dominate, publishing
 * on the brand's own platforms adds weight, and audience words add a little.
 * A topic that matches nothing scores low but not zero — it is simply off-topic.
 */
export function computeRelevance(topic: TrendingTopic, brand: BrandContext): number {
  const haystack = compact(
    [topic.title, topic.summary, topic.category, ...topic.hashtags].join(" "),
  );

  let score = 0;

  for (const keyword of brand.keywords) {
    const needle = compact(keyword);
    if (needle.length > 0 && haystack.includes(needle)) score += 35;
  }

  if (
    brand.preferredPlatforms?.some((platform) => topic.platforms.includes(platform))
  ) {
    score += 20;
  }

  const audienceWords = brand.audience
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5);
  for (const word of audienceWords) {
    if (haystack.includes(word)) score += 15;
  }

  if (score === 0) return 10;
  return Math.round(clamp(score));
}

/** Weighted blend of potential (45%), relevance (40%) and headroom (15%). */
export function computeOverallScore(
  relevance: number,
  viralPotential: number,
  competitionFactor: number,
): number {
  return Math.round(
    clamp(viralPotential) * 0.45 + clamp(relevance) * 0.4 + clamp(competitionFactor) * 0.15,
  );
}

/** Off-brand topics are skipped outright; otherwise the score picks the action. */
export function recommendAction(relevance: number, overallScore: number): TrendAction {
  if (relevance < 25) return "SKIP";
  if (overallScore >= 65) return "ACT_NOW";
  if (overallScore >= 45) return "QUEUE";
  return "WATCH";
}

export function buildSuggestedAngle(
  topic: TrendingTopic,
  brand: BrandContext,
  momentum: TrendMomentum,
): string {
  const platform = topic.platforms[0] ?? brand.preferredPlatforms?.[0];
  const platformLabel = platform ? platform.toLowerCase() : "your primary channel";
  const hashtag = topic.hashtags[0] ?? "";
  const shape = momentum === "RISING" ? "ride it now" : momentum === "PEAKING" ? "add your angle" : "invert the take";
  const tag = hashtag ? ` with ${hashtag}` : "";
  return `For ${brand.audience}: ${shape} on ${platformLabel}${tag} — ${topic.title}.`;
}

export function buildInsights(topic: TrendingTopic, brand: BrandContext): string[] {
  const insights = [
    `${momentumLabel(computeMomentum(topic))}: ${topic.velocityPct >= 0 ? "+" : ""}${topic.velocityPct}% in ${topic.windowHours}h`,
    `${topic.volume24h.toLocaleString("en-US")} mock mentions · ${Math.round(clamp(topic.saturation, 0, 1) * 100)}% of the niche has posted`,
  ];

  const matched = brand.keywords.filter((keyword) =>
    [topic.title, topic.summary, ...topic.hashtags]
      .join(" ")
      .toLowerCase()
      .includes(keyword.toLowerCase()),
  );
  if (matched.length > 0) {
    insights.push(`Matches brand keyword${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}`);
  }

  return insights;
}

/** Score one topic against a brand context. Pure. */
export function matchTrend(topic: TrendingTopic, brand: BrandContext): TrendMatch {
  const momentum = computeMomentum(topic);
  const viralPotential = computeViralPotential(topic);
  const relevance = computeRelevance(topic, brand);
  const competitionFactor = computeCompetitionFactor(topic);
  const overallScore = computeOverallScore(relevance, viralPotential, competitionFactor);

  return {
    topicId: topic.id,
    relevance,
    viralPotential,
    competitionFactor,
    overallScore,
    momentum,
    recommendation: recommendAction(relevance, overallScore),
    suggestedAngle: buildSuggestedAngle(topic, brand, momentum),
    insights: buildInsights(topic, brand),
  };
}

/**
 * Rank every topic against the brand, best first. Ties break on `topic.id` so
 * the ordering is stable for identical scores; the input array is not mutated.
 */
export function rankTrends(
  topics: TrendingTopic[],
  brand: BrandContext,
  limit = topics.length,
): TrendMatch[] {
  return topics
    .map((topic) => matchTrend(topic, brand))
    .sort((a, b) =>
      b.overallScore - a.overallScore || a.topicId.localeCompare(b.topicId),
    )
    .slice(0, Math.max(0, limit));
}

export function filterTrendsByPlatform(
  topics: TrendingTopic[],
  platform: TrendingTopic["platforms"][number],
): TrendingTopic[] {
  return topics.filter((topic) => topic.platforms.includes(platform));
}

/** Build the digest the dashboard card renders. `generatedAt` is injected. */
export function buildTrendDigest(
  topics: TrendingTopic[],
  brand: BrandContext,
  options: { limit?: number; generatedAt: string },
): TrendDigest {
  const matches = rankTrends(topics, brand, options.limit ?? topics.length);
  const actionable = matches.filter(
    (match) => match.recommendation === "ACT_NOW" || match.recommendation === "QUEUE",
  );
  const topPick = matches[0];
  const topTopic = topPick
    ? topics.find((topic) => topic.id === topPick.topicId)
    : undefined;

  let summary: string;
  if (!topPick) {
    summary = "No mock trends available.";
  } else if (topPick.recommendation === "SKIP") {
    summary = `${actionable.length} of ${matches.length} ranked trends are worth acting on; the leading topic is off-brand — review the brand keywords.`;
  } else {
    summary = `${actionable.length} of ${matches.length} ranked trends are worth acting on; top pick: "${topTopic?.title ?? topPick.topicId}" (${topPick.overallScore}/100, ${actionLabel(topPick.recommendation)}).`;
  }

  return {
    generatedAt: options.generatedAt,
    provenance: "MOCK_FIXTURE",
    matches,
    topics,
    topPickId: topPick?.topicId ?? null,
    summary,
  };
}
