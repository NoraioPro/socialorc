"use client";
import { useState } from "react";
import { Panel } from "./design-bits";

type Comp = { id: string; name: string; handle: string; note: string };
const PROMPTS = ["Which topics should we cover that we have not?", "How is our channel mix balanced?", "Give me a 3-step plan for next week"];

export function Competitors({ initial, canEdit }: { initial: Comp[]; canEdit: boolean }) {
  const [list, setList] = useState(initial);
  const [f, setF] = useState({ name: "", handle: "", note: "" });
  const [err, setErr] = useState("");
  async function post(body: object) {
    setErr("");
    const r = await fetch("/api/market-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error ?? "Failed");
    setList(j.competitors); setF({ name: "", handle: "", note: "" });
  }
  return (
    <Panel title="Competitors" sub="Your own watchlist. Figures are not measured here, so only your notes are shown.">
      {list.length === 0 && <div style={{ padding: 20, color: "var(--text3)", textAlign: "center" }}>No competitors tracked yet.</div>}
      {list.map((c, i) => (
        <div key={c.id} data-comp style={{ display: "flex", gap: 10, padding: "10px 16px", borderTop: i ? "1px solid var(--line)" : 0, alignItems: "baseline" }}>
          <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> <span style={{ color: "var(--text3)" }}>{c.handle}</span><span style={{ display: "block", fontSize: 12.5, color: "var(--text2)" }}>{c.note}</span></span>
          {canEdit && <button type="button" className="so-btn" onClick={() => post({ action: "remove", id: c.id })}>Remove</button>}
        </div>
      ))}
      {canEdit && (
        <form onSubmit={(e) => { e.preventDefault(); post({ action: "add", ...f }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 16, borderTop: "1px solid var(--line)" }}>
          <input className="so-input" placeholder="Name" aria-label="Competitor name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 140px" }} />
          <input className="so-input" placeholder="@handle" aria-label="Handle" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} style={{ flex: "1 1 120px" }} />
          <input className="so-input" placeholder="What you noticed" aria-label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ flex: "2 1 220px" }} />
          <button className="so-btn" data-variant="primary" disabled={!f.name.trim()}>Add</button>
          {err && <span role="alert" style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</span>}
        </form>
      )}
    </Panel>
  );
}

export function Analyst({ canAsk }: { canAsk: boolean }) {
  const [q, setQ] = useState("");
  const [a, setA] = useState<{ q: string; text: string; err?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true); setQ("");
    try {
      const r = await fetch("/api/market-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", question: text }) });
      const j = await r.json();
      setA((x) => [{ q: text, text: r.ok ? j.answer : j.error, err: !r.ok }, ...x]);
    } finally { setBusy(false); }
  }
  return (
    <Panel title="AI analyst" sub="Answers from your own posts, brand brain and watchlist. It has no market data, so it will say so instead of guessing.">
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PROMPTS.map((p) => <button key={p} type="button" className="so-btn" disabled={!canAsk || busy} onClick={() => ask(p)}>{p}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} style={{ display: "flex", gap: 8 }}>
          <input className="so-input" aria-label="Ask the analyst" placeholder="Ask about your content or niche…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} disabled={!canAsk} />
          <button className="so-btn" data-variant="primary" disabled={!canAsk || busy || !q.trim()}>{busy ? "Thinking…" : "Ask"}</button>
        </form>
        {a.map((x, i) => (
          <div key={i} data-answer style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12, fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{x.q}</div>
            <div style={{ whiteSpace: "pre-wrap", color: x.err ? "var(--red)" : undefined }}>{x.text}</div>
            {!x.err && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text3)" }}>AI answer from workspace data. Not measured market data.</div>}
          </div>
        ))}
      </div>
    </Panel>
  );
}
