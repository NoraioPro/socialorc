import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getCurrentUser, getShellData, tenantFor } from "@/lib/socialork/queries";
import { Shell } from "@/components/socialork/shell";
import "../socialork.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SocialOrk — Nothing goes out without a yes.",
  description:
    "Draft once, approve per channel, and publish across seven networks from one calendar.",
};

export default async function SocialOrkLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");

  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [shell, user] = await Promise.all([
    getShellData(tenant),
    getCurrentUser(tenant.userId),
  ]);

  return (
    <div className={`${hanken.variable} ${plexMono.variable}`} style={{ height: "100dvh" }}>
      <Shell
        workspaceName={shell.workspaceName}
        role={String(tenant.role)}
        userName={user?.name ?? ""}
        email={user?.email ?? session.user.email ?? ""}
        brains={shell.brains}
        accounts={shell.accounts}
        counts={shell.counts}
      >
        {children}
      </Shell>
    </div>
  );
}
