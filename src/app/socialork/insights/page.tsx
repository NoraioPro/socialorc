import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";
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
            Computed from this workspace&apos;s published posts. Every card names its inputs, and cards
            without enough data say what&apos;s missing.
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

      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 1, background: "var(--line)",
          border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden",
        }}
      >
        {[
          { label: "Posts published", value: String(published), note: "published_at inside the range", muted: false },
          {
            label: "Channels used", value: String(byPlatform.length), muted: false,
            note: byPlatform.length === 0
              ? "nothing published yet"
              : byPlatform.map((p) => PLATFORM_CONFIGS[p.platform]?.name ?? p.platform).join(" · "),
          },
          {
            label: "Median time to approve", muted: false,
            value: medianHours === null ? "—" : `${medianHours.toFixed(1)}h`,
            note: medianHours === null ? "no approvals in the range" : "created_at → approved_at",
          },
          { label: "Engagement", value: "—", note: "not collected: needs a platform read-back per post", muted: true },
        ].map((k) => (
          <div key={k.label} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 18px", background: "var(--panel)", minWidth: 0 }}>
            <span style={{ fontSize: 12, color: "var(--text2)" }}>{k.label}</span>
            <span className="so-mono" style={{ fontSize: 26, letterSpacing: "-0.03em", color: k.muted ? "var(--text3)" : undefined }}>{k.value}</span>
            <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{k.note}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
      <section className="so-card" style={{ overflow: "hidden" }}>
        <div className="so-row" style={{ alignItems: "flex-start", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Best time to post</div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>
              Published posts by weekday and hour (local), all channels, {published} {published === 1 ? "post" : "posts"}.
            </div>
          </div>
          <span className="so-mono" style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 5, border: "1px solid var(--line2)", color: "var(--text2)" }}>
            COUNTS
          </span>
        </div>
        {!enough ? (
          <div className="so-empty">
            {published} published {published === 1 ? "post" : "posts"} in this range — not enough to
            read a posting rhythm. This grid fills in as posts go out; it will not guess.
          </div>
        ) : (
          <div style={{ padding: "16px 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: `40px repeat(${BUCKETS.length}, minmax(0,1fr))`, gap: 4 }}>
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
                          height: 30, borderRadius: 5,
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

      <section className="so-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600 }}>By channel</div>
          <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>Posts published per channel, last {days} days.</div>
        </div>
        {byPlatform.length === 0 ? (
          <div className="so-empty">Nothing published in this range.</div>
        ) : (
          <div>
            {byPlatform.map((row) => {
              const pct = Math.round((row._count._all / Math.max(1, published)) * 100);
              const g = GLYPHS[String(row.platform).toLowerCase() as GlyphName];
              return (
                <div key={row.platform} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) 44px 130px", gap: 12, alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--line)" }}>
                  <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid var(--line2)", display: "grid", placeItems: "center", color: "var(--text2)", font: "600 9.5px var(--font-plex-mono), monospace" }}>
                    {g ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d={g} /></svg> : String(row.platform).slice(0, 2)}
                  </span>
                  <span style={{ fontWeight: 500 }}>{PLATFORM_CONFIGS[row.platform]?.name ?? row.platform}</span>
                  <span className="so-mono" style={{ fontSize: 12, color: "var(--text3)", textAlign: "right" }}>{row._count._all}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--panel2)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--accent)" }} />
                    </span>
                    <span className="so-mono" style={{ fontSize: 12, width: 38, textAlign: "right" }}>{pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
