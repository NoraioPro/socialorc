import { Suspense } from "react";
import { notFound } from "next/navigation";
import { portfolioEnabled } from "@/lib/features";
import { PortfolioDashboard } from "@/components/portfolio/portfolio-dashboard";
import "@/components/portfolio/portfolio-site.css";
import "@/components/portfolio/editor/editor.css";

export default function PortfolioDashboardPage() {
  if (!portfolioEnabled()) notFound();
  return (
    <Suspense>
      <PortfolioDashboard />
    </Suspense>
  );
}
