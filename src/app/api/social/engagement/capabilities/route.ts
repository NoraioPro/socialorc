import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adapters } from "@/lib/adapters";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { engagementCapabilitiesForPlatform } from "@/lib/social/engagement-api";

export async function GET() {
  const guard = await requirePermission("engagement:view");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: guard.userId, isActive: true },
    select: {
      id: true,
      platform: true,
      platformUsername: true,
      displayName: true,
      needsReconnect: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const payload = accounts.map((account) => {
    // The REAL adapter, never a mock: reporting a mock's engagement capabilities
    // as if they were real is exactly the "looks configured, does nothing"
    // failure mode. `configured` tells the UI the platform itself is reachable.
    const adapter = adapters[account.platform];
    const validation = adapter.validateCredentials();
    const config = PLATFORM_CONFIGS[account.platform];
    return {
      accountId: account.id,
      platform: account.platform,
      platformUsername: account.platformUsername,
      displayName: account.displayName,
      needsReconnect: account.needsReconnect,
      platformName: config.name,
      notes: config.notes,
      /** Is the connector's server-side configuration present? */
      configured: validation.valid,
      /** Variable NAMES only, never values. */
      missing: validation.missing,
      capabilities: engagementCapabilitiesForPlatform(account.platform, adapter),
    };
  });

  return NextResponse.json({ accounts: payload });
}

export const dynamic = "force-dynamic";
