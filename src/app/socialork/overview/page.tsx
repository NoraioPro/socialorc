import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  formatWhen, getAccounts, getCurrentUser, getOverview, STATUS_TONE, tenantFor, relativeTime,
} from "@/lib/socialork/queries";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="so-card so-card-pad">
      <div className="so-stat-label">{label}</div>
      <div className="so-stat-value">{value}</div>
      <div className="so-stat-note">{note}</div>
    </div>
  );
}

export default async function OverviewPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, accounts, user] = await Promise.all([
    getOverview(tenant),
    getAccounts(tenant),
    getCurrentUser(tenant.userId),
  ]);

  const c = overview.counts;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "").split(" ")[0] || session.user.email?.split("@")[0] || "there";
  const reconnect = accounts.filter((a) => a.needsReconnect);
  const failed = overview.recent.filter((p) => p.status === "FAILED");
  const needsYou = overview.recent.filter((p) => p.status === "PENDING_APPROVAL" || p.status === "FAILED");

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">{greeting}, {firstName}</h1>
          <p className="so-sub">
            {c.PENDING_APPROVAL ?? 0} waiting for a decision · {c.SCHEDULED ?? 0} scheduled ·{" "}
            {overview.published30} published in the last 30 days.
          </p>
        </div>
        <span className="so-mono" style={{ color: "var(--text3)", fontSize: 11.5 }}>
          {formatWhen(new Date())} · Europe/Oslo
        </span>
      </div>

      {reconnect.length > 0 ? (
        <div className="so-banner">
          <div style={{ display: "grid", gap: 2 }}>
            <strong>
              {reconnect.map((a) => PLATFORM_CONFIGS[a.platform]?.name ?? a.platform).join(", ")}{" "}
              {reconnect.length === 1 ? "needs" : "need"} reconnecting
            </strong>
            <span style={{ color: "var(--text2)" }}>
              {reconnect[0]?.lastError ?? "The platform rejected the stored token."} Posts to this
              channel will fail until an admin signs in again.
            </span>
          </div>
          <a href="/socialork/settings" className="so-btn" style={{ marginLeft: "auto", flex: "none", height: 28 }}>
            Open settings
          </a>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="so-banner" data-tone="failed" style={{ borderColor: "rgba(239,120,120,0.32)", background: "var(--redSoft)", color: "var(--red)" }}>
          <div style={{ display: "grid", gap: 2 }}>
            <strong>{failed.length} {failed.length === 1 ? "post" : "posts"} failed to publish</strong>
            <span style={{ color: "var(--text2)" }}>
              {failed[0]?.title ?? "Untitled"} — {failed[0]?.errorMessage ?? "see the publishing queue"}
            </span>
          </div>
          <a href="/socialork/publishing" className="so-btn" style={{ marginLeft: "auto", flex: "none", height: 28 }}>
            Open queue
          </a>
        </div>
      ) : null}

      <div className="so-grid so-grid-4">
        <Stat label="Scheduled" value={c.SCHEDULED ?? 0} note="Waiting for their time" />
        <Stat label="In review" value={c.PENDING_APPROVAL ?? 0} note="Needs a decision" />
        <Stat label="Approved" value={c.APPROVED ?? 0} note="Ready to schedule" />
        <Stat label="Published · 30d" value={overview.published30} note="Across every channel" />
      </div>

      <div className="so-grid so-grid-2" style={{ alignItems: "start" }}>
        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-stat-label">Needs you</div>
          </div>
          {needsYou.length === 0 ? (
            <div className="so-empty">Nothing is waiting on a decision.</div>
          ) : (
            <div className="so-list" style={{ display: "grid" }}>
              {needsYou.map((post) => (
                <div
                  key={post.id}
                  style={{ display: "grid", gap: 6, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}
                >
                  <div className="so-row" style={{ gap: 8 }}>
                    <span className="so-pill" data-tone={STATUS_TONE[post.status].tone}>
                      {STATUS_TONE[post.status].label}
                    </span>
                    <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                      {PLATFORM_CONFIGS[post.platform]?.name ?? post.platform} · {relativeTime(post.updatedAt)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600 }}>{post.title ?? post.content.slice(0, 60)}</div>
                  <div style={{ color: "var(--text2)", fontSize: 12.5 }}>
                    {post.content.slice(0, 130)}
                    {post.content.length > 130 ? "…" : ""}
                  </div>
                  <PostActions id={post.id} status={post.status} compact />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-stat-label">Channels</div>
          </div>
          {accounts.length === 0 ? (
            <div className="so-empty">
              No channel is connected yet.{" "}
              <a href="/socialork/settings">Connect the first one</a>.
            </div>
          ) : (
            <div className="so-list" style={{ display: "grid" }}>
              {accounts.map((a) => (
                <div key={a.id} className="so-row" style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 600 }}>{PLATFORM_CONFIGS[a.platform]?.name ?? a.platform}</span>
                  <span className="so-mono" style={{ fontSize: 11.5, color: "var(--text3)" }}>
                    {a.platformUsername ?? "—"}
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    {a.needsReconnect ? (
                      <span className="so-pill" data-tone="failed">Reconnect</span>
                    ) : a.isActive ? (
                      <span className="so-pill" data-tone="approved">Connected</span>
                    ) : (
                      <span className="so-pill">Paused</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
