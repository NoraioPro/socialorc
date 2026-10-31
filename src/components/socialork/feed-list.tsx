"use client";

/**
 * The workspace timeline: every post with a real reaction and a real comment
 * thread. Both go through /api/feed/*, which is workspace-scoped — this screen
 * only renders what came back.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";
import type { FeedItem } from "@/lib/socialork/queries";

const REACTIONS = [
  { type: "LIKE", label: "Like" },
  { type: "CELEBRATE", label: "Celebrate" },
  { type: "INSIGHTFUL", label: "Insightful" },
  { type: "SUPPORT", label: "Support" },
] as const;

export function FeedList({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const react = async (postId: string, type: string) => {
    setBusy(`react:${postId}`);
    setError(null);
    try {
      const res = await fetch("/api/feed/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, type }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Reaction failed (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — the reaction was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const comment = async (postId: string) => {
    const body = (drafts[postId] ?? "").trim();
    if (!body) return;
    setBusy(`comment:${postId}`);
    setError(null);
    try {
      const res = await fetch("/api/feed/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, content: body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Comment failed (${res.status}).`);
        return;
      }
      setDrafts((d) => ({ ...d, [postId]: "" }));
      router.refresh();
    } catch {
      setError("Network error — the comment was not saved.");
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) {
    return <div className="so-card so-empty">No posts in the timeline yet. Publish or schedule one and it appears here.</div>;
  }

  return (
    <>
      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      <div className="so-list" style={{ display: "grid", gap: 12 }}>
        {items.map((item) => {
          const total = Object.values(item.reactions).reduce((a, b) => a + b, 0);
          return (
            <article key={item.id} className="so-card so-card-pad" style={{ display: "grid", gap: 10 }}>
              <div className="so-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center",
                    background: "var(--panel2)", border: "1px solid var(--line2)",
                    font: "600 10px var(--font-plex-mono), monospace", color: "var(--text2)", flex: "none",
                  }}
                >{item.author.slice(0, 2).toUpperCase()}</span>
                <span style={{ display: "grid" }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{item.author}</span>
                  <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                    {item.headline ?? "team"} · {item.when}
                  </span>
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="so-pill">{PLATFORM_CONFIGS[item.platform]?.name ?? item.platform}</span>
                  <span className="so-pill" data-tone={item.status === "PUBLISHED" ? "approved" : item.status === "SCHEDULED" ? "scheduled" : "review"}>
                    {item.status.toLowerCase().replace("_", " ")}
                  </span>
                </span>
              </div>

              {item.title ? <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div> : null}
              <div style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {item.content.length > 700 ? `${item.content.slice(0, 700)}…` : item.content}
              </div>

              <div className="so-row" style={{ gap: 6, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                {REACTIONS.map((r) => {
                  const count = item.reactions[r.type] ?? 0;
                  const active = item.mine === r.type;
                  return (
                    <button
                      key={r.type}
                      className="so-btn"
                      style={{
                        height: 26, padding: "0 9px", fontSize: 11.5,
                        borderColor: active ? "var(--accent)" : undefined,
                        color: active ? "var(--accent)" : "var(--text2)",
                        background: active ? "var(--accentSoft)" : "var(--panel2)",
                      }}
                      onClick={() => void react(item.id, r.type)}
                      disabled={busy === `react:${item.id}`}
                    >
                      {r.label}{count ? ` · ${count}` : ""}
                    </button>
                  );
                })}
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text3)" }}>
                  {total} reaction{total === 1 ? "" : "s"} · {item.comments.length} comment{item.comments.length === 1 ? "" : "s"}
                </span>
              </div>

              {item.comments.length > 0 ? (
                <div style={{ display: "grid", gap: 6, paddingLeft: 10, borderLeft: "2px solid var(--line)" }}>
                  {item.comments.map((c) => (
                    <div key={c.id} style={{ display: "grid", gap: 1 }}>
                      <span style={{ fontSize: 12 }}>
                        <b style={{ color: "var(--text)" }}>{c.who}</b>{" "}
                        <span style={{ color: "var(--text2)" }}>{c.body}</span>
                      </span>
                      <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)" }}>{c.when}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="so-row" style={{ gap: 8 }}>
                <input
                  value={drafts[item.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") void comment(item.id); }}
                  placeholder="Add a comment…"
                  style={{
                    flex: 1, height: 30, padding: "0 10px", borderRadius: 8,
                    border: "1px solid var(--line2)", background: "var(--panel2)",
                    color: "var(--text)", fontSize: 12.5, outline: "none",
                  }}
                />
                <button className="so-btn" style={{ height: 30 }} onClick={() => void comment(item.id)}
                  disabled={busy === `comment:${item.id}` || !(drafts[item.id] ?? "").trim()}>
                  Comment
                </button>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="so-btn" style={{ height: 30, textDecoration: "none" }}>
                    Open
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
