"use client";

/**
 * AI Studio: the variant studio the old app had at /dashboard/ai-studio.
 * One idea plus brand context, a few variants back, each savable as a draft.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";

const PLATFORMS = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;
type Variant = { platform: string; content: string; title?: string | null; usedMock?: boolean };

export function StudioForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("professional");
  const [platform, setPlatform] = useState<string>("LINKEDIN");
  const [count, setCount] = useState(3);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  const run = async () => {
    if (!idea.trim()) {
      setError("Describe the idea first.");
      return;
    }
    setBusy(true);
    setError(null);
    setVariants(null);
    try {
      const res = await fetch("/api/ai-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          idea: idea.trim(),
          platforms: [platform],
          tone,
          additionalContext: audience.trim() ? `Audience: ${audience.trim()}` : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Generation failed (${res.status}).`);
        return;
      }
      const list: Variant[] = data?.variants ?? data?.results ?? (Array.isArray(data) ? data : []);
      if (!list.length) {
        setError("The model returned nothing usable. Try a sharper idea.");
        return;
      }
      setVariants(list.slice(0, count).map((v) => ({ ...v, platform: String(v.platform ?? platform) })));
    } catch {
      setError("Network error — nothing was generated.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (v: Variant) => {
    setBusy(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: v.title ?? undefined, content: v.content, platform: v.platform }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Could not save (${res.status}).`);
        return;
      }
      router.push("/socialork/drafts");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="so-card so-card-pad" style={{ display: "grid", gap: 12 }}
        onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="idea">Idea</label>
          <textarea id="idea" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="The thing you want to say, in your own words."
            style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
        </div>
        <div className="so-grid so-grid-3">
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="audience">Audience</label>
            <input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)}
              placeholder="Who is this for?" style={field} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="tone">Tone</label>
            <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} style={field}>
              {["professional", "casual", "humorous", "inspirational", "educational", "conversational"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="platform">Channel</label>
            <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} style={field}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_CONFIGS[p]?.name ?? p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="so-row" style={{ gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="so-row" style={{ gap: 8 }}>
            <span className="so-stat-label">Variants</span>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)}
                className="so-btn"
                style={{
                  height: 26, padding: "0 9px",
                  borderColor: count === n ? "var(--accent)" : undefined,
                  color: count === n ? "var(--accent)" : "var(--text2)",
                  background: count === n ? "var(--accentSoft)" : "var(--panel2)",
                }}>{n}</button>
            ))}
          </div>
          <button className="so-btn" data-variant="primary" type="submit" disabled={busy}>
            {busy ? "Generating…" : "Generate variants"}
          </button>
        </div>
        {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      </form>

      {variants ? (
        <div className="so-list" style={{ display: "grid", gap: 12 }}>
          {variants.map((v, i) => (
            <article key={i} className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
              <div className="so-row" style={{ justifyContent: "space-between" }}>
                <span className="so-pill">variant {i + 1} · {PLATFORM_CONFIGS[v.platform as keyof typeof PLATFORM_CONFIGS]?.name ?? v.platform}</span>
                <button className="so-btn" style={{ height: 26 }} onClick={() => void save(v)} disabled={busy}>
                  Save as draft
                </button>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text2)" }}>{v.content}</div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}
