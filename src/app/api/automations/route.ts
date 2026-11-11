import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { RULE_KEYS, getRuleState, runRule, setRule, type RuleKey } from "@/lib/socialork/automations";

async function actor(g: { workspaceId: string; userId: string }) {
  const u = await prisma.user.findUnique({ where: { id: g.userId }, select: { name: true, email: true } });
  return { workspaceId: g.workspaceId, userId: g.userId, label: u?.name ?? u?.email ?? null };
}

export async function GET() {
  const g = await requireWorkspace("dashboard:view");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ rules: await getRuleState(g.workspaceId) });
}

/** Body: { rule, on: boolean } to switch a rule, or { rule, run: true } to run it now. */
export async function POST(req: NextRequest) {
  const g = await requireWorkspace("posts:approve");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const body = await req.json().catch(() => null) as { rule?: string; on?: boolean; run?: boolean } | null;
  if (!body?.rule || !RULE_KEYS.includes(body.rule as RuleKey)) return NextResponse.json({ error: "Unknown rule" }, { status: 400 });
  const key = body.rule as RuleKey;
  const a = await actor(g);
  if (body.run) return NextResponse.json({ result: await runRule(a, key) });
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "Missing on" }, { status: 400 });
  await setRule(a, key, body.on);
  return NextResponse.json({ rules: await getRuleState(g.workspaceId) });
}
