/**
 * One readiness report, built from the same inputs everywhere: the adapter
 * credential check, the capability matrix and the approval state. The API route
 * and the Settings screen both call this, so the two can never disagree.
 */
import type { Platform } from "@prisma/client";
import { getAdapterStatus } from "@/lib/adapters";
import { capabilitiesFor } from "@/lib/social/capabilities";
import { appApprovalFor, appOrigin } from "@/lib/social/approval";
import { CONNECTABLE_PLATFORMS, buildReadinessReport, type ReadinessReport } from "@/lib/social/status";

export async function readinessReport(
  connectedCounts: Partial<Record<Platform, number>> = {},
): Promise<ReadinessReport> {
  const credentialStatus = getAdapterStatus();

  return buildReadinessReport(
    CONNECTABLE_PLATFORMS,
    {
      credentialStatus: (platform) => credentialStatus[platform] ?? { configured: false, missing: [] },
      capabilities: (platform, approval) => {
        const capabilities = capabilitiesFor(platform, { scopes: [], approval });
        return { capabilities: capabilities.capabilities, limitations: capabilities.limitations };
      },
      approval: (platform) => appApprovalFor(platform),
      appUrl: appOrigin(),
    },
    connectedCounts,
  );
}
