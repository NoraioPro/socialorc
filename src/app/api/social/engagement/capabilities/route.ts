import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getAdapter } from "@/lib/adapters";
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
    const adapter = getAdapter(account.platform, { useMockIfUnconfigured: true });
    const config = PLATFORM_CONFIGS[account.platform];
    return {
      accountId: account.id,
      platform: account.platform,
      platformUsername: account.platformUsername,
      displayName: account.displayName,
      needsReconnect: account.needsReconnect,
      platformName: config.name,
      notes: config.notes,
      capabilities: engagementCapabilitiesForPlatform(account.platform, adapter),
    };
  });

  return NextResponse.json({ accounts: payload });
}

export const dynamic = "force-dynamic";
