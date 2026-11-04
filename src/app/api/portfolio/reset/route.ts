import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, notFound, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";
import { serialise, toDTO } from "@/lib/portfolio/server";
import { personalise, templateById } from "@/lib/portfolio/templates";
import { readPortfolioDoc } from "@/lib/portfolio/schema";

const schema = z.object({ templateId: z.string().max(40).optional(), savedTemplateId: z.string().max(40).optional() });

/** Start over from a template. The current draft is kept as a version first; the live page is untouched. */
export async function POST(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) return bad("Choose a starting point.");
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const owner = readPortfolioDoc(current.draftDoc).owner;
  let doc;
  let templateId: string | null = null;
  if (parsed.data.savedTemplateId) {
    const saved = await prisma.portfolioTemplate.findFirst({ where: { id: parsed.data.savedTemplateId, userId: caller.userId } });
    if (!saved) return bad("That saved template no longer exists.", 404);
    doc = readPortfolioDoc(saved.doc);
  } else {
    const tpl = templateById(parsed.data.templateId ?? "blank");
    if (!tpl) return bad("Unknown template.");
    templateId = tpl.id;
    doc = personalise(tpl.make(), tpl.persona, owner.name);
  }
  const portfolio = await prisma.$transaction(async (tx) => {
    await tx.portfolioVersion.create({ data: { portfolioId: current.id, kind: "BEFORE_RESTORE", label: "Before starting over", doc: current.draftDoc, createdById: caller.userId } });
    return tx.portfolio.update({ where: { id: current.id }, data: { draftDoc: serialise(doc), draftRevision: { increment: 1 }, templateId: templateId ?? current.templateId } });
  });
  return NextResponse.json({ portfolio: await toDTO(portfolio) });
}
