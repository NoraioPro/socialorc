"use client";

/**
 * The decision buttons on a post. Every call goes through the existing API
 * routes so the approval gate, the workspace scope and the audit trail all run
 * on the server — the UI never decides what is allowed, it only offers it.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PostStatus } from "@prisma/client";

type Props = { id: string; status: PostStatus; compact?: boolean };

export function PostActions({ id, status, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [when, setWhen] = useState("");

  const call = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Request failed (${res.status})`);
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError("Network error — the request did not reach the server.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const disabled = pending || busy !== null;
  const size = compact ? { height: 28, padding: "0 10px", fontSize: 12 } : undefined;

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div className="so-row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {status === "DRAFT" ? (
          <button
            className="so-btn"
            style={size}
            disabled={disabled}
            onClick={() => call("submit", `/api/posts/${id}/approve`, { action: "submit" })}
          >
            {busy === "submit" ? "Submitting…" : "Submit for review"}
          </button>
        ) : null}

        {status === "PENDING_APPROVAL" ? (
          <>
            <button
              className="so-btn"
              style={size}
              disabled={disabled}
              onClick={() => setShowReason((v) => !v)}
            >
              Request changes
            </button>
            <button
              className="so-btn"
              data-variant="primary"
              style={size}
              disabled={disabled}
              onClick={() => call("approve", `/api/posts/${id}/approve`, { action: "approve" })}
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
          </>
        ) : null}

        {status === "APPROVED" ? (
          <button
            className="so-btn"
            data-variant="primary"
            style={size}
            disabled={disabled}
            onClick={() => setShowSchedule((v) => !v)}
          >
            Schedule
          </button>
        ) : null}

        {status === "SCHEDULED" ? (
          <button
            className="so-btn"
            style={size}
            disabled={disabled}
            onClick={() => call("publish", `/api/posts/${id}/publish`, { confirm: true })}
          >
            {busy === "publish" ? "Publishing…" : "Publish now"}
          </button>
        ) : null}

        {status === "FAILED" ? (
          <button
            className="so-btn"
            style={size}
            disabled={disabled}
            onClick={() => call("retry", `/api/posts/${id}/retry`)}
          >
            {busy === "retry" ? "Retrying…" : "Retry"}
          </button>
        ) : null}
      </div>

      {showReason ? (
        <div className="so-row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What needs changing?"
            style={{
              height: 28, minWidth: 200, padding: "0 8px", borderRadius: 7,
              border: "1px solid var(--line2)", background: "var(--panel2)",
              color: "var(--text)", fontSize: 12,
            }}
          />
          <button
            className="so-btn"
            style={size}
            disabled={disabled}
            onClick={async () => {
              const ok = await call("reject", `/api/posts/${id}/approve`, {
                action: "reject",
                reason: reason.trim() || undefined,
              });
              if (ok) {
                setShowReason(false);
                setReason("");
              }
            }}
          >
            Send back
          </button>
        </div>
      ) : null}

      {showSchedule ? (
        <div className="so-row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{
              height: 28, padding: "0 8px", borderRadius: 7, border: "1px solid var(--line2)",
              background: "var(--panel2)", color: "var(--text)", fontSize: 12,
            }}
          />
          <button
            className="so-btn"
            data-variant="primary"
            style={size}
            disabled={disabled || !when}
            onClick={async () => {
              const ok = await call("schedule", `/api/posts/${id}/schedule`, {
                scheduledFor: new Date(when).toISOString(),
              });
              if (ok) setShowSchedule(false);
            }}
          >
            {busy === "schedule" ? "Saving…" : "Confirm"}
          </button>
        </div>
      ) : null}

      {error ? (
        <span style={{ color: "var(--red)", fontSize: 11.5, maxWidth: 260, textAlign: "right" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
