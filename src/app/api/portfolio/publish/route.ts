import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { notFound, ownPortfolio, portfolioCaller } from "@/lib/portfolio/route-helpers";
import { publishChecks, toDTO } from "@/lib/portfolio/server";
import { readPortfolioDoc } from "@/lib/portfolio/schema";

/** Publish the current draft: snapshot it as a PUBLISHED version and make it live. */
export async function POST() {
  const caller = portfolioCaller(await requirePermission("portfolio:publish"));
  if (!caller.ok) return caller.response;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const doc = readPortfolioDoc(current.draftDoc);
  const blocking = publishChecks(doc).filter((c) => c.level === "block");
  if (blocking.length) return NextResponse.json({ error: blocking[0].text, checks: blocking }, { status: 422 });
  const portfolio = await prisma.$transaction(async (tx) => {
    const version = await tx.portfolioVersion.create({ data: { portfolioId: current.id, kind: "PUBLISHED", doc: current.draftDoc, createdById: caller.userId } });
    return tx.portfolio.update({ where: { id: current.id }, data: { status: "PUBLISHED", publishedVersionId: version.id, publishedAt: new Date() } });
  });
  return NextResponse.json({ portfolio: await toDTO(portfolio) });
}

/** The checks the publish dialog shows, for the current draft. */
export async function GET() {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  return NextResponse.json({ checks: publishChecks(readPortfolioDoc(current.draftDoc)) });
}
