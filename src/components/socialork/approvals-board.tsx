"use client";

/**
 * Approvals, in the handoff's shape: Review / Changes / Approved tabs, a filter,
 * the list on the left and the selected post in a right-hand panel with the
 * decision buttons. Every decision still goes through the server route, so the
 * gate and the audit trail are untouched by this screen.
 */
import { useMemo, useState } from "react";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";
import type { PostStatus } from "@prisma/client";

export type ApprovalPost = {
  id: string;
  title: string | null;
  content: string;
  platform: keyof typeof PLATFORM_CONFIGS;
  status: PostStatus;
  handle: string | null;
  when: string;
  changed: string;
  approvedBy: string | null;
  rejectionReason: string | null;
  url: string | null;
};

const TABS = [
  { id: "review", label: "Review", statuses: ["PENDING_APPROVAL"] as PostStatus[] },
  { id: "changes", label: "Changes", statuses: ["DRAFT"] as PostStatus[] },
  { id: "approved", label: "Approved", statuses: ["APPROVED"] as PostStatus[] },
];

export function ApprovalsBoard({ posts, canApprove = true }: { posts: ApprovalPost[]; canApprove?: boolean }) {
  const [tab, setTab] = useState("review");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewLink, setReviewLink] = useState<{ postId: string; url: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [t.id, posts.filter((p) => t.statuses.includes(p.status)).length]),
      ) as Record<string, number>,
    [posts],
  );

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const rows = posts
    .filter((p) => active.statuses.includes(p.status))
    .filter((p) =>
      query.trim()
        ? `${p.title ?? ""} ${p.content} ${p.handle ?? ""}`.toLowerCase().includes(query.toLowerCase())
        : true,
    );
  const current = rows.find((p) => p.id === selected) ?? rows[0] ?? null;

  /** Mint a signed, account-free review link for the selected post. */
  const mintLink = async (postId: string) => {
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/posts/${postId}/review-link`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) return;
      setReviewLink({ postId, url: data.url });
      try {
        await navigator.clipboard.writeText(data.url);
      } catch {
        /* clipboard may be blocked; the URL is shown either way */
      }
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <>
      <div className="so-row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="so-tabs" style={{ borderBottom: 0, paddingBottom: 0 }}>
          {TABS.map((t) => (
            <button key={t.id} className="so-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label} <span>{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, text or handle"
          style={{
            height: 30, minWidth: 240, padding: "0 10px", borderRadius: 8,
            border: "1px solid var(--line2)", background: "var(--panel2)",
            color: "var(--text)", fontSize: 12.5, outline: "none",
          }}
        />
      </div>

      {!canApprove ? (
        <div className="so-frame" style={{ fontSize: 12 }}>
          Your role is read-and-review only here. You can open any post and read it; a manager or an
          admin makes the decision.
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 12, alignItems: "start" }}>
        <section className="so-card">
          {rows.length === 0 ? (
            <div className="so-empty">
              {tab === "review" ? "Nothing waiting — every post in this list has been handled." : "Nothing here yet."}
            </div>
          ) : (
            <div className="so-list" style={{ display: "grid" }}>
              {rows.map((p) => {
                const isSel = current?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    style={{
                      display: "grid", gap: 6, padding: "12px 16px", textAlign: "left", width: "100%",
                      border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer",
                      background: isSel ? "var(--panel2)" : "transparent", color: "inherit",
                    }}
                  >
                    <div className="so-row" style={{ gap: 8 }}>
                      <span className="so-pill">{PLATFORM_CONFIGS[p.platform]?.name ?? p.platform}</span>
                      <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                        {p.handle ?? "no account"} · {p.changed}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title ?? "Untitled post"}</div>
                    <div style={{ color: "var(--text2)", fontSize: 12.5, maxHeight: 40, overflow: "hidden" }}>
                      {p.content.slice(0, 140)}{p.content.length > 140 ? "…" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="so-card so-card-pad" style={{ display: "grid", gap: 12, position: "sticky", top: 12 }}>
          {current ? (
            <>
              <div className="so-row" style={{ justifyContent: "space-between" }}>
                <span className="so-stat-label">Submission</span>
                <span className="so-pill" data-tone={current.status === "APPROVED" ? "approved" : current.status === "DRAFT" ? "changes" : "review"}>
                  {current.status === "PENDING_APPROVAL" ? "In review" : current.status === "APPROVED" ? "Approved" : "Changes requested"}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{current.title ?? "Untitled post"}</div>
              <div style={{ color: "var(--text2)", fontSize: 12.5, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>
                {current.content}
              </div>
              {current.rejectionReason ? (
                <div className="so-frame" style={{ fontSize: 12 }}>
                  <b style={{ color: "var(--red)" }}>Requested changes:</b> {current.rejectionReason}
                </div>
              ) : null}
              <div className="so-divider" />
              <div style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text3)" }}>
                <span className="so-mono">channel · {PLATFORM_CONFIGS[current.platform]?.name ?? current.platform}</span>
                <span className="so-mono">account · {current.handle ?? "none"}</span>
                <span className="so-mono">scheduled · {current.when}</span>
                <span className="so-mono">approved by · {current.approvedBy ?? "—"}</span>
              </div>
              <div className="so-divider" />
              {canApprove ? (
                <PostActions id={current.id} status={current.status} />
              ) : (
                <div className="so-frame" style={{ fontSize: 12 }}>
                  <b>You can review but not decide.</b> Approving or sending a post back needs a
                  manager or admin. Ask an admin to change your role in Team — the server enforces
                  this, so no button here would work.
                </div>
              )}

              <div className="so-row" style={{ gap: 6, display: canApprove ? undefined : "none" }}>
                <button
                  className="so-btn"
                  style={{ height: 28, flex: 1 }}
                  disabled={actionBusy || current.status !== "PENDING_APPROVAL"}
                  onClick={async () => {
                    setActionBusy(true);
                    try {
                      await fetch(`/api/posts/${current.id}/approve`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "reject", reason: "Returned to drafts from the approval review." }),
                      });
                      setSelected(null);
                      window.location.reload();
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                >
                  Return to drafts
                </button>
                <button
                  className="so-btn"
                  style={{ height: 28, flex: 1 }}
                  disabled={actionBusy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
              </div>

              <div style={{ display: canApprove ? "grid" : "none", gap: 6 }}>
                <button className="so-btn" style={{ height: 28, justifyContent: "center" }}
                  onClick={() => void mintLink(current.id)} disabled={linkBusy}>
                  {linkBusy ? "Creating link…" : "Copy client review link"}
                </button>
                {reviewLink && reviewLink.postId === current.id ? (
                  <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)", wordBreak: "break-all" }}>
                    {reviewLink.url}
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, color: "var(--text3)" }}>
                    A signed link, valid 72 hours, no account — the client can approve or ask for changes.
                  </span>
                )}
              </div>
              {current.url ? <a href={current.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open on the platform</a> : null}
            </>
          ) : (
            <div className="so-empty">Select a post to review it.</div>
          )}
        </aside>
      </div>
    </>
  );
}
