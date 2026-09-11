import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Platform } from "@prisma/client";
import {
  actionLabel,
  buildSuggestedAngle,
  buildTrendDigest,
  computeCompetitionFactor,
  computeMomentum,
  computeOverallScore,
  computeRelevance,
  computeViralPotential,
  DEFAULT_BRAND_CONTEXT,
  filterTrendsByPlatform,
  matchTrend,
  momentumLabel,
  MOCK_TRENDING_TOPICS,
  rankTrends,
  recommendAction,
  TREND_FIXTURE_NOTE,
  type BrandContext,
  type TrendingTopic,
} from "../../src/lib/trend-agent";

const brand = DEFAULT_BRAND_CONTEXT;

const topic = (over: Partial<TrendingTopic> = {}): TrendingTopic => ({
  id: "trend-test",
  title: "Test topic",
  summary: "A fixture-shaped topic",
  category: "CONVERSATION",
  platforms: [Platform.LINKEDIN],
  hashtags: ["#TestTopic"],
  volume24h: 1000,
  velocityPct: 10,
  saturation: 0.5,
  windowHours: 24,
  ...over,
});

const sourceDir = fileURLToPath(new URL("../../src/lib/trend-agent/", import.meta.url));
const libSource = ["types.ts", "fixtures.ts", "helpers.ts", "index.ts"]
  .map((file) => readFileSync(sourceDir + file, "utf8"))
  .join("\n");

test("the fixture set is populated and every topic is well formed", () => {
  assert.ok(MOCK_TRENDING_TOPICS.length >= 5, "expected several mock trends");

  const ids = MOCK_TRENDING_TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "fixture ids must be unique");

  for (const t of MOCK_TRENDING_TOPICS) {
    assert.ok(t.id.length > 0 && t.title.length > 0 && t.summary.length > 0, `${t.id} is missing copy`);
    assert.ok(t.platforms.length > 0, `${t.id} declares no platform`);
    assert.ok(t.hashtags.every((h) => h.startsWith("#")), `${t.id} has a malformed hashtag`);
    assert.ok(t.windowHours > 0, `${t.id} has no detection window`);
    assert.ok(t.saturation >= 0 && t.saturation <= 1, `${t.id} saturation is not 0–1`);
    assert.ok(t.volume24h >= 0, `${t.id} volume cannot be negative`);
  }
});

test("the trend agent is offline: no fetch, no client, no clock, no randomness", () => {
  for (const forbidden of ["fetch(", "axios", "http://", "https://", "XMLHttpRequest", "require("]) {
    assert.ok(!libSource.includes(forbidden), `trend-agent must not reach the network (found ${forbidden})`);
  }
  for (const forbidden of ["Date.now", "Math.random", "new Date("]) {
    assert.ok(!libSource.includes(forbidden), `trend-agent helpers must stay deterministic (found ${forbidden})`);
  }
});

test("the mock-note claim matches the implementation", () => {
  assert.match(TREND_FIXTURE_NOTE, /mock/i);
  assert.match(TREND_FIXTURE_NOTE, /no scraping/i);
  assert.match(TREND_FIXTURE_NOTE, /no live/i);
  assert.ok(brand.keywords.length > 0, "the default brand context needs keywords");
});

test("momentum separates rising, steady and cooling topics", () => {
  assert.equal(computeMomentum(topic({ velocityPct: 120 })), "RISING");
  assert.equal(computeMomentum(topic({ velocityPct: 20 })), "RISING", "the threshold is inclusive");
  assert.equal(computeMomentum(topic({ velocityPct: 5 })), "PEAKING");
  assert.equal(computeMomentum(topic({ velocityPct: 0 })), "PEAKING");
  assert.equal(computeMomentum(topic({ velocityPct: -4 })), "PEAKING");
  assert.equal(computeMomentum(topic({ velocityPct: -22 })), "COOLING");
});

