import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";
import { handleMessage, handleStatus, normaliseHandle, serialise, toDTO } from "@/lib/portfolio/server";
import { personalise, templateById } from "@/lib/portfolio/templates";
import { readPortfolioDoc } from "@/lib/portfolio/schema";

/** The caller's portfolio (or null), plus the profile fields used to pre-fill a new one. */
export async function GET() {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const [portfolio, profile] = await Promise.all([
    ownPortfolio(caller.userId),
    prisma.user.findUnique({ where: { id: caller.userId }, select: { name: true, headline: true, location: true, image: true, bio: true } }),
  ]);
  return NextResponse.json({ portfolio: portfolio ? await toDTO(portfolio) : null, profile });
}

const createSchema = z.object({
  handle: z.string().min(1).max(60),
  templateId: z.string().max(40).optional(),
  savedTemplateId: z.string().max(40).optional(),
  prefill: z.boolean().default(true),
});

/** Create the caller's one portfolio from a template (or blank). */
export async function POST(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return bad("Choose an address and a starting point.");
  if (await ownPortfolio(caller.userId)) return bad("You already have a portfolio. Start over from its dashboard instead.", 409);
  const handle = normaliseHandle(parsed.data.handle);
  const status = await handleStatus(handle);
  if (status !== "ok") return bad(handleMessage(status), 409);

  const user = await prisma.user.findUnique({ where: { id: caller.userId }, select: { name: true } });
  const name = (parsed.data.prefill && user?.name?.trim()) || "";
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
    doc = name ? personalise(tpl.make(), tpl.persona, name) : tpl.make();
  }
  const json = serialise(doc);
  const portfolio = await prisma.portfolio.create({
    data: {
      userId: caller.userId, handle, draftDoc: json, templateId,
      versions: { create: { kind: "CREATED", label: templateId ? `Created from ${templateById(templateId)?.name}` : "Created from a saved template", doc: json, createdById: caller.userId } },
    },
  });
  return NextResponse.json({ portfolio: await toDTO(portfolio) }, { status: 201 });
}
