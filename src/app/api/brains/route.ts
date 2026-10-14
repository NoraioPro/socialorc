import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getOrCreateDefaultBrain } from "@/lib/brains";
import { requireWorkspace } from "@/lib/tenancy/guard";

/** List the workspace's brains (projects), creating the first one if none exist yet. */
export async function GET() {
  const tenant = await requireWorkspace("brains:read");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  await getOrCreateDefaultBrain(tenant);

  const brains = await prisma.brain.findMany({
    where: { workspaceId: tenant.workspaceId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { socialAccounts: true } } },
  });

  return NextResponse.json({
    brains: brains.map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault,
      connectedAccounts: b._count.socialAccounts,
    })),
  });
}

/** Create a new brain (project) in the caller's workspace. */
export async function POST(req: NextRequest) {
  // Creating a brain is a write into the workspace's configuration.
  const permission = await requireWorkspace("brains:manage");
  if (!permission.ok) {
    return NextResponse.json({ error: permission.error }, { status: permission.status });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

  if (!name) {
    return NextResponse.json({ error: "A brain needs a name." }, { status: 400 });
  }

  const brain = await prisma.brain.create({
    data: {
      userId: permission.userId,
      name,
      isDefault: false,
      workspaceId: permission.workspaceId,
    },
  });

  return NextResponse.json({ brain: { id: brain.id, name: brain.name, isDefault: brain.isDefault, connectedAccounts: 0 } });
}
