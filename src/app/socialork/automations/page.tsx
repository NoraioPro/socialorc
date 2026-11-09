import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getOverview, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { getRecentRuns } from "@/lib/socialork/audit-log";
import { Empty, PageHead, PreviewNote, Stat, card } from "@/components/socialork/design-bits";

export const dynamic = "force-dynamic";

const RULES = [
  { name: "Retry a failed publish", when: "A post fails to publish", then: "Try again up to three times", instead: "Checking Publishing by hand" },
  { name: "Remind reviewers", when: "A post waits for approval for a day", then: "Send the reviewers a reminder", instead: "Chasing people in chat" },
  { name: "Move approved posts to the queue", when: "A post is approved", then: "Schedule it for the next free slot", instead: "Scheduling each post by hand" },
  { name: "Flag missing alt text", when: "A file is uploaded without alt text", then: "Mark it as needing alt text", instead: "Finding gaps before publishing" },
];

const mono = { fontFamily: "'IBM Plex Mono', monospace" } as const;

export default async function AutomationsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, runs] = await Promise.all([getOverview(tenant), getRecentRuns(tenant, 12)]);

  return (
    <div className="so-page">
      <PageHead title="Automations">
        Small rules that do the next step for you, so the team and your clients click less. Each rule says what it replaces. Every run is logged and approval rules still apply.
      </PageHead>
      <PreviewNote>Automation rules are not available yet, so none can be switched on. The activity below is your real workspace log.</PreviewNote>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <Stat label="Rules on" value={0} sub="Of the rules listed below" />
        <Stat label="Waiting for approval" value={overview.counts.PENDING_APPROVAL ?? 0} sub="What reminders would cover" />
        <Stat label="Failed posts" value={overview.counts.FAILED ?? 0} sub="What retries would cover" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,360px),1fr))", gap: 12 }}>
        {RULES.map((r) => (
          <section key={r.name} style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{r.name}</span>
              <span style={{ height: 20, padding: "0 7px", borderRadius: 5, background: "var(--panel2)", color: "var(--text3)", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center" }}>Coming soon</span>
              <button type="button" role="switch" aria-checked="false" aria-label={`${r.name} (not available yet)`} disabled style={{ width: 36, height: 22, position: "relative", border: 0, borderRadius: 11, background: "var(--panel2)", opacity: 0.6 }}>
                <span style={{ position: "absolute", top: 2, left: 2, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
              {[["WHEN", r.when, "var(--text3)"], ["THEN", r.then, "var(--accent)"], ["SAVES", r.instead, "var(--text3)"]].map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", gap: 8, color: k === "SAVES" ? "var(--text3)" : undefined }}>
                  <span style={{ width: 42, flex: "none", font: "600 10.5px 'IBM Plex Mono', monospace", color: c, paddingTop: 2 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section style={card}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}>Recent runs</div>
        {runs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>No runs yet.</div>
        ) : (
          runs.map((l, i) => (
            <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", padding: "10px 18px", borderTop: i ? "1px solid var(--line)" : 0, fontSize: 12.5 }}>
              <span style={{ width: 120, flex: "none", ...mono, fontSize: 11.5, color: "var(--text3)" }}>{relativeTime(l.at)}</span>
              <span style={{ width: 190, flex: "none", color: "var(--text2)" }}>{l.actor}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{l.label}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
