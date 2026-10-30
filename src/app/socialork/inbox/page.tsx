import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { capabilityLabel, getAccounts, tenantFor } from "@/lib/socialork/queries";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const accounts = await getAccounts(tenant);

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Inbox</h1>
        <p className="so-sub">
          Comments, mentions and messages from connected channels. A channel that cannot share them
          is labelled here, so an empty list never hides that.
        </p>
      </div>

      <section className="so-card">
        <table className="so-table">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Account</th>
              <th>Access</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="so-empty">
                  No channel is connected. <a href="/socialork/settings">Connect one</a> to see
                  comments and mentions here.
                </td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{PLATFORM_CONFIGS[a.platform]?.name ?? a.platform}</td>
                  <td className="so-mono" style={{ color: "var(--text2)" }}>
                    {a.platformUsername ? `@${a.platformUsername}` : "—"}
                  </td>
                  <td>
                    <span className="so-pill">{capabilityLabel(a.platform)}</span>
                  </td>
                  <td>
                    {a.needsReconnect ? (
                      <span className="so-pill" data-tone="failed">Reconnect</span>
                    ) : a.isActive ? (
                      <span className="so-pill" data-tone="approved">Connected</span>
                    ) : (
                      <span className="so-pill">Paused</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="so-frame">
        Reading comments and mentions is per-platform work: the capability column above is the
        server's own platform registry, not a promise. Where a channel is marked “Not available”,
        the network's API does not expose that data to this app at all.
      </div>
    </div>
  );
}
