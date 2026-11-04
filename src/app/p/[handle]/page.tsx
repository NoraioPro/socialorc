import type { Metadata } from "next";
import "@/components/portfolio/portfolio-site.css";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import prisma from "@/lib/prisma";
import { portfolioEnabled } from "@/lib/features";
import { readPortfolioDoc } from "@/lib/portfolio/schema";
import { normaliseHandle } from "@/lib/portfolio/server";
import { PortfolioView } from "@/components/portfolio/render";
import type { PortfolioDoc } from "@/lib/portfolio/types";

/**
 * The public portfolio. Only the PUBLISHED version is ever shown: draft edits
 * stay private until the owner publishes. Rendered on the server; responsive
 * through the compiled container-query stylesheet, with no client JavaScript.
 */

type Resolved =
  | { kind: "live"; doc: PortfolioDoc; handle: string; index: boolean }
  | { kind: "offline"; name: string; initials: string }
  | { kind: "missing" }
  | { kind: "moved"; to: string };

async function resolve(raw: string): Promise<Resolved> {
  await connection();
  if (!portfolioEnabled()) return { kind: "missing" };
  const handle = normaliseHandle(decodeURIComponent(raw));
  const portfolio = await prisma.portfolio.findUnique({ where: { handle } });
  if (!portfolio) {
    const redirect = await prisma.portfolioRedirect.findUnique({ where: { oldHandle: handle }, include: { portfolio: { select: { handle: true } } } });
    if (redirect && redirect.expiresAt > new Date()) return { kind: "moved", to: redirect.portfolio.handle };
    return { kind: "missing" };
  }
  if (portfolio.status !== "PUBLISHED" || !portfolio.publishedVersionId) {
    const owner = readPortfolioDoc(portfolio.draftDoc).owner;
    return { kind: "offline", name: owner.name, initials: owner.initials };
  }
  const version = await prisma.portfolioVersion.findUnique({ where: { id: portfolio.publishedVersionId }, select: { doc: true } });
  if (!version) return { kind: "missing" };
  return { kind: "live", doc: readPortfolioDoc(version.doc), handle: portfolio.handle, index: portfolio.searchIndexing };
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const r = await resolve((await params).handle);
  if (r.kind !== "live") return { title: "Portfolio", robots: { index: false, follow: false } };
  const title = r.doc.seo.title || r.doc.owner.name || r.handle;
  const description = r.doc.seo.desc || undefined;
  return {
    title,
    description,
    robots: r.index ? undefined : { index: false, follow: false },
    openGraph: { title, description, type: "profile" },
    alternates: { canonical: `/p/${r.handle}` },
  };
}

export default async function PublicPortfolioPage({ params }: { params: Promise<{ handle: string }> }) {
  const r = await resolve((await params).handle);
  if (r.kind === "moved") permanentRedirect(`/p/${r.to}`);
  if (r.kind === "missing") notFound();
  if (r.kind === "offline") {
    return (
      <main className="pf-public-state">
        <div>
          <span className="pf-public-mono">{r.initials}</span>
          <h1>{r.name ? `${r.name}’s portfolio isn’t public right now` : "This portfolio isn’t public right now"}</h1>
          <p>The page exists, but its owner has taken it offline. Check back later.</p>
          <p className="pf-public-small">Is this your page? <Link href="/socialork/portfolio">Sign in to publish it</Link></p>
        </div>
      </main>
    );
  }
  return (
    <main className="pf-public">
      <PortfolioView doc={r.doc} scope="live" />
      <Link href="/" className="pf-public-badge">Built with SocialOrk</Link>
    </main>
  );
}
