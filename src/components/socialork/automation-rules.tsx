"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { card } from "./design-bits";

type Rule = { key: string; name: string; when: string; then: string; saves: string; trigger: string; runLabel?: string; on: boolean; runs: number; canEdit: boolean };
type Result = { ok: boolean; count: number; message: string; links?: { title: string; path: string }[] };

export function AutomationRules({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(rules.map((r) => [r.key, r.on])));
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<Record<string, Result | string>>({});

  async function call(rule: string, body: object) {
    setBusy(rule);
    try {
      const res = await fetch("/api/automations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rule, ...body }) });
      const j = await res.json();
      if (!res.ok) { setOut((o) => ({ ...o, [rule]: j.error ?? "Something went wrong" })); return null; }
      return j;
    } finally { setBusy(null); }
  }
  async function toggle(r: Rule) {
    const next = !on[r.key];
    setOn((s) => ({ ...s, [r.key]: next }));
    const j = await call(r.key, { on: next });
    if (!j) setOn((s) => ({ ...s, [r.key]: !next }));
    else router.refresh();
  }
  async function run(r: Rule) {
    const j = await call(r.key, { run: true });
    if (j) { setOut((o) => ({ ...o, [r.key]: j.result })); router.refresh(); }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,360px),1fr))", gap: 12 }}>
      {rules.map((r) => {
        const res = out[r.key];
        return (
          <section key={r.key} className="so-card" data-rule={r.key} style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{r.name}</span>
              {r.runs > 0 && <span style={{ font: "600 11px 'IBM Plex Mono', monospace", color: "var(--text3)" }}>{r.runs} run{r.runs === 1 ? "" : "s"}</span>}
              <button type="button" role="switch" aria-checked={on[r.key]} aria-label={r.name} disabled={!r.canEdit || busy === r.key} onClick={() => toggle(r)}
                style={{ width: 36, height: 22, position: "relative", border: 0, borderRadius: 11, cursor: r.canEdit ? "pointer" : "not-allowed", background: on[r.key] ? "var(--accent)" : "var(--panel2)", transition: "background .2s" }}>
                <span style={{ position: "absolute", top: 2, left: on[r.key] ? 16 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
              {([["WHEN", r.when, "var(--text3)"], ["THEN", r.then, "var(--accent)"], ["SAVES", r.saves, "var(--text3)"]] as const).map(([k, v, c]) => (
                <div key={k} style={{ display: "flex", gap: 8, color: k === "SAVES" ? "var(--text3)" : undefined }}>
                  <span style={{ width: 42, flex: "none", font: "600 10.5px 'IBM Plex Mono', monospace", color: c, paddingTop: 2 }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            {r.runLabel && (
              <div>
                <button type="button" className="so-btn" disabled={!r.canEdit || busy === r.key} onClick={() => run(r)}>{busy === r.key ? "Running…" : r.runLabel}</button>
              </div>
            )}
            {res && (
              <div role="status" style={{ fontSize: 12.5, padding: "8px 10px", borderRadius: 8, background: "var(--panel2)" }}>
                {typeof res === "string" ? res : res.message}
                {typeof res !== "string" && res.links?.slice(0, 6).map((l) => (
                  <div key={l.path}><a href={l.path} style={{ color: "var(--accent)" }}>{l.title}</a></div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
