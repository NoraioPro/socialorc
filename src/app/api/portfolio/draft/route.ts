import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { bad, notFound, ownPortfolio, portfolioCaller, readJson } from "@/lib/portfolio/route-helpers";
import { maybeAutosaveVersion, parseOrError, serialise, toDTO } from "@/lib/portfolio/server";

const saveSchema = z.object({ doc: z.unknown(), baseRevision: z.number().int().min(0) });

/**
 * Autosave the draft. A save carrying an older revision than the stored one is
 * a conflict (another tab or device saved in between): 409 with the server copy.
 */
export async function PATCH(request: Request) {
  const caller = portfolioCaller(await requirePermission("portfolio:edit"));
  if (!caller.ok) return caller.response;
  const body = saveSchema.safeParse(await readJson(request));
  if (!body.success) return bad("Nothing to save.");
  const parsed = parseOrError(body.data.doc);
  if (!parsed.ok) return bad(parsed.error, 422);
  const current = await ownPortfolio(caller.userId);
  if (!current) return notFound();
  const json = serialise(parsed.doc);
  const updated = await prisma.portfolio.updateMany({
    where: { id: current.id, draftRevision: body.data.baseRevision },
    data: { draftDoc: json, draftRevision: { increment: 1 } },
  });
  if (updated.count === 0) {
    const latest = await ownPortfolio(caller.userId);
    return NextResponse.json({ error: "This page was changed in another tab or device.", portfolio: latest ? await toDTO(latest) : null }, { status: 409 });
  }
  if (current.draftDoc !== json) await maybeAutosaveVersion(current.id, current.draftDoc, caller.userId);
  return NextResponse.json({ revision: body.data.baseRevision + 1, savedAt: new Date().toISOString() });
}
