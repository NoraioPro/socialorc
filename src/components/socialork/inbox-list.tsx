"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InboxItem, InboxResponse } from "@/types/inbox";
import { relativeTime } from "@/lib/socialork/format-time";

type Filter = "all" | "unread" | "comments" | "replies";
const FILTERS: [Filter, string][] = [["all", "All"], ["unread", "Unread"], ["comments", "Comments"], ["replies", "Replies"]];

/** Neutral starting points: no facts, no promises. The person edits before sending. */
function suggestions(item: InboxItem): string[] {
  const first = item.author.name.split(" ")[0] || "there";
  if (item.content.includes("?")) return [`Good question, ${first}. Let me check and come back to you.`, `Thanks for asking, ${first}. Which part would help most?`];
  return [`Thanks for taking the time to comment, ${first}.`, `Appreciate you sharing this, ${first}.`];
}

export function InboxList({ canReply, suggest }: { canReply: boolean; suggest: boolean }) {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ id: string; text: string; err: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/inbox", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Could not load the inbox"); return; }
      setData(j); setErr("");
    } catch { setErr("Could not load the inbox"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => (data?.items ?? []).filter((i) =>
    filter === "unread" ? !i.isRead : filter === "comments" ? i.type === "comment" : filter === "replies" ? i.type === "reply" : true), [data, filter]);

  async function patch(item: InboxItem, body: object) {
    const r = await fetch("/api/inbox", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform: item.platform, commentId: item.commentId, accountId: item.accountId, ...body }) });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }
  async function toggleRead(item: InboxItem) {
    const { ok } = await patch(item, { action: item.isRead ? "markUnread" : "markRead" });
    if (ok) setData((d) => d && { ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, isRead: !x.isRead } : x)), unreadCount: d.unreadCount + (item.isRead ? 1 : -1) });
  }
  async function send(item: InboxItem) {
    if (!text.trim() || busy) return;
    setBusy(true);
    const { ok, j } = await patch(item, { action: "reply", platformPostId: item.post.platformPostId, content: text.trim() });
    setBusy(false);
    if (!ok) return setNote({ id: item.id, text: j.error ?? "The reply was not sent.", err: true });
    setNote({ id: item.id, text: "Reply sent.", err: false });
    setText(""); setOpen(null);
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === item.id ? { ...x, isRead: true, isReplied: true } : x)) });
  }

  if (err) return <div className="so-frame" role="alert">{err}</div>;
  if (!data) return <div className="so-frame">Loading messages…</div>;

  return (
    <section className="so-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div role="tablist" aria-label="Inbox filter" className="so-tabs" style={{ display: "flex", gap: 4 }}>
          {FILTERS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className="so-btn" data-variant={filter === id ? "primary" : undefined} style={{ height: 28 }} onClick={() => setFilter(id)}>
              {label}{id === "unread" && data.unreadCount ? ` ${data.unreadCount}` : ""}
            </button>
          ))}
          <button className="so-btn" style={{ height: 28 }} disabled title="Mentions are not available: no connected network shares them with this app.">Mentions</button>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text3)" }}>{items.length} of {data.totalCount}</span>
        <button className="so-btn" style={{ height: 28 }} onClick={() => void load()}>Refresh</button>
      </div>
      {items.length === 0 ? (
        <div className="so-empty" style={{ padding: "28px 16px" }}>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>Nothing to show</div>
          <div>{data.totalCount ? "No messages match this filter." : "Comments from channels that share them will land here."}</div>
        </div>
      ) : items.map((item, i) => (
        <article key={item.id} data-inbox-item style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--line)" : 0, display: "grid", gap: 8, background: item.isRead ? undefined : "var(--panel2)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5 }}>
            <b>{item.author.name}</b>
            <span style={{ color: "var(--text3)" }}>{item.platform.toLowerCase()} · {item.type} · {relativeTime(new Date(item.createdAt))}</span>
            {item.isReplied && <span className="so-pill">Replied</span>}
          </div>
          <div dir="auto" style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>{item.content}</div>
          <div style={{ fontSize: 11.5, color: "var(--text3)" }}>On: {item.post.preview.slice(0, 90)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {canReply && item.canReply && <button className="so-btn" style={{ height: 28 }} onClick={() => { setOpen(open === item.id ? null : item.id); setText(""); setNote(null); }}>Reply</button>}
            {canReply && <button className="so-btn" data-variant="ghost" style={{ height: 28 }} onClick={() => void toggleRead(item)}>{item.isRead ? "Mark unread" : "Mark read"}</button>}
            {item.permalink && <a className="so-btn" data-variant="ghost" style={{ height: 28 }} href={item.permalink} target="_blank" rel="noreferrer">Open</a>}
          </div>
          {open === item.id && (
            <div style={{ display: "grid", gap: 8 }}>
              {suggest && (
                <div data-testid="suggestions" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: "var(--text3)" }}>Suggested, edit before sending</span>
                  {suggestions(item).map((s) => <button key={s} type="button" className="so-btn" style={{ height: 28 }} onClick={() => setText(s)}>{s}</button>)}
                </div>
              )}
              <textarea className="so-input" aria-label="Your reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" style={{ height: "auto", padding: 8 }} />
              <div><button className="so-btn" data-variant="primary" disabled={busy || !text.trim()} onClick={() => void send(item)}>{busy ? "Sending…" : "Send reply"}</button></div>
            </div>
          )}
          {note?.id === item.id && <div role="status" style={{ fontSize: 12.5, color: note.err ? "var(--red)" : "var(--text2)" }}>{note.text}</div>}
        </article>
      ))}
      {data.accounts.some((a) => a.state !== "ok" && a.state !== "no_posts") && (
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text3)" }}>
          {data.accounts.filter((a) => a.state !== "ok" && a.state !== "no_posts").map((a) => `${a.name}: ${a.message ?? a.state}`).join(" · ")}
        </div>
      )}
      <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text3)" }}>
        {data.coverage.notCovered.join(" ")}
      </div>
    </section>
  );
}
