"use client";

/**
 * The client side of a review link: preview plus two decisions. No account, no
 * navigation — the page it lives on renders the post server-side from the token.
 */
import { useState } from "react";

export function ReviewDecision({ token }: { token: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: "approve" | "changes") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/review/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not record your decision (${res.status}).`);
        return;
      }
      setDone(data.message ?? "Recorded.");
    } catch {
      setError("Network error — your decision was not recorded.");
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
        <strong style={{ color: "var(--green)" }}>{done}</strong>
        <span style={{ color: "var(--text2)", fontSize: 12.5 }}>
          You can close this page. The team can see your decision in the audit trail.
        </span>
      </div>
    );
  }

  return (
    <div className="so-card so-card-pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label className="so-stat-label" htmlFor="note">Note (required to request changes)</label>
        <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="What should change before this goes out?"
          style={{
            width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line2)",
            background: "var(--panel2)", color: "var(--text)", fontSize: 13, resize: "vertical", outline: "none",
          }} />
      </div>
      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      <div className="so-row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button className="so-btn" onClick={() => void decide("changes")} disabled={busy !== null}>
          {busy === "changes" ? "Sending…" : "Request changes"}
        </button>
        <button className="so-btn" data-variant="primary" onClick={() => void decide("approve")} disabled={busy !== null}>
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
      </div>
    </div>
  );
}
