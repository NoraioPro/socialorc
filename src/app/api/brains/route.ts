import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getOrCreateDefaultBrain } from "@/lib/brains";

/** List the signed-in user's brains (projects), creating the first one if none exist yet. */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await getOrCreateDefaultBrain(session.user.id);

  const brains = await prisma.brain.findMany({
    where: { userId: session.user.id },
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

/** Create a new brain (project) for the signed-in user. */
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

  if (!name) {
    return NextResponse.json({ error: "A brain needs a name." }, { status: 400 });
  }

  const brain = await prisma.brain.create({
    data: { userId: session.user.id, name, isDefault: false },
  });

  return NextResponse.json({ brain: { id: brain.id, name: brain.name, isDefault: brain.isDefault, connectedAccounts: 0 } });
}
