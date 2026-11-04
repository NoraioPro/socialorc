import type { Metadata } from "next";
import { PortfolioPreview } from "@/components/portfolio/portfolio-preview";

export const metadata: Metadata = { title: "Portfolio preview · SocialOrk", robots: { index: false } };

export default function PortfolioPreviewPage() {
  return <PortfolioPreview />;
}