test("viral potential rewards velocity and volume, and stays inside 0–100", () => {
  const slow = computeViralPotential(topic({ velocityPct: 5, volume24h: 1000 }));
  const fast = computeViralPotential(topic({ velocityPct: 150, volume24h: 1000 }));
  const popular = computeViralPotential(topic({ velocityPct: 5, volume24h: 40000 }));
  assert.ok(fast > slow, "a faster topic must score higher");
  assert.ok(popular > slow, "a louder topic must score higher");

  for (const t of MOCK_TRENDING_TOPICS) {
    const score = computeViralPotential(t);
    assert.ok(score >= 0 && score <= 100, `${t.id} viral potential out of range: ${score}`);
  }
  assert.equal(computeViralPotential(topic({ velocityPct: 10_000, volume24h: 10_000_000, saturation: 0 })), 100);
});

test("competition factor is the headroom left in the niche", () => {
  assert.equal(computeCompetitionFactor(topic({ saturation: 0 })), 100);
  assert.equal(computeCompetitionFactor(topic({ saturation: 1 })), 0);
  assert.equal(computeCompetitionFactor(topic({ saturation: 0.4 })), 60);
});

test("relevance matches keywords on the topic, hashtag or summary", () => {
  const context: BrandContext = { keywords: ["case study"], audience: "founders" };

  const byHashtag = computeRelevance(topic({ title: "Vertical clips", hashtags: ["#CaseStudy"] }), context);
  const bySummary = computeRelevance(topic({ title: "Vertical clips", summary: "A case-study recap" }), context);
  const unrelated = computeRelevance(
    topic({ title: "Lofi audio", summary: "Background music", hashtags: ["#Audio"] }),
    context,
  );

  assert.equal(byHashtag, 35, "a hashtag hit scores the keyword weight");
  assert.equal(bySummary, 35, "spelling variants of a keyword still match");
  assert.equal(unrelated, 10, "an off-brand topic scores low but not zero");
  assert.ok(byHashtag > unrelated, "an on-brand topic must outrank an off-brand one");
});

test("relevance rewards publishing where the brand already publishes", () => {
  const context: BrandContext = { keywords: [], audience: "founders", preferredPlatforms: [Platform.TELEGRAM] };
  const onBrand = computeRelevance(topic({ platforms: [Platform.TELEGRAM] }), context);
  const elsewhere = computeRelevance(topic({ platforms: [Platform.TIKTOK] }), context);
  assert.equal(onBrand, 20);
  assert.equal(elsewhere, 10);
});

test("off-brand topics are skipped and high scores are acted on", () => {
  assert.equal(recommendAction(10, 90), "SKIP", "relevance gates the action");
  assert.equal(recommendAction(60, 70), "ACT_NOW");
  assert.equal(recommendAction(60, 65), "ACT_NOW");
  assert.equal(recommendAction(60, 50), "QUEUE");
  assert.equal(recommendAction(60, 45), "QUEUE");
  assert.equal(recommendAction(30, 20), "WATCH");
});

test("a match carries every score in range and an explanation", () => {
  const match = matchTrend(MOCK_TRENDING_TOPICS[0], brand);

  assert.equal(match.topicId, MOCK_TRENDING_TOPICS[0].id);
  for (const [label, value] of Object.entries({
    relevance: match.relevance,
    viralPotential: match.viralPotential,
    competitionFactor: match.competitionFactor,
    overallScore: match.overallScore,
  })) {
    assert.ok(value >= 0 && value <= 100, `${label} out of range: ${value}`);
  }
  assert.equal(
    match.overallScore,
    computeOverallScore(match.relevance, match.viralPotential, match.competitionFactor),
  );
  assert.equal(match.recommendation, recommendAction(match.relevance, match.overallScore));
  assert.ok(match.insights.length >= 2, "a match needs at least momentum + volume insights");
  assert.ok(match.insights[0].includes(momentumLabel(match.momentum)), "insight states the momentum label");
  assert.match(match.insights[0], /% in 24h/, "insight states the velocity and window");
});

test("the suggested angle names the audience, channel and hashtag", () => {
  const t = topic({ hashtags: ["#GrowthOps"], platforms: [Platform.LINKEDIN], title: "Growth teardowns" });
  const angle = buildSuggestedAngle(t, brand, "RISING");
  assert.ok(angle.includes(brand.audience));
  assert.ok(angle.includes("linkedin"));
  assert.ok(angle.includes("#GrowthOps"));
  assert.ok(angle.includes("Growth teardowns"));
  assert.ok(angle.includes("ride it now"), "a rising topic is framed as act-now");
});

