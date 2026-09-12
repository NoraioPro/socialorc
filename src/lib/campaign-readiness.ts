import { Platform } from "@prisma/client";

/**
 * Campaign Readiness Score
 * A heuristic 0–100 score indicating how prepared the user is to launch a paid amplification campaign.
 * 
 * The score weighs:
 * - Content pipeline health (approved + scheduled content)
 * - Platform coverage (connected accounts)
 * - Content queue depth (posts ready to go)
 * - Publishing track record (successful posts vs failures)
 * - Approval workflow compliance (no unapproved content going live)
 */

export interface CampaignReadinessInput {
  /** Count of posts by status */
  postCounts: {
    draft: number;
    pendingApproval: number;
    approved: number;
    scheduled: number;
    published: number;
    failed: number;
  };
  /** Connected social accounts that are active and don't need reconnection */
  connectedAccounts: {
    platform: Platform;
    isActive: boolean;
    needsReconnect: boolean;
  }[];
  /** Posts scheduled for the next 7 days */
  scheduledNext7Days: number;
  /** Posts scheduled for the next 30 days */
  scheduledNext30Days: number;
}

export interface CampaignReadinessScore {
  /** Overall readiness 0-100 */
  score: number;
  /** Human-readable grade */
  grade: "excellent" | "good" | "fair" | "needs-work" | "not-ready";
  /** Should the user start paid amplification? */
  recommendation: {
    startAmplification: boolean;
    reason: string;
  };
  /** Breakdown of the score components */
  breakdown: {
    contentPipeline: { score: number; max: number; details: string };
    platformCoverage: { score: number; max: number; details: string };
    queueDepth: { score: number; max: number; details: string };
    trackRecord: { score: number; max: number; details: string };
    workflowCompliance: { score: number; max: number; details: string };
  };
  /** Actionable improvements */
  improvements: string[];
}

