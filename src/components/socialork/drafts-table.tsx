"use client";

/**
 * Drafts, in the handoff's shape: columns Post / Author / Updated / Status, a
 * filter, submit-for-review and delete. Delete goes through the API, which is the
 * only thing allowed to remove a row.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PostActions } from "@/components/socialork/post-actions";
import { PLATFORM_CONFIGS } from "@/types/platform";
import type { PostStatus } from "@prisma/client";

export type DraftRow = {
  id: string;
  title: string | null;
  content: string;
  platform: keyof typeof PLATFORM_CONFIGS;
  status: PostStatus;
  author: string;
  updated: string;
  rejectionReason: string | null;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "changes", label: "Changes requested" },
];

export function DraftsTable({ rows }: { rows: DraftRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "changes" ? rows.filter((r) => r.rejectionReason) : rows),
    [rows, filter],
  );

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Could not delete (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — nothing was deleted.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div role="group" aria-label="Filter drafts" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)", alignSelf: "flex-start" }}>
        {FILTERS.map((f) => (
          <button key={f.id} className="so-tab" aria-pressed={filter === f.id} data-active={filter === f.id} onClick={() => setFilter(f.id)}
            style={{ height: 28, borderRadius: 6, whiteSpace: "nowrap" }}>
            {f.label}
            <span>{f.id === "changes" ? rows.filter((r) => r.rejectionReason).length : rows.length}</span>
          </button>
        ))}
      </div>

      <section className="so-card">
        {visible.length === 0 ? (
          <div className="so-empty" style={{ padding: "32px 16px" }}>
            <svg width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden style={{ margin: "0 auto 4px", display: "block", overflow: "visible" }}>
              <path d="M36 8h34l18 18v58a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6z" fill="var(--panel2)" stroke="var(--line2)" />
              <path d="M70 8v18h18" stroke="var(--line2)" />
              <rect x="40" y="40" width="34" height="5" rx="2.5" fill="var(--line2)" />
              <rect x="40" y="52" width="40" height="5" rx="2.5" fill="var(--line2)" />
              <rect x="40" y="64" width="22" height="5" rx="2.5" fill="var(--line2)" />
              <path d="M98 54 82 70l-4 10 10-4 16-16a4.2 4.2 0 0 0-6-6z" fill="var(--panel)" stroke="var(--accent)" strokeLinejoin="round" />
            </svg>
            <div style={{ fontWeight: 600, color: "var(--text)" }}>No drafts here</div>
            <div>Start one from <a href="/socialork/create">New post</a>.</div>
          </div>
        ) : (
          <table className="so-table">
            <thead>
              <tr><th>Post</th><th>Author</th><th>Updated</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 420 }}>
                    <a href={`/socialork/drafts/${r.id}`} style={{ fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>
                      {r.title ?? "Untitled post"}
                    </a>
                    <div style={{ color: "var(--text3)", fontSize: 11.5 }}>
                      {PLATFORM_CONFIGS[r.platform]?.name ?? r.platform} · {r.content.slice(0, 80)}
                      {r.content.length > 80 ? "…" : ""}
                    </div>
                    {r.rejectionReason ? (
                      <div style={{ color: "var(--red)", fontSize: 11.5, marginTop: 3 }}>
                        Changes: {r.rejectionReason}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ color: "var(--text2)" }}>{r.author}</td>
                  <td className="so-mono" style={{ color: "var(--text2)", whiteSpace: "nowrap" }}>{r.updated}</td>
                  <td>
                    <span className="so-pill" data-tone={r.rejectionReason ? "changes" : "draft"}>
                      {r.rejectionReason ? "Changes requested" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <div className="so-row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <PostActions id={r.id} status={r.status} compact />
                      <button className="so-btn" style={{ height: 28, padding: "0 9px" }}
                        onClick={() => void remove(r.id)} disabled={busy === r.id}>
                        {busy === r.id ? "…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
    </>
  );
}
