"use client";

/**
 * AI Studio: the variant studio the old app had at /dashboard/ai-studio.
 * One idea plus brand context, a few variants back, each savable as a draft.
 */
import "./settings-layout.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";

const PLATFORMS = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "TELEGRAM"] as const;
const TONES = ["professional", "casual", "humorous", "inspirational", "educational", "conversational"];
function capPerChannel(list: Variant[], n: number): Variant[] {
  const seen: Record<string, number> = {};
  return list.filter((v) => {
    const k = String(v.platform);
    seen[k] = (seen[k] ?? 0) + 1;
    return seen[k] <= n;
  });
}
type Variant = { platform: string; content: string; title?: string | null; usedMock?: boolean };

export function StudioForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("professional");
  const [platforms, setPlatforms] = useState<string[]>(["LINKEDIN"]);
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
          platforms,
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
      setVariants(capPerChannel(list, count).map((v) => ({ ...v, platform: String(v.platform ?? platforms[0]) })));
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

  const toggle = (p: string) =>
    setPlatforms((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));
  const lbl: React.CSSProperties = { fontSize: 12, color: "var(--text2)", fontWeight: 500 };
  const chip = (on: boolean): React.CSSProperties => ({
    borderColor: on ? "var(--accent)" : undefined,
    color: on ? "var(--accentText, var(--accent))" : "var(--text2)",
    background: on ? "var(--accentSoft)" : "var(--panel2)",
  });

  return (
    <div className="so-studio" style={{ display: "grid", gridTemplateColumns: "minmax(0,380px) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      <form className="so-card so-card-pad" style={{ display: "grid", gap: 14, boxShadow: "var(--card)" }}
        onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Idea</span>
          <textarea id="idea" rows={5} value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="The thing you want to say, in your own words."
            style={{ ...field, resize: "vertical", lineHeight: 1.55, background: "var(--bg)", padding: "10px 12px", borderRadius: 10 }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Audience</span>
          <input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)}
            placeholder="Who is this for?" style={{ ...field, background: "var(--bg)", height: 36 }} />
        </label>
        <div role="group" aria-label="Tone" style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Tone</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TONES.map((t) => (
              <button key={t} type="button" className="so-btn" aria-pressed={tone === t} onClick={() => setTone(t)}
                style={{ height: 28, borderRadius: 999, padding: "0 10px", fontSize: 12, textTransform: "capitalize", ...chip(tone === t) }}>{t}</button>
            ))}
          </div>
        </div>
        <div role="group" aria-label="Channels" style={{ display: "grid", gap: 6 }}>
          <span style={lbl}>Channels</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PLATFORMS.map((p) => (
              <button key={p} type="button" className="so-btn" aria-pressed={platforms.includes(p)} onClick={() => toggle(p)}
                style={{ height: 30, fontSize: 12, ...chip(platforms.includes(p)) }}>{PLATFORM_CONFIGS[p]?.name ?? p}</button>
            ))}
          </div>
        </div>
        <div className="so-row" style={{ gap: 8 }}>
          <span style={lbl}>Variants per channel</span>
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" className="so-btn" aria-pressed={count === n} onClick={() => setCount(n)}
              style={{ height: 26, padding: "0 9px", ...chip(count === n) }}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>
          Voice follows the active brain. <a href="/socialork/brains">Change it on Brains.</a>
        </div>
        <button className="so-btn" data-variant="primary" type="submit" disabled={busy} style={{ height: 36 }}>
          {busy ? "Generating…" : "Generate variants"}
        </button>
        {error ? <span role="alert" style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        {!variants ? (
          <section style={{ border: "1px dashed var(--line2)", borderRadius: 12, padding: "40px 20px", textAlign: "center", color: "var(--text3)" }}>
            {busy ? "Generating variants…" : "Variants appear here, one per channel, each checked against the channel's length."}
          </section>
        ) : null}
        {variants?.map((v, i) => {
          const cfg = PLATFORM_CONFIGS[v.platform as keyof typeof PLATFORM_CONFIGS];
          const max = cfg?.maxTextLength;
          const len = v.content.length;
          return (
            <article key={i} className="so-card so-card-pad" style={{ display: "grid", gap: 10, boxShadow: "var(--card)" }}>
              <div className="so-row" style={{ gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{cfg?.name ?? v.platform}</span>
                <span style={{ flex: 1 }} />
                <span className="so-mono" style={{ fontSize: 11.5, color: max && len > max ? "var(--red)" : "var(--text3)" }}>
                  {max ? `${len} / ${max}` : len}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-line", lineHeight: 1.6, fontSize: 13.5, padding: 12, borderRadius: 10, background: "var(--bg)" }}>{v.content}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button className="so-btn" type="button" onClick={() => void navigator.clipboard?.writeText(v.content)}>Copy</button>
                <button className="so-btn" data-variant="primary" type="button" onClick={() => void save(v)} disabled={busy}>
                  Save as draft
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
