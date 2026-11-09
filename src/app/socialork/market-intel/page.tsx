import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { tenantFor } from "@/lib/socialork/queries";
import { Empty, PageHead, PreviewNote, Panel } from "@/components/socialork/design-bits";

export const dynamic = "force-dynamic";

const SECTIONS: [string, string, string][] = [
  ["Engagement rate, last 12 weeks", "Median per post, you against your niche.", "No engagement history to compare yet."],
  ["Share of voice", "Mentions and posts in the niche, last 30 days.", "No niche data has been collected."],
  ["Competitors", "What worked for each of them.", "No competitors are tracked yet."],
  ["Niche gaps", "Topics the audience wants against how well competitors and you cover them.", "Gaps appear once competitors are tracked."],
  ["Format performance", "Engagement rate: niche best against you.", "No format data yet."],
  ["Action plan", "Ranked by expected impact for the least effort.", "No suggestions yet."],
];

export default async function MarketIntelPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  return (
    <div className="so-page">
      <PageHead
        title="Market Intel"
        actions={<Link href="/socialork/brains" className="so-btn" data-variant="primary">Open brains</Link>}
      >
        What your niche wants, what worked for competitors, and the moves that should beat them.
      </PageHead>
      <PreviewNote>
        Market data is not connected, so no figures are shown. Nothing on this page is estimated. Your own results are under Insights.
      </PreviewNote>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 16, alignItems: "start" }}>
        {SECTIONS.map(([t, s, e]) => (
          <Panel key={t} title={t} sub={s}>
            <Empty title={e} />
          </Panel>
        ))}
      </div>
      <Panel title="AI analyst" sub="Answers from the data on this page and your brain">
        <Empty title="Not available yet">For now, ask your brain from Studio.</Empty>
      </Panel>
    </div>
  );
}
