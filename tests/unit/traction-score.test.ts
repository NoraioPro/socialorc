import { test } from "node:test";
import assert from "node:assert/strict";
import { PostStatus } from "@prisma/client";
import {
  computeTractionScore,
  computeMetricsFromPosts,
  type PostActivityMetrics,
  type PostActivityInput,
} from "../../src/lib/traction-score";

const baseMetrics: PostActivityMetrics = {
  total: 0,
  published: 0,
  failed: 0,
  pending: 0,
  scheduled: 0,
  drafts: 0,
  approvalRate: 0,
  publishSuccessRate: 0,
  avgPostsPerDay: 0,
  activeDays: 0,
  totalDaySpan: 0,
};

test("empty metrics yield score 0 and grade F", () => {
  const result = computeTractionScore(baseMetrics);
  assert.equal(result.score, 0);
  assert.equal(result.grade, "F");
  assert.match(result.summary, /No posts yet/);
});

test("high-performing pipeline yields score >= 75 and grade A or B", () => {
  const metrics: PostActivityMetrics = {
    ...baseMetrics,
    total: 30,
    published: 25,
    failed: 1,
    pending: 2,
    scheduled: 2,
    drafts: 0,
    approvalRate: 0.95,
    publishSuccessRate: 25 / 26,
    avgPostsPerDay: 1,
    activeDays: 25,
    totalDaySpan: 30,
  };
  const result = computeTractionScore(metrics);
  assert.ok(result.score >= 75, `expected score >= 75, got ${result.score}`);
  assert.ok(["A", "B"].includes(result.grade), `expected grade A or B, got ${result.grade}`);
});

test("high failure rate penalizes score", () => {
  const goodMetrics: PostActivityMetrics = {
    ...baseMetrics,
    total: 20,
    published: 15,
    failed: 0,
    pending: 3,
    scheduled: 2,
    approvalRate: 0.9,
    publishSuccessRate: 1,
    avgPostsPerDay: 0.5,
    activeDays: 15,
    totalDaySpan: 30,
  };
  const badMetrics: PostActivityMetrics = {
    ...goodMetrics,
    published: 5,
    failed: 10,
    publishSuccessRate: 5 / 15,
  };
  const goodResult = computeTractionScore(goodMetrics);
  const badResult = computeTractionScore(badMetrics);
  assert.ok(
    badResult.score < goodResult.score,
    `high failure rate should lower score: ${badResult.score} vs ${goodResult.score}`
  );
});

test("score is clamped between 0 and 100", () => {
  const extremeMetrics: PostActivityMetrics = {
    ...baseMetrics,
    total: 1000,
    published: 1000,
    approvalRate: 1,
    publishSuccessRate: 1,
    avgPostsPerDay: 100,
    activeDays: 100,
    totalDaySpan: 10,
  };
  const result = computeTractionScore(extremeMetrics);
  assert.ok(result.score <= 100, `score should not exceed 100, got ${result.score}`);
  assert.ok(result.score >= 0, `score should not be negative, got ${result.score}`);
});

test("grade boundaries are correct", () => {
  const withScore = (score: number) => ({
    ...baseMetrics,
    total: 100,
    published: Math.floor(score),
    publishSuccessRate: 1,
    approvalRate: 1,
    avgPostsPerDay: 1,
    activeDays: 30,
    totalDaySpan: 30,
  });

  const gradeA = computeTractionScore({ ...withScore(90), published: 50, scheduled: 10 });
  const gradeB = computeTractionScore({ ...withScore(75), published: 30, scheduled: 5 });
  const gradeC = computeTractionScore({ ...withScore(60), published: 20, scheduled: 3 });

  assert.equal(gradeA.grade, "A", `expected A for score ${gradeA.score}`);
  assert.ok(["A", "B"].includes(gradeB.grade), `expected A or B for score ${gradeB.score}`);
  assert.ok(["B", "C"].includes(gradeC.grade), `expected B or C for score ${gradeC.score}`);
});

test("computeMetricsFromPosts handles empty array", () => {
  const metrics = computeMetricsFromPosts([]);
  assert.equal(metrics.total, 0);
  assert.equal(metrics.published, 0);
  assert.equal(metrics.publishSuccessRate, 0);
});

