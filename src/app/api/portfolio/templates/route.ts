import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, notFound, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";
import { readPortfolioDoc } from "@/lib/portfolio/schema";

/** The caller's saved templates, with documents (for thumbnails). */
export async function GET() {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const rows = await prisma.portfolioTemplate.findMany({ where: { userId: caller.userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json({ templates: rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, doc: readPortfolioDoc(r.doc) })) });
}

/** "Save as my template": snapshot the current draft. */
export async function POST(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const parsed = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await readJson(request));
  if (!parsed.success) return bad("Give the template a name.");
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  if ((await prisma.portfolioTemplate.count({ where: { userId: caller.userId } })) >= 20) return bad("You can keep up to 20 templates. Delete one first.", 409);
  const row = await prisma.portfolioTemplate.create({ data: { userId: caller.userId, name: parsed.data.name, doc: current.draftDoc } });
  return NextResponse.json({ template: { id: row.id, name: row.name, createdAt: row.createdAt, doc: readPortfolioDoc(row.doc) } }, { status: 201 });
}
