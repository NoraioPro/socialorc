import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { teamsEnabled } from "@/lib/features";
import { isWorkspaceKind, onboardingRole } from "@/lib/onboarding";

/**
 * POST { kind: "PERSONAL" | "TEAM" } answers the first-run question for the
 * caller's own workspace. "TEAM" is refused while team features are disabled.
 */
export async function POST(req: NextRequest) {
  const guard = await requireWorkspace();
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => null)) as { kind?: unknown; role?: unknown } | null;
  if (!isWorkspaceKind(body?.kind)) {
    return NextResponse.json({ error: "Choose \"Just me\" or \"A team\"." }, { status: 400 });
  }
  if (body.kind === "TEAM" && !teamsEnabled()) {
    return NextResponse.json({ error: "Teams are not available yet." }, { status: 400 });
  }

  const role = onboardingRole(body.kind, body.role);
  if (!role) {
    return NextResponse.json({ error: "Choose one of the listed roles." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.workspace.update({ where: { id: guard.workspaceId }, data: { kind: body.kind } }),
    // Just me is ADMIN; a team creator holds the role they picked (ADMIN by default).
    prisma.user.update({
      where: { id: guard.userId },
      data: { onboardedAt: new Date(), role },
    }),
  ]);

  return NextResponse.json({ success: true, kind: body.kind, role });
}

export const dynamic = "force-dynamic";
