import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { deleteKnowledgeSource } from "@/lib/brand-knowledge";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Delete a knowledge source and its chunks. A source from another workspace is
 * "not found", never "forbidden" — a 403 would confirm the id exists.
 */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const tenant = await requireWorkspace("brains:manage");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const { id } = await context.params;
  const deleted = await deleteKnowledgeSource(tenant.workspaceId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
