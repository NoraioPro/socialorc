"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { card } from "./design-bits";

type Recipe = { key: string; name: string; desc: string; flow: string; needsPlatform: boolean };
type Wf = { id: string; recipe: string; name: string; platform: string; enabled: boolean; lastRunAt?: string; lastResult?: string };
const PLATFORMS = ["LINKEDIN", "TWITTER", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "TELEGRAM"];

export function AutopilotWorkflows({ recipes, initial, canEdit }: { recipes: Recipe[]; initial: Wf[]; canEdit: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [platform, setPlatform] = useState("LINKEDIN");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  async function call(body: object, key: string) {
    setBusy(key);
    try {
      const r = await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setMsg((m) => ({ ...m, [key]: j.error ?? "Something went wrong" })); return null; }
      if (j.workflows) setList(j.workflows);
      router.refresh();
      return j;
    } finally { setBusy(null); }
  }

  return (
    <>
      <section style={card} data-testid="workflows">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600 }}>Workflows</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{list.length ? `${list.length} saved. Switched-on workflows run once a day.` : "None yet"}</div>
        </div>
        {list.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "var(--text3)" }}>Start one from a recipe below.</div> : list.map((w, i) => (
          <div key={w.id} data-wf={w.recipe} style={{ padding: "12px 16px", borderTop: i ? "1px solid var(--line)" : 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{w.name}{w.recipe !== "retry-failed" && <span style={{ fontWeight: 400, color: "var(--text3)" }}> · {w.platform.toLowerCase()}</span>}</span>
              <button type="button" role="switch" aria-checked={w.enabled} aria-label={`${w.name} daily`} disabled={!canEdit || busy === w.id} onClick={() => call({ action: "toggle", id: w.id }, w.id)}
                style={{ width: 36, height: 22, position: "relative", border: 0, borderRadius: 11, background: w.enabled ? "var(--accent)" : "var(--panel2)" }}>
                <span style={{ position: "absolute", top: 2, left: w.enabled ? 16 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </button>
              <button type="button" className="so-btn" disabled={!canEdit || busy === w.id} onClick={async () => { const j = await call({ action: "run", id: w.id }, w.id); if (j) setMsg((m) => ({ ...m, [w.id]: j.result.message })); }}>{busy === w.id ? "Running…" : "Run now"}</button>
              <button type="button" className="so-btn" disabled={!canEdit || busy === w.id} onClick={() => call({ action: "delete", id: w.id }, w.id)}>Remove</button>
            </div>
            {(msg[w.id] || w.lastResult) && <div role="status" style={{ fontSize: 12.5, color: "var(--text2)" }}>{msg[w.id] ?? w.lastResult}</div>}
          </div>
        ))}
      </section>
      <section style={card}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Start from a recipe</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Every post a workflow makes goes to review. Nothing is approved or published for you.</div>
          </div>
          <label style={{ fontSize: 12, color: "var(--text2)" }}>Channel{" "}
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="so-input" style={{ width: "auto" }}>{PLATFORMS.map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}</select>
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, padding: 16 }}>
          {recipes.map((r) => (
            <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ fontSize: 12.5, color: "var(--text2)", flex: 1 }}>{r.desc}</span>
              <span style={{ font: "500 11px 'IBM Plex Mono', monospace", color: "var(--text3)" }}>{r.flow}</span>
              <button type="button" className="so-btn" data-recipe={r.key} disabled={!canEdit || busy === r.key} onClick={() => call({ action: "create", recipe: r.key, platform }, r.key)}>Use recipe</button>
              {msg[r.key] && <span style={{ fontSize: 12, color: "var(--red)" }}>{msg[r.key]}</span>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