const WEIGHTS = {
  contentPipeline: 30,
  platformCoverage: 20,
  queueDepth: 20,
  trackRecord: 20,
  workflowCompliance: 10,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calculateContentPipelineScore(input: CampaignReadinessInput): {
  score: number;
  details: string;
} {
  const { approved, scheduled, draft, pendingApproval } = input.postCounts;
  const readyContent = approved + scheduled;
  const inProgress = draft + pendingApproval;

  if (readyContent === 0 && inProgress === 0) {
    return { score: 0, details: "No content in pipeline" };
  }

  let score = 0;
  if (readyContent >= 10) score = WEIGHTS.contentPipeline;
  else if (readyContent >= 5) score = WEIGHTS.contentPipeline * 0.8;
  else if (readyContent >= 2) score = WEIGHTS.contentPipeline * 0.5;
  else if (readyContent >= 1) score = WEIGHTS.contentPipeline * 0.3;
  else if (inProgress > 0) score = WEIGHTS.contentPipeline * 0.1;

  const details =
    readyContent > 0
      ? `${readyContent} posts ready (${approved} approved, ${scheduled} scheduled)`
      : `${inProgress} posts in progress`;

  return { score: Math.round(score), details };
}

function calculatePlatformCoverageScore(input: CampaignReadinessInput): {
  score: number;
  details: string;
} {
  const healthyAccounts = input.connectedAccounts.filter(
    (a) => a.isActive && !a.needsReconnect
  );
  const uniquePlatforms = new Set(healthyAccounts.map((a) => a.platform));
  const count = uniquePlatforms.size;

  if (count === 0) {
    return { score: 0, details: "No connected platforms" };
  }

  let score = 0;
  if (count >= 5) score = WEIGHTS.platformCoverage;
  else if (count >= 3) score = WEIGHTS.platformCoverage * 0.8;
  else if (count >= 2) score = WEIGHTS.platformCoverage * 0.6;
  else score = WEIGHTS.platformCoverage * 0.4;

  const platforms = Array.from(uniquePlatforms).join(", ");
  return {
    score: Math.round(score),
    details: `${count} platform${count > 1 ? "s" : ""} connected: ${platforms}`,
  };
}

function calculateQueueDepthScore(input: CampaignReadinessInput): {
  score: number;
  details: string;
} {
  const { scheduledNext7Days, scheduledNext30Days } = input;

  if (scheduledNext30Days === 0) {
    return { score: 0, details: "No scheduled content" };
  }

  let score = 0;
  if (scheduledNext7Days >= 7) {
    score = WEIGHTS.queueDepth;
  } else if (scheduledNext7Days >= 3) {
    score = WEIGHTS.queueDepth * 0.7;
  } else if (scheduledNext30Days >= 10) {
    score = WEIGHTS.queueDepth * 0.6;
  } else if (scheduledNext7Days >= 1) {
    score = WEIGHTS.queueDepth * 0.4;
  } else {
    score = WEIGHTS.queueDepth * 0.2;
  }

  return {
    score: Math.round(score),
    details: `${scheduledNext7Days} posts next 7 days, ${scheduledNext30Days} next 30 days`,
  };
}

function calculateTrackRecordScore(input: CampaignReadinessInput): {
  score: number;
  details: string;
} {
  const { published, failed } = input.postCounts;
  const total = published + failed;

  if (total === 0) {
    return { score: WEIGHTS.trackRecord * 0.5, details: "No publishing history yet" };
  }

  const successRate = published / total;
  let score = WEIGHTS.trackRecord * successRate;

  if (published >= 20 && successRate >= 0.95) {
    score = WEIGHTS.trackRecord;
  } else if (published >= 10 && successRate >= 0.9) {
    score = WEIGHTS.trackRecord * 0.9;
  } else if (published >= 5 && successRate >= 0.8) {
    score = WEIGHTS.trackRecord * 0.7;
  }

  const percent = Math.round(successRate * 100);
  return {
    score: Math.round(score),
    details: `${percent}% success rate (${published} published, ${failed} failed)`,
  };
}

function calculateWorkflowComplianceScore(input: CampaignReadinessInput): {
  score: number;
  details: string;
} {
  const { pendingApproval, approved, scheduled } = input.postCounts;
  const approvedOrScheduled = approved + scheduled;

  if (approvedOrScheduled === 0 && pendingApproval === 0) {
    return { score: WEIGHTS.workflowCompliance, details: "No pending content" };
  }

  const total = pendingApproval + approvedOrScheduled;
  const approvalRate = approvedOrScheduled / total;

  let score = WEIGHTS.workflowCompliance * approvalRate;

  if (pendingApproval === 0) {
    score = WEIGHTS.workflowCompliance;
  }

  return {
    score: Math.round(score),
    details:
      pendingApproval > 0
        ? `${pendingApproval} posts awaiting approval`
        : "All queued content is approved",
  };
}

function determineGrade(score: number): CampaignReadinessScore["grade"] {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "needs-work";
  return "not-ready";
}

function generateImprovements(
  input: CampaignReadinessInput,
  breakdown: CampaignReadinessScore["breakdown"]
): string[] {
  const improvements: string[] = [];

  if (breakdown.contentPipeline.score < WEIGHTS.contentPipeline * 0.5) {
    improvements.push("Create and approve more content to build your pipeline");
  }

  if (breakdown.platformCoverage.score < WEIGHTS.platformCoverage * 0.6) {
    improvements.push("Connect additional social platforms for broader reach");
  }

  if (breakdown.queueDepth.score < WEIGHTS.queueDepth * 0.5) {
    improvements.push("Schedule content for the coming weeks");
  }

  if (breakdown.trackRecord.score < WEIGHTS.trackRecord * 0.7) {
    if (input.postCounts.failed > 0) {
      improvements.push("Investigate and fix failed posts to improve success rate");
    } else {
      improvements.push("Build publishing history by posting more content");
    }
  }

  if (breakdown.workflowCompliance.score < WEIGHTS.workflowCompliance * 0.8) {
    improvements.push("Review and approve pending posts");
  }

  const reconnectNeeded = input.connectedAccounts.filter((a) => a.needsReconnect);
  if (reconnectNeeded.length > 0) {
    const platforms = reconnectNeeded.map((a) => a.platform).join(", ");
    improvements.push(`Reconnect accounts that need attention: ${platforms}`);
  }

  return improvements;
}

function generateRecommendation(
  score: number,
  input: CampaignReadinessInput
): CampaignReadinessScore["recommendation"] {
  const healthyAccounts = input.connectedAccounts.filter(
    (a) => a.isActive && !a.needsReconnect
  );

  if (healthyAccounts.length === 0) {
    return {
      startAmplification: false,
      reason: "Connect at least one social platform before starting amplification",
    };
  }

  if (input.postCounts.approved + input.postCounts.scheduled === 0) {
    return {
      startAmplification: false,
      reason: "Create and approve content before running paid campaigns",
    };
  }

  if (score >= 70) {
    return {
      startAmplification: true,
      reason:
        "Your content pipeline is healthy. Consider starting paid amplification to boost reach.",
    };
  }

  if (score >= 50) {
    return {
      startAmplification: false,
      reason:
        "Almost ready. Address the suggested improvements before investing in paid amplification.",
    };
  }

  return {
    startAmplification: false,
    reason:
      "Build up your content pipeline and track record before investing in paid campaigns.",
  };
}

export function calculateCampaignReadiness(
  input: CampaignReadinessInput
): CampaignReadinessScore {
  const contentPipeline = calculateContentPipelineScore(input);
  const platformCoverage = calculatePlatformCoverageScore(input);
  const queueDepth = calculateQueueDepthScore(input);
  const trackRecord = calculateTrackRecordScore(input);
  const workflowCompliance = calculateWorkflowComplianceScore(input);

  const breakdown = {
    contentPipeline: {
      score: contentPipeline.score,
      max: WEIGHTS.contentPipeline,
      details: contentPipeline.details,
    },
    platformCoverage: {
      score: platformCoverage.score,
      max: WEIGHTS.platformCoverage,
      details: platformCoverage.details,
    },
    queueDepth: {
      score: queueDepth.score,
      max: WEIGHTS.queueDepth,
      details: queueDepth.details,
    },
    trackRecord: {
      score: trackRecord.score,
      max: WEIGHTS.trackRecord,
      details: trackRecord.details,
    },
    workflowCompliance: {
      score: workflowCompliance.score,
      max: WEIGHTS.workflowCompliance,
      details: workflowCompliance.details,
    },
  };

  const totalScore = clamp(
    contentPipeline.score +
      platformCoverage.score +
      queueDepth.score +
      trackRecord.score +
      workflowCompliance.score,
    0,
    100
  );

  const grade = determineGrade(totalScore);
  const improvements = generateImprovements(input, breakdown);
  const recommendation = generateRecommendation(totalScore, input);

  return {
    score: totalScore,
    grade,
    recommendation,
    breakdown,
    improvements,
  };
}

/**
 * Mock/fixture data for testing and development.
 * NO LIVE ADS APIS - this is intentional per the spec.
 */
export const MOCK_CAMPAIGN_INPUTS: Record<string, CampaignReadinessInput> = {
  excellent: {
    postCounts: {
      draft: 3,
      pendingApproval: 1,
      approved: 8,
      scheduled: 12,
      published: 45,
      failed: 2,
    },
    connectedAccounts: [
      { platform: "LINKEDIN" as Platform, isActive: true, needsReconnect: false },
      { platform: "TWITTER" as Platform, isActive: true, needsReconnect: false },
      { platform: "INSTAGRAM" as Platform, isActive: true, needsReconnect: false },
      { platform: "FACEBOOK" as Platform, isActive: true, needsReconnect: false },
      { platform: "TELEGRAM" as Platform, isActive: true, needsReconnect: false },
    ],
    scheduledNext7Days: 8,
    scheduledNext30Days: 12,
  },
  good: {
    postCounts: {
      draft: 5,
      pendingApproval: 2,
      approved: 4,
      scheduled: 6,
      published: 20,
      failed: 3,
    },
    connectedAccounts: [
      { platform: "LINKEDIN" as Platform, isActive: true, needsReconnect: false },
      { platform: "TWITTER" as Platform, isActive: true, needsReconnect: false },
      { platform: "TELEGRAM" as Platform, isActive: true, needsReconnect: false },
    ],
    scheduledNext7Days: 4,
    scheduledNext30Days: 6,
  },
  needsWork: {
    postCounts: {
      draft: 8,
      pendingApproval: 4,
      approved: 1,
      scheduled: 2,
      published: 5,
      failed: 3,
    },
    connectedAccounts: [
      { platform: "LINKEDIN" as Platform, isActive: true, needsReconnect: false },
      { platform: "TWITTER" as Platform, isActive: true, needsReconnect: true },
    ],
    scheduledNext7Days: 1,
    scheduledNext30Days: 2,
  },
  notReady: {
    postCounts: {
      draft: 2,
      pendingApproval: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
    },
    connectedAccounts: [],
    scheduledNext7Days: 0,
    scheduledNext30Days: 0,
  },
};
