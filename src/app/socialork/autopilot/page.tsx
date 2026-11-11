import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getOverview, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { getRecentRuns } from "@/lib/socialork/audit-log";
import { RECIPES, listWorkflows } from "@/lib/socialork/autopilot";
import { AutopilotWorkflows } from "@/components/socialork/autopilot-workflows";
import { can } from "@/lib/roles";
import { Empty, Panel, PageHead, Stat } from "@/components/socialork/design-bits";

export const dynamic = "force-dynamic";

const rules = [
  { label: "A person approves every post", sub: "Nothing is published without a human decision.", locked: true },
  { label: "Clients can approve on their own account", sub: "Roles are set under Team.", locked: false },
];

export default async function AutopilotPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, runs, workflows] = await Promise.all([getOverview(tenant), getRecentRuns(tenant), listWorkflows(tenant.workspaceId)]);
  const c = overview.counts;
  const pending = c.PENDING_APPROVAL ?? 0;

  return (
    <div className="so-page">
      <PageHead
        title="Autopilot"
        actions={
          <Link href="/socialork/approvals" className="so-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Quick review
            <span style={{ ...{ font: "500 11px 'IBM Plex Mono', monospace" }, padding: "1px 6px", borderRadius: 5, background: "var(--amberSoft)", color: "var(--amber)" }}>{pending}</span>
          </Link>
        }
      >
        Workflows that draft, check and schedule posts on every channel. Nothing goes out unless it passes your approval rules.
      </PageHead>


      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Stat label="Waiting for approval" value={pending} sub="Posts in review" color={pending ? "var(--amber)" : undefined} />
        <Stat label="Scheduled" value={c.SCHEDULED ?? 0} sub="Queued to publish" />
        <Stat label="Published, 30 days" value={overview.published30} sub="Went out on a channel" color="var(--green)" />
        <Stat label="Failed" value={c.FAILED ?? 0} sub="Need a retry" color={c.FAILED ? "var(--red)" : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, gridColumn: "span 1" }}>
          <AutopilotWorkflows recipes={RECIPES} initial={workflows} canEdit={can(tenant.role, "posts:approve")} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Approval rules" sub="Apply to every person. Edit roles under Team.">
            {rules.map((r, i) => (
              <div key={r.label} style={{ display: "flex", gap: 12, padding: "12px 16px", borderTop: i ? "1px solid var(--line)" : 0 }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: "block", fontWeight: 500 }}>{r.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>{r.sub}</span>
                </span>
                {r.locked ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--panel2)", color: "var(--text2)", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Always on</span> : null}
              </div>
            ))}
          </Panel>
          <Panel title="Recent runs">
            {runs.length === 0 ? (
              <Empty title="No activity yet" />
            ) : (
              runs.map((l, i) => (
                <div key={l.id} style={{ display: "flex", gap: 10, padding: "11px 16px", borderTop: i ? "1px solid var(--line)" : 0 }}>
                  <span aria-hidden style={{ width: 7, height: 7, flex: "none", marginTop: 6, borderRadius: "50%", background: l.ok ? "var(--green)" : "var(--red)" }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{l.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>by {l.actor}</span>
                    <span style={{ font: "400 11px 'IBM Plex Mono', monospace", color: "var(--text3)" }}>{relativeTime(l.at)}</span>
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
