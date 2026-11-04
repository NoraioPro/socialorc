import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { notFound, ownPortfolio, portfolioCaller } from "@/lib/portfolio/route-helpers";
import { toDTO } from "@/lib/portfolio/server";

/** Make a version the current draft. The draft it replaces is kept as "Draft before restore". */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const { id } = await params;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const version = await prisma.portfolioVersion.findFirst({ where: { id, portfolioId: current.id } });
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  const portfolio = await prisma.$transaction(async (tx) => {
    await tx.portfolioVersion.create({ data: { portfolioId: current.id, kind: "BEFORE_RESTORE", label: "Draft before restore", doc: current.draftDoc, createdById: caller.userId } });
    return tx.portfolio.update({ where: { id: current.id }, data: { draftDoc: version.doc, draftRevision: { increment: 1 } } });
  });
  return NextResponse.json({ portfolio: await toDTO(portfolio) });
}
