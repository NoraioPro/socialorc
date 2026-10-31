import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { tenantForUser } from "@/lib/tenancy/guard";
import { ACTIVE_BRAIN_COOKIE, ACTIVE_BRAIN_COOKIE_OPTIONS } from "@/lib/tenancy/active-brain";

/**
 * POST /api/brains/active — work in a different brand.
 *
 * The brain must belong to the caller's workspace; the cookie is a preference and
 * every query re-validates it.
 */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await tenantForUser(userId);
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const body = (await req.json().catch(() => ({}))) as { brainId?: unknown };
  const brainId = typeof body.brainId === "string" ? body.brainId : "";
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const brain = await prisma.brain.findFirst({
    where: { id: brainId, workspaceId: tenant.workspaceId },
    select: { id: true, name: true },
  });
  if (!brain) return NextResponse.json({ error: "That brand is not in this workspace." }, { status: 403 });

  const response = NextResponse.json({ success: true, brain });
  response.cookies.set(ACTIVE_BRAIN_COOKIE, brain.id, ACTIVE_BRAIN_COOKIE_OPTIONS);
  return response;
}
