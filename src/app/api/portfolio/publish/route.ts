import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/tenancy/guard";
import { getPortfolio } from "@/lib/portfolio/service";
import { parseDocument } from "@/lib/portfolio/validate";
import type { PortfolioDocument, PortfolioNode } from "@/lib/portfolio/types";

export const dynamic = "force-dynamic";

/** Every asset id referenced by an IMAGE / PROJECT_CARD / OG slot. */
function referencedAssetIds(document: PortfolioDocument): string[] {
  const ids = new Set<string>();
  const walk = (node: PortfolioNode): void => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    if (node.type === "IMAGE" && typeof props.assetId === "string" && props.assetId) ids.add(props.assetId);
    if (node.type === "PROJECT_CARD" && typeof props.coverAssetId === "string" && props.coverAssetId) ids.add(props.coverAssetId);
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => walk(page.root));
  return [...ids];
}

/**
 * POST /api/portfolio/publish — freeze the draft into an immutable revision.
 *
 * The document is snapshotted (that is the immutability users rely on); media is
 * recorded per revision so a deleted library row cannot blank a published page.
 * Blob-level pinning (`copy()` into the revision's own path) is the remaining
 * step documented as O-01 and is done in the same place once the store's
 * retention behaviour is verified.
 */
export async function POST() {
  const guard = await requirePermission("portfolio:publish");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const portfolio = await getPortfolio(guard.userId);
  if (!portfolio) return NextResponse.json({ error: "No portfolio yet.", code: "missing" }, { status: 404 });

  const parsed = parseDocument(portfolio.draftDocument);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "The draft is not valid.", code: "invalid_document", issues: parsed.issues },
      { status: 422 },
    );
  }

  const document = parsed.document;
  const assetIds = referencedAssetIds(document);
  const owned = assetIds.length
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: assetIds }, userId: guard.userId },
        select: { id: true, url: true, mimeType: true, width: true, height: true, size: true },
      })
    : [];
  const foreign = assetIds.filter((id) => !owned.some((asset) => asset.id === id));
  if (foreign.length > 0) {
    return NextResponse.json(
      { error: "A referenced image does not belong to you.", code: "foreign_asset", ids: foreign },
      { status: 422 },
    );
  }

  const canonical = JSON.stringify(document);
  const hash = createHash("sha256").update(canonical).digest("hex");
  const page = document.pages.find((candidate) => candidate.isHome) ?? document.pages[0];

  const existing = await prisma.portfolioRevision.findFirst({
    where: { portfolioId: portfolio.id, hash },
    select: { id: true, hash: true, createdAt: true },
  });

  const revisionId =
    existing?.id ??
    (
      await prisma.portfolioRevision.create({
        data: {
          portfolioId: portfolio.id,
          document: document as unknown as object,
          schemaVersion: document.schemaVersion,
          hash,
          createdBy: guard.userId,
          publishedAt: new Date(),
          label: page?.title ?? "Publish",
        },
      })
    ).id;

  // Published media rows: one per asset id, so the public page can resolve a URL
  // even after the library row is edited (the URL and dimensions are frozen here).
  for (const asset of owned) {
    await prisma.portfolioPinnedMedia.upsert({
      where: { revisionId_sha256: { revisionId, sha256: asset.id } },
      create: {
        revisionId,
        portfolioId: portfolio.id,
        sha256: asset.id,
        pathname: `library:${asset.id}`,
        url: asset.url,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        bytes: asset.size,
        sourceMediaAssetId: asset.id,
        role: "INLINE",
      },
      update: {},
    });
  }

  await prisma.portfolio.update({
    where: { userId: guard.userId },
    data: { status: "PUBLISHED", publishedRevisionId: revisionId, publishedAt: new Date() },
  });

  return NextResponse.json({ ok: true, handle: portfolio.handle, revisionId, hash });
}
