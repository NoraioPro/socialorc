import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/tenancy/guard";
import { getPortfolio } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

/** POST /api/portfolio/unpublish — the public URL stops resolving; history stays. */
export async function POST() {
  const guard = await requirePermission("portfolio:publish");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const portfolio = await getPortfolio(guard.userId);
  if (!portfolio) return NextResponse.json({ error: "No portfolio yet.", code: "missing" }, { status: 404 });
  if (portfolio.status !== "PUBLISHED") {
    return NextResponse.json({ error: "This portfolio is not published.", code: "not_published" }, { status: 409 });
  }

  await prisma.portfolio.update({
    where: { userId: guard.userId },
    data: { status: "DRAFT", publishedRevisionId: null, publishedAt: null },
  });

  return NextResponse.json({ ok: true, handle: portfolio.handle });
}
