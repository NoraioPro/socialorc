import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { capabilityLabel, getAccounts, tenantFor } from "@/lib/socialork/queries";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { SettingsShell } from "@/components/socialork/settings-shell";
import { readinessReport } from "@/lib/social/readiness";
import { overridesForCurrentUser, withPlatformEnv } from "@/lib/platform-env";
import { recentAudit } from "@/lib/audit";
import { can, parseRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ALL = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  // The redirect URI a teammate is told to register has to be the origin they
  // are actually using, not whatever APP_URL happens to say.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const requestOrigin = host ? `${proto}://${host}` : undefined;

  const [account, accounts, workspace, key, readiness, audit] = await Promise.all([
    prisma.user.findUnique({
      where: { id: tenant.userId },
      select: { name: true, email: true, timezone: true, headline: true, bio: true, location: true, website: true },
    }),
    getAccounts(tenant),
    prisma.workspace.findUnique({ where: { id: tenant.workspaceId }, select: { name: true } }),
    prisma.aiCredential.findFirst({
      where: { OR: [{ userId: tenant.userId }, { workspaceId: tenant.workspaceId }] },
      select: { id: true },
    }),
    // The readiness guide must report what THIS workspace can actually do. When
    // the workspace stored its own OAuth app (Settings → App credentials), the
    // connect flow and every callback already use those values — so the screen
    // has to be evaluated under the same overrides, or it keeps telling an owner
    // who did configure their app to "set FACEBOOK_APP_ID in the deployment".
    overridesForCurrentUser().then((overrides) =>
      withPlatformEnv(overrides, () => readinessReport({}, requestOrigin)),
    ),
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
      accountId: match?.id ?? null,
      owner: match ? (match.userId === tenant.userId ? "you" : (match.user?.name ?? match.user?.email ?? "a teammate")) : null,
      visibility: match?.visibility ?? null,
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
          headline: account?.headline ?? "",
          bio: account?.bio ?? "",
          location: account?.location ?? "",
          website: account?.website ?? "",
        }}
        workspaceName={workspace?.name ?? "Workspace"}
        role={String(tenant.role)}
        canConfigure={can(parseRole(String(tenant.role)), "brains:manage")}
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
