import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import {
  formatWhen, getAccounts, getCurrentUser, getOverview, listPosts, STATUS_TONE, tenantFor, relativeTime,
} from "@/lib/socialork/queries";
import { Check, CircleAlert, FileText, Send, ShieldCheck, CalendarClock } from "lucide-react";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";
import { PostActions } from "@/components/socialork/post-actions";
import { Hero3D } from "@/components/socialork/hero-3d";
import { PLATFORM_CONFIGS } from "@/types/platform";

export const dynamic = "force-dynamic";

function Glyph({ platform }: { platform: string }) {
  const d = GLYPHS[platform.toLowerCase() as GlyphName];
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22, height: 22, flex: "none", borderRadius: 6, border: "1px solid var(--line2)", display: "grid",
        placeItems: "center", font: "600 9.5px var(--font-plex-mono), monospace", color: "var(--text2)",
      }}
    >
      {d ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ display: "block" }}><path d={d} /></svg>
      ) : (
        platform.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

const panelHead = { padding: "14px 16px", borderBottom: "1px solid var(--line)" } as const;
const linkBtn = { color: "var(--text3)", fontSize: 12, textDecoration: "none" } as const;

export default async function OverviewPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [overview, accounts, user, upNext] = await Promise.all([
    getOverview(tenant),
    getAccounts(tenant),
    getCurrentUser(tenant.userId),
    listPosts(tenant, ["SCHEDULED"], 6),
  ]);

  const c = overview.counts;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "").split(" ")[0] || session.user.email?.split("@")[0] || "there";
  const reconnect = accounts.filter((a) => a.needsReconnect);
  const failed = overview.recent.filter((p) => p.status === "FAILED");
  const needsYou = overview.recent.filter((p) => p.status === "PENDING_APPROVAL" || p.status === "FAILED");

  const pipe = [
    { label: "Drafts", n: c.DRAFT ?? 0, icon: FileText, href: "/socialork/drafts" },
    { label: "In review", n: c.PENDING_APPROVAL ?? 0, icon: ShieldCheck, href: "/socialork/approvals" },
    { label: "Approved", n: c.APPROVED ?? 0, icon: Check, href: "/socialork/publishing" },
    { label: "Scheduled", n: c.SCHEDULED ?? 0, icon: CalendarClock, href: "/socialork/publishing" },
    { label: "Published · 30d", n: overview.published30, icon: Send, href: "/socialork/publishing" },
  ];
  const failedN = c.FAILED ?? 0;
  const healthy = accounts.filter((a) => a.isActive && !a.needsReconnect).length;

  return (
    <div className="so-page" data-gap="20">
      <div className="so-hero">
        <div
          style={{
            display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, padding: "26px 28px",
            border: "1px solid var(--line)", borderRadius: 14, background: "var(--panel)", boxShadow: "var(--card)", minHeight: 156,
          }}
        >
          <span className="so-mono" style={{ color: "var(--text3)", fontSize: 11.5, letterSpacing: "0.03em" }}>
            {formatWhen(new Date())} · Europe/Oslo
          </span>
          <h1 className="so-h1" style={{ fontSize: 26 }}>{greeting}, {firstName}</h1>
          <p className="so-sub">
            {c.PENDING_APPROVAL ?? 0} waiting for a decision · {c.SCHEDULED ?? 0} scheduled ·{" "}
            {overview.published30} published in the last 30 days.
          </p>
        </div>

        {/* the brand's own art, with the 3D object the handoff drew for it */}
        <div className="so-stage" aria-hidden="true">
          <Hero3D />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="so-stage-orc" src="/socialork/orc-head.png" alt="" />
        </div>
      </div>

      {reconnect.length > 0 || failed.length > 0 ? (
        <div className="so-card" style={{ overflow: "hidden" }}>
          {reconnect.length > 0 ? (
            <div className="so-row" style={{ gap: 14, padding: "13px 16px" }}>
              <span style={{ width: 28, height: 28, flex: "none", borderRadius: 8, display: "grid", placeItems: "center", background: "var(--amberSoft)", color: "var(--amber)" }}>
                <CircleAlert size={15} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {reconnect.map((a) => PLATFORM_CONFIGS[a.platform]?.name ?? a.platform).join(", ")}{" "}
                  {reconnect.length === 1 ? "needs" : "need"} reconnecting
                </div>
                <div style={{ color: "var(--text2)", fontSize: 12.5 }}>
                  {reconnect[0]?.lastError ?? "The platform rejected the stored token."} Posts to this
                  channel will fail until an admin signs in again.
                </div>
              </div>
              <a href="/socialork/settings" className="so-btn" style={{ flex: "none", height: 30 }}>Open settings</a>
            </div>
          ) : null}
          {failed.length > 0 ? (
            <div className="so-row" style={{ gap: 14, padding: "13px 16px", borderTop: reconnect.length > 0 ? "1px solid var(--line)" : 0 }}>
              <span style={{ width: 28, height: 28, flex: "none", borderRadius: 8, display: "grid", placeItems: "center", background: "var(--redSoft)", color: "var(--red)" }}>
                <CircleAlert size={15} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{failed.length} {failed.length === 1 ? "post" : "posts"} failed to publish</div>
                <div style={{ color: "var(--text2)", fontSize: 12.5 }}>
                  {failed[0]?.title ?? "Untitled"} — {failed[0]?.errorMessage ?? "see the publishing queue"}
                </div>
              </div>
              <a href="/socialork/publishing" className="so-btn" style={{ flex: "none", height: 30 }}>Open queue</a>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="so-card" style={{ display: "flex", alignItems: "stretch", overflow: "hidden" }}>
        <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", padding: "18px 8px 16px" }}>
          {pipe.map((p) => {
            const Icon = p.icon;
            return (
              <a
                key={p.label}
                href={p.href}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 4, borderRadius: 10,
                  color: "inherit", textDecoration: "none", position: "relative",
                }}
              >
                <span
                  style={{
                    width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center",
                    border: `1.5px solid ${p.n > 0 ? "var(--accent)" : "var(--line2)"}`,
                    background: p.n > 0 ? "var(--accentSoft)" : "transparent",
                    color: p.n > 0 ? "var(--accentText)" : "var(--text3)",
                  }}
                >
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="so-mono" style={{ fontSize: 22, letterSpacing: "-0.03em" }}>{p.n}</span>
                <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>{p.label}</span>
              </a>
            );
          })}
        </div>
        <a
          href="/socialork/publishing"
          style={{
            width: 150, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            borderInlineStart: "1px solid var(--line)", color: "inherit", textDecoration: "none",
            background: failedN > 0 ? "var(--redSoft)" : "transparent",
          }}
        >
          <span
            style={{
              width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center",
              border: `1.5px solid ${failedN > 0 ? "var(--red)" : "var(--line2)"}`,
              color: failedN > 0 ? "var(--red)" : "var(--text3)",
            }}
          >
            <CircleAlert size={18} strokeWidth={1.9} />
          </span>
          <span className="so-mono" style={{ fontSize: 22, color: failedN > 0 ? "var(--red)" : "var(--text)" }}>{failedN}</span>
          <span style={{ fontSize: 12, color: "var(--text2)" }}>Failed</span>
        </a>
      </section>

      <div className="so-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "start" }}>
        <section className="so-card" style={{ overflow: "hidden" }}>
          <div className="so-row" style={{ ...panelHead, justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Up next</div>
            <a href="/socialork/publishing" style={linkBtn}>Open calendar →</a>
          </div>
          {upNext.length === 0 ? (
            <div className="so-empty">Nothing is scheduled. Approved posts show up here once they have a time.</div>
          ) : (
            <div className="so-list">
              {upNext.map((post, i) => (
                <a
                  key={post.id}
                  href="/socialork/publishing"
                  style={{
                    display: "grid", gridTemplateColumns: "96px 24px minmax(0,1fr)", alignItems: "center", gap: 12,
                    padding: "10px 16px", borderTop: i === 0 ? 0 : "1px solid var(--line)", color: "inherit", textDecoration: "none",
                  }}
                >
                  <span className="so-mono" style={{ fontSize: 12, color: "var(--text2)" }}>{formatWhen(post.scheduledFor)}</span>
                  <Glyph platform={post.platform} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {post.title ?? post.content.slice(0, 60)}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>
                      {PLATFORM_CONFIGS[post.platform]?.name ?? post.platform}
                      {post.socialAccount?.platformUsername ? ` · ${post.socialAccount.platformUsername}` : ""}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="so-card" style={{ overflow: "hidden" }}>
          <div className="so-row" style={{ ...panelHead, justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Needs you</div>
            <a href="/socialork/approvals" style={linkBtn}>All approvals →</a>
          </div>
          {needsYou.length === 0 ? (
            <div className="so-empty">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="so-orc-empty" src="/socialork/orc-face.png" alt="" />
              <div>Nothing waiting. The review queue is clear.</div>
            </div>
          ) : (
            <div className="so-list" style={{ display: "grid" }}>
              {needsYou.map((post) => (
                <div
                  key={post.id}
                  style={{ display: "grid", gap: 6, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}
                >
                  <div className="so-row" style={{ gap: 8 }}>
                    <Glyph platform={post.platform} />
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
      </div>

      <section className="so-card" style={{ overflow: "hidden" }}>
        <div className="so-row" style={{ ...panelHead, justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600 }}>Channels</div>
          {accounts.length > 0 ? (
            <span className="so-mono" style={{ fontSize: 12, color: "var(--text3)" }}>{healthy} of {accounts.length} healthy</span>
          ) : null}
        </div>
        {accounts.length === 0 ? (
          <div className="so-empty">
            No channel is connected yet.{" "}
            <a href="/socialork/settings">Open Settings → Connections</a> — the guide there walks through
            each channel, including the redirect URI to register.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {accounts.map((a) => {
              const tone = a.needsReconnect ? "var(--red)" : a.isActive ? "var(--green)" : "var(--text3)";
              return (
                <div key={a.id} className="so-row" style={{ gap: 10, padding: "12px 16px", borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
                  <Glyph platform={a.platform} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{PLATFORM_CONFIGS[a.platform]?.name ?? a.platform}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.platformUsername ?? "—"}
                    </div>
                  </div>
                  <span className="so-row" style={{ gap: 6, fontSize: 11.5, color: tone }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone }} />
                    {a.needsReconnect ? "Reconnect" : a.isActive ? "Connected" : "Paused"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
