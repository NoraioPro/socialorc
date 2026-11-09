"use client";

/**
 * The publishing queue: scheduled, publishing, failed and published posts in one
 * table with a status filter. Actions are the same PostActions every other
 * screen uses (publish now, reschedule, retry, unschedule).
 */
import { useState } from "react";
import type { PostStatus } from "@prisma/client";
import { PostActions } from "@/components/socialork/post-actions";

export type QueueRow = {
  id: string;
  title: string;
  channel: string;
  status: PostStatus;
  when: string;
  attempts: string;
  detail: string;
  url: string | null;
};

const FILTERS: { key: string; label: string; match: (s: PostStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "scheduled", label: "Scheduled", match: (s) => s === "SCHEDULED" || s === "PUBLISHING" },
  { key: "failed", label: "Failed", match: (s) => s === "FAILED" },
  { key: "published", label: "Published", match: (s) => s === "PUBLISHED" },
];
const TONE: Partial<Record<PostStatus, [string, string]>> = {
  SCHEDULED: ["scheduled", "Scheduled"], PUBLISHING: ["publishing", "Publishing…"],
  FAILED: ["failed", "Failed"], PUBLISHED: ["approved", "Published"],
};

export function PublishQueue({ rows, initial }: { rows: QueueRow[]; initial?: string }) {
  const [filter, setFilter] = useState(initial ?? (rows.some((r) => r.status === "FAILED") ? "failed" : "all"));
  const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
  const shown = rows.filter((r) => f.match(r.status));
  return (
    <section className="so-card">
      <div className="so-card-pad so-row" style={{ borderBottom: "1px solid var(--line)", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((x) => (
          <button key={x.key} className="so-tab" data-active={filter === x.key} onClick={() => setFilter(x.key)}>
            {x.label} <span>{rows.filter((r) => x.match(r.status)).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="so-empty">{filter === "failed" ? "Nothing has failed. Every send went through or is still waiting." : "Nothing here."}</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="so-table">
            <thead>
              <tr><th>Post</th><th>Status</th><th>Scheduled</th><th>Attempts</th><th>Detail</th><th style={{ textAlign: "right" }}>Actions</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 320 }}>
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ color: "var(--text3)", fontSize: 11.5 }}>{r.channel}</div>
                  </td>
                  <td><span className="so-pill" data-tone={TONE[r.status]?.[0]}>{TONE[r.status]?.[1] ?? r.status}</span></td>
                  <td className="so-mono" style={{ whiteSpace: "nowrap", color: "var(--text2)" }}>{r.when}</td>
                  <td className="so-mono">{r.attempts}</td>
                  <td style={{ maxWidth: 360, color: r.status === "FAILED" ? "var(--text)" : "var(--text3)" }}>
                    {r.detail}
                    {r.url ? <> · <a href={r.url} target="_blank" rel="noreferrer">Open</a></> : null}
                  </td>
                  <td>{r.status === "PUBLISHED" ? null : <PostActions id={r.id} status={r.status} compact />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="so-card-pad" style={{ borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text3)" }}>
        A failed send is retried only when the platform error is retryable, up to three attempts. Sign-in failures stop at the first attempt and need the account reconnected.
      </div>
    </section>
  );
}
