import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { clientIp, recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({ visibility: z.enum(["PRIVATE", "WORKSPACE"]) });

/**
 * PATCH /api/accounts/[id] — the owner (or an admin) shares a connection with the
 * workspace, or takes it back. A personal account is private until its owner says
 * otherwise; the posts route enforces the same rule when a post is created.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireWorkspace("posts:create");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "visibility must be PRIVATE or WORKSPACE" }, { status: 400 });
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, workspaceId: guard.workspaceId },
    select: { id: true, userId: true, platform: true, platformUsername: true, visibility: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const isOwner = account.userId === guard.userId;
  const isAdmin = String(guard.role).toUpperCase() === "ADMIN";
  // Only the member who connected an account may share it. An admin can always
  // revoke sharing (a safety action), but never widen someone else's personal
  // account to the whole workspace.
  if (!isOwner && !(isAdmin && parsed.data.visibility === "PRIVATE")) {
    return NextResponse.json(
      {
        error: isAdmin
          ? "Only the member who connected this account can share it with the workspace. You can take sharing away."
          : "Only the member who connected this account can change who may use it.",
      },
      { status: 403 },
    );
  }

  const updated = await prisma.socialAccount.update({
    where: { id: account.id },
    data: { visibility: parsed.data.visibility },
    select: { id: true, visibility: true },
  });

  const actor = await prisma.user.findUnique({
    where: { id: guard.userId },
    select: { name: true, email: true },
  });
  await recordAudit({
    workspaceId: guard.workspaceId,
    actorId: guard.userId,
    actorLabel: actor?.name ?? actor?.email ?? null,
    action: "ROLE_CHANGED",
    subjectType: "ACCOUNT",
    subjectId: account.id,
    detail: {
      platform: account.platform,
      handle: account.platformUsername,
      from: account.visibility,
      to: updated.visibility,
    },
    ip: clientIp(req.headers),
  });

  return NextResponse.json({ success: true, account: updated });
}
