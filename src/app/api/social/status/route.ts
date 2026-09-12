import { NextResponse } from "next/server";
import type { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { getAdapterStatus } from "@/lib/adapters";
import { capabilitiesFor } from "@/lib/social/capabilities";
import { appApprovalFor, appOrigin } from "@/lib/social/approval";
import { CONNECTABLE_PLATFORMS, buildReadinessReport } from "@/lib/social/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/social/status
 *
 * Owner-facing readiness for one-click connect: per platform, whether the app is
 * configured, which variable NAMES are missing, and the exact redirect URI to
 * register in that platform's portal. Names and URIs only — never a secret.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session.user.id, isActive: true },
    select: { platform: true },
  });

  const connectedCounts: Partial<Record<Platform, number>> = {};
  for (const account of accounts) {
    connectedCounts[account.platform] = (connectedCounts[account.platform] ?? 0) + 1;
  }

  const credentialStatus = getAdapterStatus();

  const report = buildReadinessReport(CONNECTABLE_PLATFORMS, {
    credentialStatus: (platform) =>
      credentialStatus[platform] ?? { configured: false, missing: [] },
    capabilities: (platform, approval) => {
      const capabilities = capabilitiesFor(platform, { scopes: [], approval });
      return {
        capabilities: capabilities.capabilities,
        limitations: capabilities.limitations,
      };
    },
    approval: (platform) => appApprovalFor(platform),
    appUrl: appOrigin(),
  }, connectedCounts);

  return NextResponse.json(report);
}
