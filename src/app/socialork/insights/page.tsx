import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BUCKETS = [6, 9, 12, 15, 18, 21];

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { days: daysParam } = await searchParams;
  const days = RANGES.some((r) => String(r.days) === daysParam) ? Number(daysParam) : 90;
  const since = new Date(Date.now() - days * 864e5);
  const where = { OR: [{ workspaceId: tenant.workspaceId }, { userId: tenant.userId }] };

  const [publishedRows, byPlatform, approvedRows] = await Promise.all([
    prisma.post.findMany({
      where: { ...where, status: "PUBLISHED", publishedAt: { gte: since } },
      select: { publishedAt: true },
      take: 1000,
    }),
    prisma.post.groupBy({
      by: ["platform"],
      where: { ...where, status: "PUBLISHED", publishedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.post.findMany({
      where: { ...where, approvedAt: { gte: since, not: null } },
      select: { createdAt: true, approvedAt: true },
      take: 500,
    }),
  ]);

  const published = publishedRows.length;
  const gaps = approvedRows
    .map((p) => (p.approvedAt!.getTime() - p.createdAt.getTime()) / 36e5)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const medianHours = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;

  // Best time to post: weekday × 3-hour bucket, counted from real publish times.
  const heat = DAY_NAMES.map(() => BUCKETS.map(() => 0));
  for (const row of publishedRows) {
    const d = row.publishedAt!;
    const day = (d.getDay() + 6) % 7;
    const bucket = BUCKETS.findIndex((b) => d.getHours() < b + 3);
    if (bucket >= 0) heat[day][bucket] += 1;
  }
  const max = Math.max(1, ...heat.flat());
  const enough = published >= 5;

  const rangeLabel = `${new Date(since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Insights</h1>
          <p className="so-sub">
            Computed from this workspace's published posts. Every card names its inputs, and cards
            without enough data say what's missing.
          </p>
        </div>
        <div className="so-row" style={{ gap: 8 }}>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{rangeLabel}</span>
          <div className="so-tabs" style={{ borderBottom: 0, paddingBottom: 0 }}>
            {RANGES.map((r) => (
              <a key={r.days} href={`/socialork/insights?days=${r.days}`} className="so-tab"
                data-active={r.days === days} style={{ textDecoration: "none" }}>
                {r.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="so-grid so-grid-4">
        <div className="so-card so-card-pad so-stat">
          <div className="so-stat-label">Posts published</div>
          <div className="so-stat-value">{published}</div>
          <div className="so-stat-note">published_at inside the range</div>
        </div>
        <div className="so-card so-card-pad so-stat">
          <div className="so-stat-label">Channels used</div>
          <div className="so-stat-value">{byPlatform.length}</div>
          <div className="so-stat-note">
            {byPlatform.length === 0
              ? "nothing published yet"
              : byPlatform.map((p) => PLATFORM_CONFIGS[p.platform]?.name ?? p.platform).join(" · ")}
          </div>
        </div>
        <div className="so-card so-card-pad so-stat">
          <div className="so-stat-label">Median time to approve</div>
          <div className="so-stat-value">{medianHours === null ? "—" : `${medianHours.toFixed(1)}h`}</div>
          <div className="so-stat-note">
            {medianHours === null ? "no approvals in the range" : "created_at → approved_at"}
          </div>
        </div>
        <div className="so-card so-card-pad so-stat">
          <div className="so-stat-label">Engagement</div>
          <div className="so-stat-value" style={{ color: "var(--text3)" }}>—</div>
          <div className="so-stat-note">not collected: needs a platform read-back per post</div>
        </div>
      </div>

      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="so-row" style={{ justifyContent: "space-between" }}>
            <span className="so-stat-label">Best time to post</span>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              published_at · weekday × hour (local)
            </span>
          </div>
        </div>
        {!enough ? (
          <div className="so-empty">
            {published} published {published === 1 ? "post" : "posts"} in this range — not enough to
            read a posting rhythm. This grid fills in as posts go out; it will not guess.
          </div>
        ) : (
          <div className="so-card-pad">
            <div style={{ display: "grid", gridTemplateColumns: `44px repeat(${BUCKETS.length}, minmax(0,1fr))`, gap: 4 }}>
              <div />
              {BUCKETS.map((b) => (
                <div key={b} className="so-mono" style={{ fontSize: 10, color: "var(--text3)", textAlign: "center" }}>
                  {String(b).padStart(2, "0")}
                </div>
              ))}
              {heat.map((row, dayIdx) => (
                <div key={DAY_NAMES[dayIdx]} style={{ display: "contents" }}>
                  <div className="so-mono" style={{ fontSize: 10, color: "var(--text3)", alignSelf: "center" }}>
                    {DAY_NAMES[dayIdx]}
                  </div>
                  {row.map((value, bucketIdx) => {
                    const alpha = value / max;
                    return (
                      <div key={bucketIdx} title={`${value} posts`}
                        style={{
                          height: 26, borderRadius: 5, border: "1px solid var(--line)",
                          background: value === 0 ? "var(--panel2)" : `rgba(72,237,133,${0.18 + alpha * 0.62})`,
                          display: "grid", placeItems: "center",
                          fontSize: 10.5, color: alpha > 0.55 ? "#06140b" : "var(--text3)",
                        }}>{value || ""}</div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="so-stat-label">Published per channel</div>
        </div>
        {byPlatform.length === 0 ? (
          <div className="so-empty">Nothing published in this range.</div>
        ) : (
          <table className="so-table">
            <thead>
              <tr><th>Channel</th><th>Posts</th><th style={{ width: "55%" }}>Share</th></tr>
            </thead>
            <tbody>
              {byPlatform.map((row) => {
                const pct = Math.round((row._count._all / Math.max(1, published)) * 100);
                return (
                  <tr key={row.platform}>
                    <td style={{ fontWeight: 600 }}>{PLATFORM_CONFIGS[row.platform]?.name ?? row.platform}</td>
                    <td className="so-mono">{row._count._all}</td>
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
    </div>
  );
}