test("ranking sorts best-first, deterministically, without mutating the input", () => {
  const topics = [...MOCK_TRENDING_TOPICS];
  const before = topics.map((t) => t.id);
  const ranked = rankTrends(topics, brand, topics.length);

  assert.equal(ranked.length, topics.length);
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(
      ranked[i - 1].overallScore >= ranked[i].overallScore,
      "matches must be ordered by overall score",
    );
  }
  assert.deepEqual(topics.map((t) => t.id), before, "rankTrends must not reorder its input");
  assert.deepEqual(ranked, rankTrends(topics, brand, topics.length), "ranking is reproducible");
});

test("ranking honours the limit and breaks ties on the topic id", () => {
  assert.equal(rankTrends(MOCK_TRENDING_TOPICS, brand, 3).length, 3);
  assert.equal(rankTrends(MOCK_TRENDING_TOPICS, brand, 0).length, 0);

  const tieA = topic({ id: "trend-a", title: "Same", summary: "Same" });
  const tieB = topic({ id: "trend-b", title: "Same", summary: "Same" });
  const ranked = rankTrends([tieB, tieA], { keywords: [], audience: "founders" });
  assert.deepEqual(ranked.map((m) => m.topicId), ["trend-a", "trend-b"], "ties resolve by id");
});

test("the digest stitches the ranked matches into a readable summary", () => {
  const generatedAt = "2026-09-11T00:00:00.000Z";
  const digest = buildTrendDigest(MOCK_TRENDING_TOPICS, brand, { limit: 4, generatedAt });

  assert.equal(digest.generatedAt, generatedAt, "the caller owns the timestamp");
  assert.equal(digest.provenance, "MOCK_FIXTURE");
  assert.equal(digest.matches.length, 4);
  assert.equal(digest.topics.length, MOCK_TRENDING_TOPICS.length, "the digest keeps the source topics");
  assert.equal(digest.topPickId, digest.matches[0].topicId);

  const topTopic = MOCK_TRENDING_TOPICS.find((t) => t.id === digest.topPickId);
  assert.ok(topTopic, "the top pick must exist in the fixture set");
  assert.ok(digest.summary.includes(topTopic!.title), "the summary names the top pick");
  assert.match(digest.summary, /worth acting on/);
});

test("an empty topic list degrades to a quiet digest, not a crash", () => {
  const digest = buildTrendDigest([], brand, { generatedAt: "2026-09-11T00:00:00.000Z" });
  assert.deepEqual(digest.matches, []);
  assert.equal(digest.topPickId, null);
  assert.equal(digest.summary, "No mock trends available.");
});

test("every fixture topic is reachable through at least one platform filter", () => {
  for (const t of MOCK_TRENDING_TOPICS) {
    for (const platform of t.platforms) {
      const filtered = filterTrendsByPlatform(MOCK_TRENDING_TOPICS, platform);
      assert.ok(filtered.some((f) => f.id === t.id), `${t.id} missing from ${platform}`);
      assert.ok(filtered.every((f) => f.platforms.includes(platform)));
    }
  }
});

test("every momentum and action value has an operator-facing label", () => {
  assert.equal(new Set(["RISING", "PEAKING", "COOLING"].map((m) => momentumLabel(m as never))).size, 3);
  assert.equal(new Set(["ACT_NOW", "QUEUE", "WATCH", "SKIP"].map((a) => actionLabel(a as never))).size, 4);
  for (const m of ["RISING", "PEAKING", "COOLING"] as const) {
    assert.ok(momentumLabel(m).length > 0);
  }
  for (const a of ["ACT_NOW", "QUEUE", "WATCH", "SKIP"] as const) {
    assert.ok(actionLabel(a).length > 0);
  }
});

test("the dashboard card renders the fixture digest and the page mounts it", () => {
  const card = readFileSync(
    fileURLToPath(new URL("../../src/components/dashboard/trend-agent-card.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(card.includes("MOCK_TRENDING_TOPICS"), "the card must render the fixture set");
  assert.ok(card.includes("buildTrendDigest"), "the card must use the shared ranking helper");
  assert.ok(card.includes("TREND_FIXTURE_NOTE"), "the card must disclose that the data is mock");

  const page = readFileSync(
    fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.ok(page.includes("<TrendAgentCard"), "the dashboard must mount the Trend Agent card");
});
