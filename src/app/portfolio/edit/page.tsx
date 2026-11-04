import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { PortfolioEditor } from "@/components/portfolio/editor/portfolio-editor";

export const metadata: Metadata = { title: "Portfolio editor · SocialOrk" };

export default async function PortfolioEditPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  return <PortfolioEditor userId={session.user.id} userEmail={session.user.email ?? ""} />;
}
