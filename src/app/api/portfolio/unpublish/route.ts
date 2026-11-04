import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { notFound, ownPortfolio, portfolioCaller } from "@/lib/portfolio/route-helpers";
import { toDTO } from "@/lib/portfolio/server";

/** Take the public page offline. Draft and versions are kept. */
export async function POST() {
  const caller = portfolioCaller(await requirePermission("portfolio:publish"));
  if (!caller.ok) return caller.response;
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const portfolio = await prisma.portfolio.update({ where: { id: current.id }, data: { status: current.status === "DRAFT" ? "DRAFT" : "UNPUBLISHED" } });
  return NextResponse.json({ portfolio: await toDTO(portfolio) });
}
