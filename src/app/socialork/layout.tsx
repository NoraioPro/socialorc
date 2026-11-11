import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { getBrains, getCurrentUser, getShellData, tenantFor } from "@/lib/socialork/queries";
import { activeBrainId } from "@/lib/tenancy/active-brain";
import { getLang } from "@/lib/socialork/lang";
import { Shell } from "@/components/socialork/shell";
import "../socialork.css";
import "../socialork-lively.css";

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

/** Arabic text: the Timeline's Arabic mode and anything people write in Arabic. */
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
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

  // Same first-run rule as the dashboard layout: a workspace that has not chosen
  // person-or-team yet goes through onboarding before it sees the app.
  const account = await prisma.user.findUnique({
    where: { id: tenant.userId },
    select: { onboardedAt: true },
  });
  if (account && needsOnboarding(account.onboardedAt)) redirect("/onboarding");

  const lang = await getLang();
  const [shell, user, brains, brainId] = await Promise.all([
    getShellData(tenant),
    getCurrentUser(tenant.userId),
    getBrains(tenant),
    activeBrainId(tenant),
  ]);

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className={`${hanken.variable} ${plexMono.variable} ${plexArabic.variable}`} style={{ height: "100dvh", fontFamily: lang === "ar" ? "var(--font-plex-arabic), var(--font-hanken), system-ui, sans-serif" : undefined }}>
      <Shell
        workspaceName={shell.workspaceName}
        role={String(tenant.role)}
        userName={user?.name ?? ""}
        email={user?.email ?? session.user.email ?? ""}
        brains={shell.brains}
        accounts={shell.accounts}
        counts={shell.counts}
        brainsList={brains.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault }))}
        activeBrainId={brainId}
        lang={lang}
      >
        {children}
      </Shell>
    </div>
  );
}
