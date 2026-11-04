import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, notFound, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";
import { handleMessage, handleStatus, normaliseHandle, REDIRECT_DAYS, toDTO } from "@/lib/portfolio/server";

const schema = z.object({ searchIndexing: z.boolean().optional(), handle: z.string().max(60).optional() });

/** Search indexing and the public address. A rename keeps the old address redirecting for 30 days. */
export async function PATCH(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return bad("Check the settings you sent.");
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const data: { searchIndexing?: boolean; handle?: string } = {};
  if (parsed.data.searchIndexing !== undefined) data.searchIndexing = parsed.data.searchIndexing;
  let renamedFrom: string | null = null;
  if (parsed.data.handle !== undefined) {
    const handle = normaliseHandle(parsed.data.handle);
    if (handle !== current.handle) {
      const status = await handleStatus(handle, current.id);
      if (status !== "ok") return bad(handleMessage(status), 409);
      data.handle = handle;
      renamedFrom = current.handle;
    }
  }
  const portfolio = await prisma.$transaction(async (tx) => {
    if (renamedFrom && data.handle) {
      await tx.portfolioRedirect.deleteMany({ where: { oldHandle: data.handle } });
      await tx.portfolioRedirect.upsert({
        where: { oldHandle: renamedFrom },
        create: { oldHandle: renamedFrom, portfolioId: current.id, expiresAt: new Date(Date.now() + REDIRECT_DAYS * 86_400_000) },
        update: { portfolioId: current.id, expiresAt: new Date(Date.now() + REDIRECT_DAYS * 86_400_000) },
      });
    }
    return tx.portfolio.update({ where: { id: current.id }, data });
  });
  return NextResponse.json({ portfolio: await toDTO(portfolio) });
}
