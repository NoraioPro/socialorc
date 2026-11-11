import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

/**
 * POST /api/social/test — checks each connected account's stored state: active,
 * not flagged for reconnect, token not past its expiry, no recorded error.
 * It does not call the networks, so it never posts or spends quota.
 */
export async function POST() {
  const g = await requireWorkspace("accounts:connect");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId: g.workspaceId },
    select: { id: true, platform: true, platformUsername: true, isActive: true, needsReconnect: true, tokenExpiresAt: true, refreshToken: true, lastError: true },
  });
  const now = Date.now();
  const results = accounts.map((a) => {
    let ok = true; let message = "Looks healthy.";
    if (!a.isActive) { ok = false; message = "Paused or disconnected."; }
    else if (a.needsReconnect) { ok = false; message = a.lastError ?? "The platform rejected the stored token. Reconnect it."; }
    else if (a.tokenExpiresAt && a.tokenExpiresAt.getTime() < now && !a.refreshToken) { ok = false; message = "The token has expired and cannot refresh. Reconnect it."; }
    else if (a.lastError) { ok = false; message = `Last error: ${a.lastError}`; }
    return { id: a.id, platform: a.platform, handle: a.platformUsername, ok, message };
  });
  return NextResponse.json({ results });
}
