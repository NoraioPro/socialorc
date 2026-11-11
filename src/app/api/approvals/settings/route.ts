import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { getClientSignOff, setClientSignOff } from "@/lib/socialork/approval-settings";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  const g = await requireWorkspace("dashboard:view");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ clientSignOff: await getClientSignOff(g.workspaceId) });
}

export async function POST(req: NextRequest) {
  const g = await requireWorkspace("posts:approve");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => null) as { clientSignOff?: boolean } | null;
  if (typeof b?.clientSignOff !== "boolean") return NextResponse.json({ error: "Missing clientSignOff" }, { status: 400 });
  await setClientSignOff(g.workspaceId, b.clientSignOff);
  await recordAudit({ workspaceId: g.workspaceId, actorId: g.userId, action: "AUTOMATION_TOGGLED", subjectType: "WORKSPACE", detail: { rule: "clientSignOff", on: b.clientSignOff } });
  return NextResponse.json({ clientSignOff: b.clientSignOff });
}
