import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getOverview, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { RULES, getAutomationStats, getRuleState } from "@/lib/socialork/automations";
import { AutomationRules } from "@/components/socialork/automation-rules";
import { can } from "@/lib/roles";
import { PageHead, Stat, card } from "@/components/socialork/design-bits";

export const dynamic = "force-dynamic";

const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;

export default async function AutomationsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, state, stats] = await Promise.all([getOverview(tenant), getRuleState(tenant.workspaceId), getAutomationStats(tenant.workspaceId)]);
  const runs = stats.runs;
  const canEdit = can(tenant.role, "posts:approve");
  const ruleName = Object.fromEntries(RULES.map((r) => [r.key, r.name]));
  const onCount = Object.values(state).filter(Boolean).length;

  return (
    <div className="so-page">
      <PageHead title="Automations">
        Small rules that do the next step for you, so the team and your clients click less. Each rule says what it replaces. Every run is logged and approval rules still apply.
      </PageHead>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Stat label="Rules on" value={onCount} sub={`Of ${RULES.length} rules`} />
        <Stat label="Clicks saved" value={stats.clicks} sub={`From ${stats.total} logged runs`} />
        <Stat label="Waiting for approval" value={overview.counts.PENDING_APPROVAL ?? 0} sub="What reminders would cover" />
        <Stat label="Failed posts" value={overview.counts.FAILED ?? 0} sub="What retries would cover" />
      </div>

      <AutomationRules rules={RULES.map((r) => ({ ...r, on: state[r.key], runs: stats.perRule[r.key] ?? 0, canEdit }))} />

      <section style={card}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>Recent runs</div>
        {runs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>No runs yet.</div>
        ) : (
          runs.map((l, i) => (
            <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", padding: "10px 18px", borderTop: i ? "1px solid var(--line)" : 0, fontSize: 12.5 }}>
              <span style={{ width: 120, flex: "none", ...mono, fontSize: 11.5, color: "var(--text3)" }}>{relativeTime(l.at)}</span>
              <span style={{ width: 210, flex: "none", color: "var(--text2)" }}>{ruleName[l.rule] ?? l.rule}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{l.message}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
