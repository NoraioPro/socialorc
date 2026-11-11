import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { capabilityLabel, getAccounts, tenantFor } from "@/lib/socialork/queries";
import { InboxList } from "@/components/socialork/inbox-list";
import { isRuleOn } from "@/lib/socialork/automations";
import { can } from "@/lib/roles";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const accounts = await getAccounts(tenant);
  const suggest = await isRuleOn(tenant.workspaceId, "suggestedReplies");

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

      {accounts.length > 0 && <InboxList canReply={can(tenant.role, "engagement:reply")} suggest={suggest} />}
    </div>
  );
}
