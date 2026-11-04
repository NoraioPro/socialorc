import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { needsOnboarding } from "@/lib/onboarding";
import { portfolioEnabled } from "@/lib/features";
import { portfolioFontVars } from "@/components/portfolio/fonts";
import "@/components/portfolio/portfolio-site.css";
import "@/components/portfolio/editor/editor.css";

/** Full-screen portfolio editor and preview: signed in, onboarded, no app sidebar. */
export default async function PortfolioToolsLayout({ children }: { children: React.ReactNode }) {
  if (!portfolioEnabled()) notFound();
  const session = await getAuthSession();
  if (!session?.user) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardedAt: true } });
  if (user && needsOnboarding(user.onboardedAt)) redirect("/onboarding");
  return <div className={portfolioFontVars}>{children}</div>;
}
