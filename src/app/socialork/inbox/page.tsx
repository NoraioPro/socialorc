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

      {accounts.length === 0 ? (
        <div className="so-frame">
          No channel is connected. <a href="/socialork/settings">Settings → Connections</a> explains
          how to connect one, step by step.
        </div>
      ) : (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
          {accounts.map((a) => {
            const state = a.needsReconnect ? "Reconnect" : a.isActive ? "Connected" : "Paused";
            const dot = a.needsReconnect ? "var(--red)" : a.isActive ? "var(--green)" : "var(--text3)";
            const name = PLATFORM_CONFIGS[a.platform]?.name ?? a.platform;
            return (
              <li
                key={a.id}
                title={`${name}${a.platformUsername ? ` @${a.platformUsername}` : ""} · ${capabilityLabel(a.platform)}`}
                style={{
                  height: 30, display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
                  border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontWeight: 500 }}>{name}</span>
                {a.platformUsername ? (
                  <span className="so-mono" style={{ color: "var(--text2)" }}>@{a.platformUsername}</span>
                ) : null}
                <span style={{ color: "var(--text3)" }}>{capabilityLabel(a.platform)}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text3)" }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: dot }} />
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <section className="so-card" style={{ overflow: "hidden", maxWidth: 560 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12.5, color: "var(--text2)" }}>
          0 messages
        </div>
        <div className="so-empty" style={{ padding: "28px 16px" }}>
          <svg width="150" height="110" viewBox="0 0 150 110" fill="none" aria-hidden style={{ margin: "0 auto 4px", display: "block", overflow: "visible" }}>
            <path d="M25 58 40 26h70l15 32v26a8 8 0 0 1-8 8H33a8 8 0 0 1-8-8z" fill="var(--panel2)" stroke="var(--line2)" />
            <path d="M25 58h30l6 10h28l6-10h30" stroke="var(--line2)" />
          </svg>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>Nothing to show yet</div>
          <div>Comments and messages from channels that share them will land here.</div>
        </div>
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text3)" }}>
          Where a channel is marked &ldquo;Not available&rdquo;, the network&apos;s API does not expose
          that data to this app at all. LinkedIn and TikTok don&apos;t share comments with third-party apps.
        </div>
      </section>
    </div>
  );
}
