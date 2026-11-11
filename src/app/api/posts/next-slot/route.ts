import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { nextFreeSlot } from "@/lib/socialork/automations";

/** The next free publishing slot, so the composer can schedule in one click. */
export async function GET() {
  const guard = await requireWorkspace("posts:schedule");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const at = await nextFreeSlot(guard.workspaceId);
  return NextResponse.json({ at: at.toISOString() });
}
