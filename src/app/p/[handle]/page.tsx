import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentRenderer, type RenderMedia } from "@/components/portfolio/render/document-renderer";
import { publishedRevisionByHandle } from "@/lib/portfolio/service";
import { parseDocument } from "@/lib/portfolio/validate";
import type { PortfolioDocument } from "@/lib/portfolio/types";

/**
 * The public portfolio (P3).
 *
 * Reads one row — the revision named by `publishedRevisionId` — and renders it
 * with the same renderer the editor uses. A draft is unreachable from here by
 * construction: the query filters on `status === "PUBLISHED"` and on a non-null
 * pointer, and the revision id is looked up with `portfolioId: row.id` so a
 * cross-portfolio pointer could not resolve even if the row were tampered with.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ handle: string }>;
}

function mediaMap(
  rows: { sha256: string; url: string; width: number | null; height: number | null; mimeType: string }[],
): Record<string, RenderMedia> {
  const out: Record<string, RenderMedia> = {};
  for (const row of rows) out[row.sha256] = { url: row.url, width: row.width, height: row.height, mimeType: row.mimeType };
  return out;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const published = await publishedRevisionByHandle(handle);
  if (!published) return { title: "Portfolio not found" };

  const parsed = parseDocument(published.revision.document);
  const page = parsed.ok ? parsed.document.pages.find((candidate) => candidate.isHome) ?? parsed.document.pages[0] : undefined;
  const title = page?.seo.title ?? page?.title ?? published.portfolio.handle;
  const description = page?.seo.description ?? "";
  const og = published.revision.ogImageSha ? published.media.find((item) => item.sha256 === published.revision.ogImageSha) : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `/p/${published.portfolio.handle}`,
      images: og ? [{ url: og.url, width: og.width ?? undefined, height: og.height ?? undefined }] : undefined,
    },
    twitter: { card: og ? "summary_large_image" : "summary", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function PublicPortfolioPage({ params }: PageProps) {
  const { handle } = await params;
  const published = await publishedRevisionByHandle(handle);
  if (!published) notFound();

  const parsed = parseDocument(published.revision.document);
  if (!parsed.ok) notFound();

  const document: PortfolioDocument = parsed.document;
  return <DocumentRenderer document={document} media={mediaMap(published.media)} />;
}
