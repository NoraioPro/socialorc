import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { portfolioCaller } from "@/lib/portfolio/route-helpers";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const { id } = await params;
  const result = await prisma.portfolioTemplate.deleteMany({ where: { id, userId: caller.userId } });
  if (!result.count) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
