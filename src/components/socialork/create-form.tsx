"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = [
  { id: "LINKEDIN", name: "LinkedIn" },
  { id: "TWITTER", name: "X" },
  { id: "INSTAGRAM", name: "Instagram" },
  { id: "FACEBOOK", name: "Facebook" },
  { id: "YOUTUBE", name: "YouTube" },
  { id: "TIKTOK", name: "TikTok" },
  { id: "TELEGRAM", name: "Telegram" },
];

export function CreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState("LINKEDIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("A post needs some content.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined, content: content.trim(), platform }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Could not save the draft (${res.status}).`);
        return;
      }
      setTitle("");
      setContent("");
      router.push("/socialork/drafts");
      router.refresh();
    } catch {
      setError("Network error — the draft was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  return (
    <form onSubmit={submit} className="so-card so-card-pad" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label className="so-stat-label" htmlFor="title">Title (optional)</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Behind the scenes: how drafts get reviewed" style={field} />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="so-stat-label" htmlFor="content">Content</label>
        <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={10}
          placeholder="Our pipeline in one line: brief → draft → human review → schedule → publish."
          style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
        <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
          {content.length} characters
        </span>
      </div>

      <div className="so-row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="platform">Channel</label>
          <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)}
            style={{ ...field, width: 180 }}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "grid", gap: 6, justifyItems: "end" }}>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            Saves as a draft — nothing is published.
          </span>
          <button className="so-btn" data-variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </button>
        </div>
      </div>

      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
    </form>
  );
}
