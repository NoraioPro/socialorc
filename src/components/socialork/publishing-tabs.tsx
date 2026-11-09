"use client";

/**
 * Publishing in the design's two tabs: Week (calendar and what is coming up)
 * and Queue (every send with its status, attempts and error, filterable). The
 * sections themselves are rendered by the page; this only switches between them.
 */
import { useEffect, useState, type ReactNode } from "react";

export function PublishingTabs({ week, queue, failed, upcoming = 0, published = 0 }: { week: ReactNode; queue: ReactNode; failed: number; upcoming?: number; published?: number }) {
  const [tab, setTab] = useState<"week" | "queue">("week");
  const [tz, setTz] = useState("");
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "queue" || q === "week") setTab(q);
  }, []);
  return (
    <>
      <div className="so-spread" style={{ alignItems: "flex-end" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 className="so-h1">Publishing</h1>
          <p className="so-sub">Every scheduled post across all channels, and the queue that sends them.</p>
        </div>
        <div className="so-row" style={{ gap: 10 }}>
          <span className="so-mono" style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>{upcoming} upcoming · {published} published{tz ? ` · ${tz}` : ""}</span>
          <div role="tablist" aria-label="Publishing view" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }}>
            {([["week", "Week"], ["queue", "Queue"]] as const).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                style={{ height: 28, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", border: 0, borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                  background: tab === id ? "var(--panel2)" : "transparent", color: tab === id ? "var(--text)" : "var(--text2)" }}>
                {label}
                {id === "queue" && failed ? <span className="so-mono" style={{ fontSize: 11, padding: "0 5px", borderRadius: 4, background: "var(--redSoft)", color: "var(--red)" }}>{failed}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div hidden={tab !== "week"} style={{ display: tab === "week" ? "flex" : "none", flexDirection: "column", gap: 16 }}>{week}</div>
      <div hidden={tab !== "queue"} style={{ display: tab === "queue" ? "flex" : "none", flexDirection: "column", gap: 16 }}>{queue}</div>
    </>
  );
}
