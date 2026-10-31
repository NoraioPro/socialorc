import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { capabilityLabel, getAccounts, getCurrentUser, getShellData, tenantFor } from "@/lib/socialork/queries";
import { ConnectButton } from "@/components/socialork/connect-button";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [accounts, shell, user] = await Promise.all([
    getAccounts(tenant),
    getShellData(tenant),
    getCurrentUser(tenant.userId),
  ]);

  const connected = new Set(accounts.map((a) => a.platform));
  const reconnect = accounts.filter((a) => a.needsReconnect);
  const missing = ALL_PLATFORMS.filter((p) => !connected.has(p));

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Settings</h1>
        <p className="so-sub">
          Your profile, this workspace, and what is configured, missing or broken.
        </p>
      </div>

      <div className="so-grid so-grid-2" style={{ alignItems: "start" }}>
        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-stat-label">Profile</div>
          </div>
          <div className="so-card-pad" style={{ display: "grid", gap: 8 }}>
            <div className="so-row"><span className="so-stat-label" style={{ width: 110 }}>Name</span><span>{user?.name ?? "—"}</span></div>
            <div className="so-row"><span className="so-stat-label" style={{ width: 110 }}>Email</span><span>{user?.email ?? "—"}</span></div>
            <div className="so-row"><span className="so-stat-label" style={{ width: 110 }}>Role</span>
              <span className="so-pill" data-tone="approved">{String(tenant.role).toLowerCase()}</span>
            </div>
            <div className="so-row"><span className="so-stat-label" style={{ width: 110 }}>Workspace</span><span>{shell.workspaceName}</span></div>
            <div className="so-row"><span className="so-stat-label" style={{ width: 110 }}>Time zone</span><span className="so-mono">Europe/Oslo</span></div>
          </div>
        </section>

        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-row">
              <span className="so-stat-label">Connections</span>
              <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                {accounts.length} of {ALL_PLATFORMS.length} connected
                {reconnect.length ? ` · ${reconnect.length} needs reconnecting` : ""}
              </span>
            </div>
          </div>
          <div style={{ display: "grid" }}>
            {ALL_PLATFORMS.map((platform) => {
              const account = accounts.find((a) => a.platform === platform);
              return (
                <div key={platform} className="so-row" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", gap: 10 }}>
                  <span style={{ fontWeight: 600, minWidth: 90 }}>{PLATFORM_CONFIGS[platform]?.name ?? platform}</span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                    {account?.platformUsername ? `@${account.platformUsername}` : "not connected"}
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="so-pill">{capabilityLabel(platform)}</span>
                    {account?.needsReconnect ? (
                      <ConnectButton platform={platform} label="Reconnect" />
                    ) : account ? (
                      <span className="so-pill" data-tone="approved">Connected</span>
                    ) : (
                      <ConnectButton platform={platform} />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="so-grid so-grid-2">
        <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="so-stat-label">AI keys</div>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
            Generation runs on a key you or this workspace supplied. With no key, drafts are written
            by hand and the product says so.
          </p>
          <a href="/socialork/settings/ai" className="so-btn" style={{ justifySelf: "start", textDecoration: "none" }}>Manage AI keys</a>
        </section>

        <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="so-stat-label">Brand Brain</div>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
            Voice, audience and words to avoid. Stored per workspace; generation does not read it yet.
          </p>
          <a href="/socialork/settings/brand" className="so-btn" style={{ justifySelf: "start", textDecoration: "none" }}>Open Brand Brain</a>
        </section>
      </div>

      {missing.length > 0 ? (
        <div className="so-frame">
          Not connected: {missing.map((p) => PLATFORM_CONFIGS[p]?.name ?? p).join(" · ")}. Connecting a
          channel needs that platform's developer app credentials in the deployment — Settings names
          the missing variables rather than failing silently.
        </div>
      ) : null}
    </div>
  );
}
