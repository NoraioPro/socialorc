import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { capabilityLabel, getAccounts, tenantFor } from "@/lib/socialork/queries";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { SettingsShell } from "@/components/socialork/settings-shell";
import { readinessReport } from "@/lib/social/readiness";
import { recentAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALL = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [account, accounts, workspace, key, readiness, audit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: tenant.userId },
      select: { name: true, email: true, timezone: true },
    }),
    getAccounts(tenant),
    prisma.workspace.findUnique({ where: { id: tenant.workspaceId }, select: { name: true } }),
    prisma.aiCredential.findFirst({
      where: { OR: [{ userId: tenant.userId }, { workspaceId: tenant.workspaceId }] },
      select: { id: true },
    }),
    readinessReport(),
    recentAudit(tenant.workspaceId, 60),
  ]);

  const connections = ALL.map((platform) => {
    const match = accounts.find((a) => a.platform === platform);
    return {
      platform,
      name: PLATFORM_CONFIGS[platform]?.name ?? platform,
      handle: match?.platformUsername ?? null,
      capability: capabilityLabel(platform),
      state: match ? (match.needsReconnect ? ("reconnect" as const) : ("connected" as const)) : ("missing" as const),
      configured: readiness.platforms.find((r) => r.platform === platform)?.state === "ready",
      missing: readiness.platforms.find((r) => r.platform === platform)?.missing ?? [],
      redirectUri: readiness.platforms.find((r) => r.platform === platform)?.redirectUri ?? null,
    };
  });

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Settings</h1>
        <p className="so-sub">
          Your profile, this workspace, and what is configured, missing or broken.
        </p>
      </div>
      <SettingsShell
        profile={{
          name: account?.name ?? "",
          email: account?.email ?? session.user.email ?? "",
          timezone: account?.timezone ?? "Europe/Oslo",
        }}
        workspaceName={workspace?.name ?? "Workspace"}
        role={String(tenant.role)}
        connections={connections}
        aiConfigured={Boolean(key)}
        audit={audit.map((a) => ({
          id: a.id,
          action: a.action,
          actor: a.actorLabel ?? (a.actorId ? "a teammate" : "system"),
          subject: `${a.subjectType.toLowerCase()}${a.subjectId ? ` · ${a.subjectId.slice(-6)}` : ""}`,
          ip: a.ip ?? "—",
          when: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
