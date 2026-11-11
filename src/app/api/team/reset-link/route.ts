import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { mintResetToken } from "@/lib/password-reset";
import { recordAudit } from "@/lib/audit";

/** POST { userId } — an admin creates a 2-hour password reset link for a member of their workspace. */
export async function POST(req: NextRequest) {
  const g = await requireWorkspace("users:manage");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = (await req.json().catch(() => null)) as { userId?: string } | null;
  if (!b?.userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: g.workspaceId, userId: b.userId }, select: { user: { select: { id: true, email: true, password: true } } } });
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (!member.user.password) return NextResponse.json({ error: "This member signs in with a provider, not a password." }, { status: 400 });
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = `${req.headers.get("x-forwarded-proto") ?? "http"}://${host}`;
  await recordAudit({ workspaceId: g.workspaceId, actorId: g.userId, action: "AUTOMATION_TOGGLED", subjectType: "MEMBER", subjectId: member.user.id, detail: { rule: "passwordResetLink", message: `Reset link created for ${member.user.email}` } });
  return NextResponse.json({ url: `${origin}/reset/${mintResetToken(member.user.id, member.user.password)}`, expiresInHours: 2 });
}
