import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import {
  calculateCampaignReadiness,
  CampaignReadinessInput,
  MOCK_CAMPAIGN_INPUTS,
} from "../../src/lib/campaign-readiness";

const baseInput = (): CampaignReadinessInput => ({
  postCounts: {
    draft: 0,
    pendingApproval: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
  },
  connectedAccounts: [],
  scheduledNext7Days: 0,
  scheduledNext30Days: 0,
});

describe("Campaign Readiness Score", () => {
  test("empty state returns low score with not-ready grade", () => {
    const result = calculateCampaignReadiness(baseInput());
    assert.ok(result.score < 30, `Expected score < 30, got ${result.score}`);
    assert.equal(result.grade, "not-ready");
    assert.equal(result.recommendation.startAmplification, false);
    assert.ok(result.recommendation.reason.includes("Connect"));
  });

  test("score is clamped between 0 and 100", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.excellent);
    assert.ok(result.score >= 0 && result.score <= 100);
  });

  test("excellent scenario produces high score and excellent grade", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.excellent);
    assert.ok(result.score >= 80, `Expected score >= 80, got ${result.score}`);
    assert.equal(result.grade, "excellent");
    assert.equal(result.recommendation.startAmplification, true);
  });

  test("good scenario produces good grade", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.good);
    assert.ok(result.score >= 60 && result.score <= 85, `Expected 60-85, got ${result.score}`);
    assert.ok(["good", "excellent"].includes(result.grade));
  });

  test("needs-work scenario produces lower score", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.needsWork);
    assert.ok(result.score >= 20 && result.score < 70, `Expected 20-70, got ${result.score}`);
    assert.ok(["needs-work", "fair"].includes(result.grade));
  });

  test("not-ready scenario produces not-ready grade", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.notReady);
    assert.ok(result.score < 30, `Expected < 30, got ${result.score}`);
    assert.equal(result.grade, "not-ready");
    assert.equal(result.recommendation.startAmplification, false);
  });

  test("content pipeline score rewards approved and scheduled content", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    
    const noContent = calculateCampaignReadiness(input);
    
    input.postCounts.approved = 5;
    input.postCounts.scheduled = 5;
    const withContent = calculateCampaignReadiness(input);
    
    assert.ok(
      withContent.breakdown.contentPipeline.score > noContent.breakdown.contentPipeline.score,
      "Content should increase pipeline score"
    );
  });

  test("platform coverage increases with more healthy connections", () => {
    const input = baseInput();
    input.postCounts.approved = 5;
    
    const noPlatforms = calculateCampaignReadiness(input);
    
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    const onePlatform = calculateCampaignReadiness(input);
    
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
      { platform: Platform.LINKEDIN, isActive: true, needsReconnect: false },
      { platform: Platform.TWITTER, isActive: true, needsReconnect: false },
    ];
    const threePlatforms = calculateCampaignReadiness(input);
    
    assert.ok(onePlatform.breakdown.platformCoverage.score > noPlatforms.breakdown.platformCoverage.score);
    assert.ok(threePlatforms.breakdown.platformCoverage.score > onePlatform.breakdown.platformCoverage.score);
  });

  test("accounts needing reconnection do not count as healthy", () => {
    const input = baseInput();
    input.postCounts.approved = 5;
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: true },
      { platform: Platform.LINKEDIN, isActive: false, needsReconnect: false },
    ];
    
    const result = calculateCampaignReadiness(input);
    assert.equal(result.breakdown.platformCoverage.score, 0);
    assert.ok(result.improvements.some((i) => i.includes("Reconnect")));
  });

  test("queue depth rewards scheduled content in next 7 and 30 days", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    input.postCounts.scheduled = 10;
    
    input.scheduledNext7Days = 0;
    input.scheduledNext30Days = 0;
    const noQueue = calculateCampaignReadiness(input);
    
    input.scheduledNext7Days = 7;
    input.scheduledNext30Days = 10;
    const healthyQueue = calculateCampaignReadiness(input);
    
    assert.ok(healthyQueue.breakdown.queueDepth.score > noQueue.breakdown.queueDepth.score);
  });

  test("track record considers success rate", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    
    input.postCounts.published = 10;
    input.postCounts.failed = 0;
    const perfectRecord = calculateCampaignReadiness(input);
    
    input.postCounts.published = 5;
    input.postCounts.failed = 5;
    const mixedRecord = calculateCampaignReadiness(input);
    
    assert.ok(perfectRecord.breakdown.trackRecord.score > mixedRecord.breakdown.trackRecord.score);
  });

  test("no publishing history gets partial track record score", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    
    const result = calculateCampaignReadiness(input);
    assert.ok(result.breakdown.trackRecord.score > 0, "New users get partial credit");
    assert.ok(result.breakdown.trackRecord.details.includes("No publishing history"));
  });

  test("workflow compliance penalizes pending approvals", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    
    input.postCounts.approved = 5;
    input.postCounts.pendingApproval = 0;
    const allApproved = calculateCampaignReadiness(input);
    
    input.postCounts.approved = 2;
    input.postCounts.pendingApproval = 8;
    const manyPending = calculateCampaignReadiness(input);
    
    assert.ok(allApproved.breakdown.workflowCompliance.score > manyPending.breakdown.workflowCompliance.score);
  });

  test("improvements array provides actionable suggestions", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.needsWork);
    assert.ok(result.improvements.length > 0, "Should have improvement suggestions");
    for (const improvement of result.improvements) {
      assert.ok(typeof improvement === "string" && improvement.length > 0);
    }
  });

  test("breakdown scores sum to approximate total", () => {
    const result = calculateCampaignReadiness(MOCK_CAMPAIGN_INPUTS.excellent);
    const summed =
      result.breakdown.contentPipeline.score +
      result.breakdown.platformCoverage.score +
      result.breakdown.queueDepth.score +
      result.breakdown.trackRecord.score +
      result.breakdown.workflowCompliance.score;
    assert.equal(result.score, Math.min(100, summed));
  });

  test("recommendation requires both content and platforms", () => {
    const input = baseInput();
    
    input.postCounts.approved = 10;
    const contentOnly = calculateCampaignReadiness(input);
    assert.equal(contentOnly.recommendation.startAmplification, false);
    assert.ok(contentOnly.recommendation.reason.includes("Connect"));
    
    input.postCounts.approved = 0;
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
    ];
    const platformsOnly = calculateCampaignReadiness(input);
    assert.equal(platformsOnly.recommendation.startAmplification, false);
    assert.ok(platformsOnly.recommendation.reason.includes("content"));
  });

  test("grade boundaries are correctly assigned", () => {
    const input = baseInput();
    input.connectedAccounts = [
      { platform: Platform.TELEGRAM, isActive: true, needsReconnect: false },
      { platform: Platform.LINKEDIN, isActive: true, needsReconnect: false },
      { platform: Platform.TWITTER, isActive: true, needsReconnect: false },
      { platform: Platform.FACEBOOK, isActive: true, needsReconnect: false },
      { platform: Platform.INSTAGRAM, isActive: true, needsReconnect: false },
    ];
    
    input.postCounts = {
      draft: 0,
      pendingApproval: 0,
      approved: 10,
      scheduled: 10,
      published: 50,
      failed: 1,
    };
    input.scheduledNext7Days = 10;
    input.scheduledNext30Days = 20;
    
    const highScore = calculateCampaignReadiness(input);
    assert.ok(highScore.score >= 85);
    assert.equal(highScore.grade, "excellent");
  });
});
