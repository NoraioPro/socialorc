import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { RECIPES, createWorkflow, deleteWorkflow, listWorkflows, runWorkflow, updateWorkflow, type RecipeKey } from "@/lib/socialork/autopilot";

/** Body: { action: "create"|"toggle"|"delete"|"run", id?, recipe?, platform? } */
export async function POST(req: NextRequest) {
  const g = await requireWorkspace("posts:approve");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => null) as { action?: string; id?: string; recipe?: string; platform?: string } | null;
  const u = await prisma.user.findUnique({ where: { id: g.userId }, select: { name: true, email: true } });
  const ctx = { workspaceId: g.workspaceId, userId: g.userId, label: u?.name ?? u?.email ?? null };
  if (b?.action === "create") {
    const def = RECIPES.find((r) => r.key === b.recipe);
    if (!def || !(b.platform && b.platform in Platform)) return NextResponse.json({ error: "Pick a recipe and a channel" }, { status: 400 });
    await createWorkflow(ctx, def.key as RecipeKey, b.platform as Platform);
    return NextResponse.json({ workflows: await listWorkflows(g.workspaceId) });
  }
  const w = (await listWorkflows(g.workspaceId)).find((x) => x.id === b?.id);
  if (!w) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (b?.action === "toggle") await updateWorkflow(g.workspaceId, w.id, { enabled: !w.enabled });
  else if (b?.action === "delete") await deleteWorkflow(g.workspaceId, w.id);
  else if (b?.action === "run") return NextResponse.json({ result: await runWorkflow(ctx, w), workflows: await listWorkflows(g.workspaceId) });
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  return NextResponse.json({ workflows: await listWorkflows(g.workspaceId) });
}