test("computeMetricsFromPosts counts statuses correctly", () => {
  const now = new Date();
  const posts: PostActivityInput[] = [
    { status: PostStatus.PUBLISHED, createdAt: now, publishedAt: now, approvedAt: now },
    { status: PostStatus.PUBLISHED, createdAt: now, publishedAt: now, approvedAt: now },
    { status: PostStatus.FAILED, createdAt: now, publishedAt: null, approvedAt: now },
    { status: PostStatus.PENDING_APPROVAL, createdAt: now, publishedAt: null, approvedAt: null },
    { status: PostStatus.SCHEDULED, createdAt: now, publishedAt: null, approvedAt: now },
    { status: PostStatus.DRAFT, createdAt: now, publishedAt: null, approvedAt: null },
  ];
  const metrics = computeMetricsFromPosts(posts);
  assert.equal(metrics.total, 6);
  assert.equal(metrics.published, 2);
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.pending, 1);
  assert.equal(metrics.scheduled, 1);
  assert.equal(metrics.drafts, 1);
});

test("computeMetricsFromPosts calculates success rate", () => {
  const now = new Date();
  const posts: PostActivityInput[] = [
    { status: PostStatus.PUBLISHED, createdAt: now, publishedAt: now, approvedAt: now },
    { status: PostStatus.PUBLISHED, createdAt: now, publishedAt: now, approvedAt: now },
    { status: PostStatus.PUBLISHED, createdAt: now, publishedAt: now, approvedAt: now },
    { status: PostStatus.FAILED, createdAt: now, publishedAt: null, approvedAt: now },
  ];
  const metrics = computeMetricsFromPosts(posts);
  assert.equal(metrics.publishSuccessRate, 0.75);
});

test("computeMetricsFromPosts calculates day span correctly", () => {
  const day1 = new Date("2024-01-01");
  const day10 = new Date("2024-01-10");
  const posts: PostActivityInput[] = [
    { status: PostStatus.PUBLISHED, createdAt: day1, publishedAt: day1, approvedAt: day1 },
    { status: PostStatus.PUBLISHED, createdAt: day10, publishedAt: day10, approvedAt: day10 },
  ];
  const metrics = computeMetricsFromPosts(posts);
  assert.equal(metrics.totalDaySpan, 10);
  assert.equal(metrics.activeDays, 2);
});

test("all PostStatus values are handled", () => {
  const now = new Date();
  const allStatuses = Object.values(PostStatus) as PostStatus[];
  const posts: PostActivityInput[] = allStatuses.map((status) => ({
    status,
    createdAt: now,
    publishedAt: status === PostStatus.PUBLISHED ? now : null,
    approvedAt: ([PostStatus.PUBLISHED, PostStatus.SCHEDULED, PostStatus.APPROVED] as PostStatus[]).includes(status) ? now : null,
  }));
  const metrics = computeMetricsFromPosts(posts);
  assert.equal(metrics.total, allStatuses.length);
});

test("summary reflects high failure scenario", () => {
  const metrics: PostActivityMetrics = {
    ...baseMetrics,
    total: 10,
    published: 2,
    failed: 8,
    publishSuccessRate: 0.2,
    avgPostsPerDay: 1,
    activeDays: 2,
    totalDaySpan: 10,
  };
  const result = computeTractionScore(metrics);
  assert.match(result.summary, /failure rate/i);
});

test("components are all numbers between 0 and 100", () => {
  const metrics: PostActivityMetrics = {
    ...baseMetrics,
    total: 50,
    published: 30,
    failed: 5,
    pending: 5,
    scheduled: 5,
    drafts: 5,
    approvalRate: 0.8,
    publishSuccessRate: 30 / 35,
    avgPostsPerDay: 1.5,
    activeDays: 20,
    totalDaySpan: 30,
  };
  const result = computeTractionScore(metrics);
  for (const [name, value] of Object.entries(result.components)) {
    assert.ok(typeof value === "number", `${name} should be a number`);
    assert.ok(value >= 0 && value <= 100, `${name} should be between 0 and 100, got ${value}`);
  }
});
