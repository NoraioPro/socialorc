import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

/**
 * The workspaces this user belongs to.
 *
 * The AI settings page has been calling this since it was written, to learn which
 * workspace scope to offer, and the route did not exist — so the request 404'd on
 * every visit and the Workspace tab stayed silently disabled. It answers with what
 * the membership table actually holds, which on most deployments is one workspace
 * per user (Phase 0: a new account starts its own).
 *
 * Note there is still no workspace *filtering* anywhere: this reports membership,
 * it does not isolate data. See src/lib/workspace.ts and docs/SAAS-PLAN.md.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const workspaces = memberships
    .filter((membership) => membership.workspace)
    .map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      membershipRole: membership.role,
      createdAt: membership.workspace.createdAt,
    }));

  return NextResponse.json({ workspaces });
}

const CREATE_LIMIT = 10;

/** POST /api/workspaces — a member may create another workspace and own it. */
export async function POST(req: Request) {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; kind?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (name.length < 2) {
    return NextResponse.json({ error: "Give the workspace a name (at least 2 characters)." }, { status: 400 });
  }
  const kind = body.kind === "TEAM" ? "TEAM" : "PERSONAL";

  const owned = await prisma.workspace.count({ where: { members: { some: { userId } } } });
  if (owned >= CREATE_LIMIT) {
    return NextResponse.json({ error: `You already belong to ${owned} workspaces.` }, { status: 400 });
  }

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
  let slug = slugBase;
  for (let i = 1; i < 50; i += 1) {
    const clash = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${slugBase}-${i}`;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      kind,
      members: { create: { userId, role: "OWNER" } },
    },
    select: { id: true, name: true, kind: true },
  });

  return NextResponse.json({ workspace }, { status: 201 });
}
