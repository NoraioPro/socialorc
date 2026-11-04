import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, notFound, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";

/** Version history, newest first (without the documents). */
export async function GET() {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const versions = await prisma.portfolioVersion.findMany({
    where: { portfolioId: current.id }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, kind: true, label: true, createdAt: true },
  });
  return NextResponse.json({ versions: versions.map((v) => ({ ...v, live: v.id === current.publishedVersionId && current.status === "PUBLISHED" })) });
}

/** Save the current draft as a named version. */
export async function POST(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const parsed = z.object({ label: z.string().trim().max(80).optional() }).safeParse(await readJson(request) ?? {});
  if (!parsed.success) return bad("Give the version a shorter name.");
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const version = await prisma.portfolioVersion.create({
    data: { portfolioId: current.id, kind: "NAMED", label: parsed.data.label || "Named version", doc: current.draftDoc, createdById: caller.userId },
    select: { id: true, kind: true, label: true, createdAt: true },
  });
  return NextResponse.json({ version }, { status: 201 });
}
