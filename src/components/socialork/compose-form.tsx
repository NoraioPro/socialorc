"use client";

/**
 * Create, in the handoff's shape: one brief, a brain, the channels to hit, and
 * per-channel drafts. Generation spends the workspace's own AI key — when no key
 * is configured the screen says so and offers the manual path instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = [
  { id: "LINKEDIN", name: "LinkedIn" },
  { id: "TWITTER", name: "X" },
  { id: "INSTAGRAM", name: "Instagram" },
  { id: "FACEBOOK", name: "Facebook" },
  { id: "YOUTUBE", name: "YouTube" },
  { id: "TIKTOK", name: "TikTok" },
  { id: "TELEGRAM", name: "Telegram" },
] as const;

type Brain = { id: string; name: string; isDefault: boolean };
type Variant = { platform: string; title?: string | null; content: string; usedMock?: boolean; model?: string };

export function ComposeForm() {
  const router = useRouter();
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string>("");
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("professional");
  const [picked, setPicked] = useState<string[]>(["LINKEDIN"]);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brains");
        if (res.ok) {
          const data = await res.json();
          const list: Brain[] = data?.brains ?? [];
          setBrains(list);
          setBrainId(list.find((b) => b.isDefault)?.id ?? list[0]?.id ?? "");
        }
      } catch {
        /* no brain yet is fine */
      }
      try {
        const [mine, shared] = await Promise.all([
          fetch("/api/ai/credentials?scope=user").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/ai/credentials?scope=workspace").then((r) => (r.ok ? r.json() : null)),
        ]);
        const hasKey = Boolean(
          mine?.scopes?.user ?? mine?.user ?? shared?.scopes?.workspace ?? shared?.workspace,
        );
        setAiReady(hasKey);
      } catch {
        setAiReady(false);
      }
    })();
  }, []);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const generate = async () => {
    if (!brief.trim() || picked.length === 0) {
      setError("Write the brief and pick at least one channel.");
      return;
    }
    setBusy("generate");
    setError(null);
    setVariants(null);
    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: brief.trim(), platforms: picked, tone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Generation failed (${res.status}).`);
        return;
      }
      const list: Variant[] =
        data?.variants ?? data?.results ?? data?.posts ?? (Array.isArray(data) ? data : []);
      if (!list.length) {
        setError("The model returned nothing usable. Try a longer brief.");
        return;
      }
      setVariants(list.map((v) => ({ ...v, platform: String(v.platform ?? picked[0]) })));
    } catch {
      setError("Network error — nothing was generated.");
    } finally {
      setBusy(null);
    }
  };

  const saveVariant = async (v: Variant) => {
    setBusy(`save:${v.platform}`);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: v.title ?? undefined, content: v.content, platform: v.platform }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Could not save the ${v.platform} draft (${res.status}).`);
        return;
      }
      router.push("/socialork/drafts");
      router.refresh();
    } catch {
      setError("Network error — the draft was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  const chip = (active: boolean): React.CSSProperties => ({
    height: 30, padding: "0 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--line2)"}`,
    background: active ? "var(--accentSoft)" : "var(--panel2)",
    color: active ? "var(--accent)" : "var(--text2)",
    fontWeight: active ? 600 : 500,
  });

  const channelsLabel = useMemo(
    () => picked.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id).join(" · "),
    [picked],
  );

  return (
    <>
      {aiReady === false ? (
        <div className="so-banner">
          <div style={{ display: "grid", gap: 2 }}>
            <strong>AI generation is off</strong>
            <span style={{ color: "var(--text2)" }}>
              No API key is set for you or for this workspace. You can still write each variant
              yourself.
            </span>
          </div>
          <a href="/socialork/settings/ai" className="so-btn" style={{ marginLeft: "auto", flex: "none", height: 28 }}>
            Add API key
          </a>
        </div>
      ) : null}

      <form
        className="so-card so-card-pad"
        style={{ display: "grid", gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="brief">Brief</label>
          <textarea id="brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder="What are you announcing, and who is it for?"
            style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
        </div>

        <div className="so-grid so-grid-2">
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="brain">Brain</label>
            <select id="brain" value={brainId} onChange={(e) => setBrainId(e.target.value)} style={field}>
              {brains.length === 0 ? <option value="">No brain yet</option> : null}
              {brains.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.isDefault ? " (active)" : ""}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="tone">Tone</label>
            <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} style={field}>
              {["professional", "casual", "humorous", "inspirational", "educational", "conversational"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span className="so-stat-label">Channels</span>
          <div className="so-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" style={chip(picked.includes(p.id))} onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="so-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            {picked.length} channel{picked.length === 1 ? "" : "s"} · saves as drafts, nothing publishes
          </span>
          <button className="so-btn" type="submit" data-variant="primary" disabled={busy === "generate"}>
            {busy === "generate" ? "Generating…" : "Generate drafts"}
          </button>
        </div>

        {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      </form>

      {variants ? (
        <section style={{ display: "grid", gap: 12 }}>
          <div className="so-row" style={{ justifyContent: "space-between" }}>
            <span className="so-stat-label">Generated for {channelsLabel}</span>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              {variants[0]?.model ?? "model"} · nothing saved yet
            </span>
          </div>
          <div className="so-grid so-grid-2">
            {variants.map((v, i) => (
              <article key={`${v.platform}-${i}`} className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
                <div className="so-row" style={{ justifyContent: "space-between" }}>
                  <span className="so-pill">{PLATFORMS.find((p) => p.id === v.platform)?.name ?? v.platform}</span>
                  {v.usedMock ? <span className="so-mock">mock</span> : null}
                </div>
                {v.title ? <div style={{ fontWeight: 600 }}>{v.title}</div> : null}
                <div style={{ color: "var(--text2)", fontSize: 12.5, whiteSpace: "pre-wrap" }}>{v.content}</div>
                <div className="so-row" style={{ justifyContent: "flex-end" }}>
                  <button className="so-btn" style={{ height: 28 }} onClick={() => void saveVariant(v)}
                    disabled={busy === `save:${v.platform}`}>
                    {busy === `save:${v.platform}` ? "Saving…" : "Save as draft"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
