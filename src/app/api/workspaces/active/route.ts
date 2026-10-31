import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_COOKIE_OPTIONS } from "@/lib/tenancy/active-workspace";

/**
 * POST /api/workspaces/active — switch the workspace this session looks at.
 *
 * The cookie is only a preference: it is accepted when the caller is a member of
 * that workspace, and ignored otherwise, so it can never widen access.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { workspaceId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
    select: { id: true, role: true, workspace: { select: { name: true } } },
  });
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of that workspace." }, { status: 403 });
  }

  const response = NextResponse.json({
    success: true,
    workspace: { id: workspaceId, name: membership.workspace.name, role: membership.role },
  });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);
  return response;
}
