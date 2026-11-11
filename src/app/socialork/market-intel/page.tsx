import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { tenantFor } from "@/lib/socialork/queries";
import { Empty, Panel, PreviewNote } from "@/components/socialork/design-bits";
import { PageHead } from "@/components/socialork/page-head";
import { listCompetitors, ownFacts } from "@/lib/socialork/market-intel";
import { Analyst, Competitors } from "@/components/socialork/market-intel-client";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function MarketIntelPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");
  const [facts, comps] = await Promise.all([ownFacts(tenant.workspaceId), listCompetitors(tenant.workspaceId)]);
  const max = Math.max(1, ...facts.published30.map((p) => p.count));

  return (
    <div className="so-page">
      <PageHead title="Market Intel" actions={<Link href="/socialork/brains" className="so-btn" data-variant="primary">Open brains</Link>}>
        Your own output, the competitors you track, and an analyst that answers from that. Niche benchmarks are not measured here, so none are shown.
      </PageHead>
      <PreviewNote>Everything on this page is your own data or your own notes. Share of voice and niche engagement need a data source that is not connected, so they are left out instead of estimated.</PreviewNote>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 16, alignItems: "start" }}>
        <Panel title="Your channel mix, last 30 days" sub="Posts you published, by channel. Measured from this workspace.">
          {facts.published30.length === 0 ? <Empty title="Nothing published in the last 30 days." /> : (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {facts.published30.map((p) => (
                <div key={p.platform} data-mix={p.platform} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <span style={{ width: 90, color: "var(--text2)" }}>{p.platform.toLowerCase()}</span>
                  <span style={{ flex: 1, height: 8, background: "var(--panel2)", borderRadius: 4 }}><span style={{ display: "block", height: "100%", width: `${(p.count / max) * 100}%`, background: "var(--accent)", borderRadius: 4 }} /></span>
                  <span style={{ font: "600 12px 'IBM Plex Mono', monospace" }}>{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Competitors initial={comps} canEdit={can(tenant.role, "brains:manage")} />
      </div>
      <Analyst canAsk={can(tenant.role, "posts:create")} />
    </div>
  );
}
