import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getInsights, tenantFor } from "@/lib/socialork/queries";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { published, byPlatform, medianApprovalHours } = await getInsights(tenant);
  const enough = published >= 5;

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Insights</h1>
        <p className="so-sub">
          Computed from this workspace's published posts. Every card names its inputs, and a card
          without enough data says what is missing instead of showing a number.
        </p>
      </div>

      <div className="so-grid so-grid-4">
        <div className="so-card so-card-pad">
          <div className="so-stat-label">Posts published</div>
          <div className="so-stat-value">{published}</div>
          <div className="so-stat-note">all time · this workspace</div>
        </div>
        <div className="so-card so-card-pad">
          <div className="so-stat-label">Channels published to</div>
          <div className="so-stat-value">{byPlatform.length}</div>
          <div className="so-stat-note">
            {byPlatform.length === 0
              ? "nothing published yet"
              : byPlatform.map((p) => PLATFORM_CONFIGS[p.platform]?.name ?? p.platform).join(" · ")}
          </div>
        </div>
        <div className="so-card so-card-pad">
          <div className="so-stat-label">Median time to approve</div>
          <div className="so-stat-value">
            {medianApprovalHours === null ? "—" : `${medianApprovalHours.toFixed(1)}h`}
          </div>
          <div className="so-stat-note">
            {medianApprovalHours === null
              ? "no approved posts yet"
              : "created → approved, last 200 posts"}
          </div>
        </div>
        <div className="so-card so-card-pad">
          <div className="so-stat-label">Engagement</div>
          <div className="so-stat-value" style={{ color: "var(--text3)" }}>—</div>
          <div className="so-stat-note">
            not collected yet: needs a platform read-back per post
          </div>
        </div>
      </div>

      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="so-stat-label">Published per channel</div>
        </div>
        {byPlatform.length === 0 ? (
          <div className="so-empty">
            Nothing published yet. Insights stay empty rather than showing a fabricated baseline.
          </div>
        ) : (
          <table className="so-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Posts published</th>
                <th style={{ width: "50%" }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {byPlatform.map((row) => {
                const pct = Math.round((row.count / Math.max(1, published)) * 100);
                return (
                  <tr key={row.platform}>
                    <td style={{ fontWeight: 600 }}>{PLATFORM_CONFIGS[row.platform]?.name ?? row.platform}</td>
                    <td className="so-mono">{row.count}</td>
                    <td>
                      <div style={{ height: 6, borderRadius: 99, background: "var(--panel2)", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {!enough ? (
        <div className="so-frame">
          {published} published {published === 1 ? "post" : "posts"} is not enough to compare
          channels. This page will fill in as posts go out; it will not guess.
        </div>
      ) : null}
    </div>
  );
}
