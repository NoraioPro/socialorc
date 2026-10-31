import { NextResponse } from "next/server";
import type { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { readinessReport } from "@/lib/social/readiness";

export const dynamic = "force-dynamic";

/**
 * GET /api/social/status
 *
 * Owner-facing readiness for one-click connect: per platform, whether the app is
 * configured, which variable NAMES are missing, and the exact redirect URI to
 * register in that platform's portal. Names and URIs only — never a secret.
 */
export async function GET() {
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: tenant.workspaceId, isActive: true },
    select: { platform: true },
  });

  const connectedCounts: Partial<Record<Platform, number>> = {};
  for (const account of accounts) {
    connectedCounts[account.platform] = (connectedCounts[account.platform] ?? 0) + 1;
  }

  return NextResponse.json(await readinessReport(connectedCounts));
}
