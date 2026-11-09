import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getOverview, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { getRecentRuns } from "@/lib/socialork/audit-log";
import { Empty, Panel, PageHead, PreviewNote, Stat, card } from "@/components/socialork/design-bits";

export const dynamic = "force-dynamic";

const RECIPES = [
  { name: "Daily draft", desc: "Writes a draft each morning from your brain and the week's themes.", flow: "Brain -> Draft -> Review" },
  { name: "Repurpose a long post", desc: "Turns one long post into short versions for each channel.", flow: "Post -> Rewrite -> Review -> Schedule" },
  { name: "Retry failed publishes", desc: "Tries a failed post again, then tells you if it still fails.", flow: "Failed -> Retry -> Notify" },
  { name: "Weekly recap", desc: "Collects the week's results into one summary for the team.", flow: "Insights -> Summary -> Review" },
];

const rules = [
  { label: "A person approves every post", sub: "Nothing is published without a human decision.", locked: true },
  { label: "Clients can approve on their own account", sub: "Roles are set under Team.", locked: false },
];

export default async function AutopilotPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, runs] = await Promise.all([getOverview(tenant), getRecentRuns(tenant)]);
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

      <PreviewNote>Workflows are not available yet, so the list below is empty and the recipes cannot be switched on. The numbers and runs are your real workspace activity.</PreviewNote>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Stat label="Waiting for approval" value={pending} sub="Posts in review" color={pending ? "var(--amber)" : undefined} />
        <Stat label="Scheduled" value={c.SCHEDULED ?? 0} sub="Queued to publish" />
        <Stat label="Published, 30 days" value={overview.published30} sub="Went out on a channel" color="var(--green)" />
        <Stat label="Failed" value={c.FAILED ?? 0} sub="Need a retry" color={c.FAILED ? "var(--red)" : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, gridColumn: "span 1" }}>
          <section style={card}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 600 }}>Workflows</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>None yet</div>
            </div>
            <Empty title="No workflows yet">Recipes you can use once workflows ship are listed below.</Empty>
          </section>
          <Panel title="Start from a recipe" sub="Preview only. Channels, approval and timing will be changeable.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, padding: 16 }}>
              {RECIPES.map((r) => (
                <div key={r.name} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text2)", flex: 1 }}>{r.desc}</span>
                  <span style={{ font: "500 11px 'IBM Plex Mono', monospace", color: "var(--text3)" }}>{r.flow}</span>
                  <button type="button" className="so-btn" disabled aria-disabled="true" title="Coming soon">Use recipe</button>
                </div>
              ))}
            </div>
          </Panel>
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
