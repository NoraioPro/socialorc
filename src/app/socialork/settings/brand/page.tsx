"use client";

/**
 * Brand Brain, inside the SocialOrk shell — the same 14 fields the API stores.
 * It persists per workspace; generation does not read it yet, and this screen
 * says so instead of implying otherwise.
 */
import { useEffect, useState } from "react";

const FIELDS: { key: keyof Brain; label: string; hint?: string; long?: boolean }[] = [
  { key: "brandName", label: "Brand name" },
  { key: "industry", label: "Industry" },
  { key: "description", label: "Description", long: true },
  { key: "targetAudience", label: "Audience", long: true },
  { key: "uniqueValue", label: "Unique value", long: true },
  { key: "tone", label: "Tone" },
  { key: "personality", label: "Personality" },
  { key: "writingStyle", label: "Writing style" },
  { key: "avoidTopics", label: "Topics to avoid", long: true },
  { key: "keyPhrases", label: "Key phrases", long: true },
  { key: "primaryGoal", label: "Primary goal" },
  { key: "contentPillars", label: "Content pillars", long: true },
  { key: "callToAction", label: "Call to action" },
  { key: "hashtagStrategy", label: "Hashtag strategy" },
];

type Brain = Record<string, string | null>;

export default function BrandBrainPage() {
  const [brain, setBrain] = useState<Brain>({});
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brand-brain");
        if (!res.ok) return;
        const data = await res.json();
        const row = data?.brandBrain ?? data?.brain ?? data?.data ?? data;
        if (row && typeof row === "object") {
          setBrain(row as Brain);
          setExists(Boolean(row.id));
        }
      } catch {
        /* an empty brain is a valid state */
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const payload = Object.fromEntries(FIELDS.map((f) => [f.key, (brain[f.key] ?? "") || null]));
    try {
      const res = await fetch("/api/brand-brain", {
        method: exists ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Save failed (${res.status}).` });
        return;
      }
      setExists(true);
      setNote({ kind: "ok", text: "Saved to this workspace." });
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was saved." });
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  return (
    <div className="so-page" style={{ maxWidth: 900 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Brand Brain</h1>
        <p className="so-sub">
          What the brand sounds like and who it speaks to. Stored per workspace — generation does
          not read these fields yet, and this page will not pretend it does.
        </p>
      </div>

      <form onSubmit={save} className="so-card so-card-pad" style={{ display: "grid", gap: 14 }}>
        <div className="so-grid so-grid-2">
          {FIELDS.map((f) => (
            <div key={f.key} style={{ display: "grid", gap: 6, gridColumn: f.long ? "1 / -1" : undefined }}>
              <label className="so-stat-label" htmlFor={f.key}>{f.label}</label>
              {f.long ? (
                <textarea id={f.key} rows={2} value={brain[f.key] ?? ""}
                  onChange={(e) => setBrain((b) => ({ ...b, [f.key]: e.target.value }))}
                  style={{ ...field, resize: "vertical" }} />
              ) : (
                <input id={f.key} value={brain[f.key] ?? ""}
                  onChange={(e) => setBrain((b) => ({ ...b, [f.key]: e.target.value }))}
                  style={field} />
              )}
            </div>
          ))}
        </div>

        <div className="so-row" style={{ justifyContent: "flex-end", gap: 10 }}>
          {note ? (
            <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
          ) : null}
          <button className="so-btn" data-variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : exists ? "Save changes" : "Create brain"}
          </button>
        </div>
      </form>

      <a href="/socialork/settings" style={{ fontSize: 12.5 }}>← Back to settings</a>
    </div>
  );
}
