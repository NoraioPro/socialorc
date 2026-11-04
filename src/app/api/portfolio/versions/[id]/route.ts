import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { notFound, ownPortfolio, portfolioCaller } from "@/lib/portfolio/route-helpers";
import { readPortfolioDoc } from "@/lib/portfolio/schema";

/** One version's document, for read-only viewing. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const { id } = await params;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const version = await prisma.portfolioVersion.findFirst({ where: { id, portfolioId: current.id } });
  if (!version) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  return NextResponse.json({ version: { id: version.id, kind: version.kind, label: version.label, createdAt: version.createdAt, doc: readPortfolioDoc(version.doc) } });
}
