import { requirePermission } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { Builder } from "@/components/portfolio/editor/builder";
import { CreatePortfolio } from "@/components/portfolio/editor/create-portfolio";
import { getPortfolio } from "@/lib/portfolio/service";
import { parseDocument } from "@/lib/portfolio/validate";
import type { RenderMedia } from "@/components/portfolio/render/document-renderer";
import type { PortfolioDocument, PortfolioNode } from "@/lib/portfolio/types";

export const dynamic = "force-dynamic";

function referencedAssetIds(document: PortfolioDocument): string[] {
  const ids = new Set<string>();
  const walk = (node: PortfolioNode): void => {
    const props = (node.props ?? {}) as Record<string, unknown>;
    if (typeof props.assetId === "string" && props.assetId) ids.add(props.assetId);
    if (typeof props.coverAssetId === "string" && props.coverAssetId) ids.add(props.coverAssetId);
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => walk(page.root));
  return [...ids];
}

export default async function PortfolioPage() {
  const guard = await requirePermission("portfolio:edit");
  if (!guard.ok) {
    return (
      <div style={{ padding: 40, color: "#ededf1" }}>
        <h1 style={{ fontSize: 20 }}>Portfolio</h1>
        <p style={{ color: "#a6a6b0", fontSize: 13.5 }}>{guard.error}</p>
      </div>
    );
  }

  const row = await getPortfolio(guard.userId);
  if (!row) return <CreatePortfolio />;

  const parsed = parseDocument(row.draftDocument);
  if (!parsed.ok) {
    return (
      <div style={{ padding: 40, color: "#ededf1" }}>
        <h1 style={{ fontSize: 20 }}>The saved draft is not valid</h1>
        <pre style={{ fontSize: 12, color: "#a6a6b0", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(parsed.issues.slice(0, 6), null, 2)}
        </pre>
      </div>
    );
  }

  const ids = referencedAssetIds(parsed.document);
  const assets = ids.length
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: ids }, userId: guard.userId },
        select: { id: true, url: true, width: true, height: true, mimeType: true },
      })
    : [];
  const media: Record<string, RenderMedia> = {};
  for (const asset of assets) media[asset.id] = { url: asset.url, width: asset.width, height: asset.height, mimeType: asset.mimeType };

  return (
    <Builder
      initialDocument={parsed.document}
      initialVersion={row.documentVersion}
      handle={row.handle}
      status={row.status}
      media={media}
    />
  );
}
