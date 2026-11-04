"use client";

import type { ReactNode } from "react";
import { Plus, Upload, X } from "lucide-react";
import { ART_KEYS, artName, artUri } from "@/lib/portfolio/art";

/**
 * Inspector field descriptors and their controls. The inspector model
 * (inspector.ts) decides which fields a component shows; this file draws them.
 */

export interface Override { ov?: boolean; reset?: () => void }
export type Field =
  | ({ kind: "text"; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; warn?: string } & Override)
  | ({ kind: "area"; label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: string; mono?: boolean } & Override)
  | ({ kind: "range"; label: string; value: number; min: number; max: number; step?: number; display: string; onChange: (v: number) => void } & Override)
  | ({ kind: "seg"; label: string; options: { value: string | number; label: string; title?: string }[]; value: string | number; onChange: (v: string | number) => void } & Override)
  | ({ kind: "font"; label: string; options: { value: string; label: string; family: string }[]; value: string; onChange: (v: string) => void } & Override)
  | ({ kind: "color"; label: string; swatches: { value: string; title: string; css: string }[]; value: string; hex: string; hexText: string; onChange: (v: string | null) => void } & Override)
  | { kind: "toggle"; label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }
  | ({ kind: "step"; label: string; value: number; min: number; max: number; display?: string; onChange: (v: number) => void } & Override)
  | { kind: "note"; text: string; tone?: "warn" | "info"; action?: { label: string; run: () => void } }
  | { kind: "image"; label: string; value: string | null; onChange: (v: string | null) => void; onUpload: (file: File) => void; uploading?: boolean }
  | { kind: "links"; items: { label: string; url: string }[]; onChange: (items: { label: string; url: string }[]) => void }
  | { kind: "presets"; items: { name: string; bg: string; fg: string; accent: string; family: string; weight: number; apply: () => void }[] }
  | { kind: "overrides"; items: { vp: string; label: string; value: string; reset: () => void }[]; empty: string };

export interface Group { title: string; fields: Field[] }

function Label({ text, f, extra }: { text: string; f?: Override; extra?: ReactNode }) {
  if (!text) return null;
  return (
    <div className="pe-field-label">
      <span className="pe-lbl">{text}</span>
      {extra}
      {f?.ov && <><span className="pe-ov-dot" title="Overridden on this device" /><button type="button" className="pe-link-btn" onClick={f.reset}>Reset</button></>}
    </div>
  );
}

function FieldView({ f }: { f: Field }) {
  switch (f.kind) {
    case "text":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <input className="pe-inp" value={f.value} placeholder={f.placeholder} aria-label={f.label} onChange={(e) => f.onChange(e.target.value)} />
          {f.warn && <div style={{ fontSize: 11.5, color: "var(--amber)" }}>{f.warn}</div>}
          {f.hint && <div style={{ fontSize: 11, color: "var(--text3)" }}>{f.hint}</div>}
        </div>
      );
    case "area":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <textarea className={`pe-inp${f.mono ? " pe-mono" : ""}`} rows={f.rows ?? 4} value={f.value} placeholder={f.placeholder} aria-label={f.label} onChange={(e) => f.onChange(e.target.value)} />
          {f.hint && <div style={{ fontSize: 11, color: "var(--text3)" }}>{f.hint}</div>}
        </div>
      );
    case "range":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} extra={<span className="pe-mono" style={{ fontSize: 11, color: "var(--text2)" }}>{f.display}</span>} />
          <input type="range" className="pe-range" min={f.min} max={f.max} step={f.step ?? 1} value={f.value} aria-label={f.label} onChange={(e) => f.onChange(Number(e.target.value))} />
        </div>
      );
    case "seg":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <div className="pe-seg" role="group" aria-label={f.label || undefined}>
            {f.options.map((o) => <button type="button" key={String(o.value)} aria-pressed={o.value === f.value} title={o.title ?? o.label} onClick={() => f.onChange(o.value)}>{o.label}</button>)}
          </div>
        </div>
      );
    case "font":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <div className="pe-fonts" role="group" aria-label={f.label}>
            {f.options.map((o) => <button type="button" key={o.value} aria-pressed={o.value === f.value} style={{ fontFamily: o.family }} onClick={() => f.onChange(o.value)}>{o.label}</button>)}
          </div>
        </div>
      );
    case "color":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {f.swatches.map((s) => <button type="button" key={s.value || "none"} className="pe-sw" aria-pressed={(f.value || "") === s.value} title={s.title} aria-label={s.title} style={{ background: s.css }} onClick={() => f.onChange(s.value || null)} />)}
            <label title="Custom colour" style={{ position: "relative", width: 22, height: 22, borderRadius: 6, border: "1px dashed rgba(255,255,255,.3)", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--text2)" }}>
              <Plus size={12} />
              <input type="color" value={f.hex} aria-label={`Custom ${f.label.toLowerCase()}`} onChange={(e) => f.onChange(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }} />
            </label>
            <span className="pe-mono" style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>{f.hexText}</span>
          </div>
        </div>
      );
    case "toggle":
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12.5 }}>{f.label}{f.hint && <span style={{ display: "block", fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{f.hint}</span>}</span>
          <button type="button" role="switch" aria-checked={f.on} aria-label={f.label} className="pe-switch" onClick={() => f.onChange(!f.on)}><span /></button>
        </div>
      );
    case "step":
      return (
        <div className="pe-field">
          <Label text={f.label} f={f} />
          <div className="pe-step">
            <button type="button" aria-label={`Decrease ${f.label}`} disabled={f.value <= f.min} onClick={() => f.onChange(Math.max(f.min, f.value - 1))}>−</button>
            <span>{f.display ?? f.value}</span>
            <button type="button" aria-label={`Increase ${f.label}`} disabled={f.value >= f.max} onClick={() => f.onChange(Math.min(f.max, f.value + 1))}>+</button>
          </div>
        </div>
      );
    case "note":
      return <div className={`pe-note${f.tone ? " " + f.tone : ""}`}>{f.text}{f.action && <button type="button" onClick={f.action.run}>{f.action.label}</button>}</div>;
    case "image":
      return (
        <div className="pe-field">
          <Label text={f.label} />
          <div className="pe-arts">
            {ART_KEYS.map((k) => <button type="button" key={k} aria-pressed={f.value === k} aria-label={artName(k)} title={artName(k)} onClick={() => f.onChange(k)}><img src={artUri(k) ?? ""} alt="" /></button>)}
          </div>
          {f.value && !ART_KEYS.includes(f.value) && <div className="pe-note" style={{ display: "flex", gap: 8, alignItems: "center" }}><img src={f.value} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />Your uploaded image</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <label className="pe-btn" style={{ flex: 1, height: 30, cursor: "pointer" }}>
              <Upload size={13} />{f.uploading ? "Uploading…" : "Upload"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) f.onUpload(file); e.target.value = ""; }} />
            </label>
            <button type="button" className="pe-btn" style={{ height: 30 }} disabled={!f.value} onClick={() => f.onChange(null)}>Remove</button>
          </div>
        </div>
      );
    case "links":
      return (
        <div className="pe-field">
          {f.items.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr) 24px", gap: 4, alignItems: "center" }}>
              <input className="pe-inp" style={{ height: 30 }} aria-label="Link label" value={l.label} onChange={(e) => f.onChange(f.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="pe-inp pe-mono" style={{ height: 30, fontSize: 11.5 }} aria-label="Link URL" value={l.url} onChange={(e) => f.onChange(f.items.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className="pe-ib sm" aria-label="Remove link" onClick={() => f.onChange(f.items.filter((_, j) => j !== i))}><X size={12} /></button>
            </div>
          ))}
          <button type="button" className="pe-btn ghost" style={{ height: 28, justifyContent: "flex-start", padding: "0 6px", color: "var(--accent)" }} onClick={() => f.onChange([...f.items, { label: "Website", url: "https://" }])}><Plus size={13} />Add link</button>
        </div>
      );
    case "presets":
      return (
        <div className="pe-presets">
          {f.items.map((p) => (
            <button type="button" key={p.name} aria-label={`Apply ${p.name} theme`} title={p.name} style={{ background: p.bg, color: p.fg }} onClick={p.apply}>
              <span style={{ fontSize: 15, fontWeight: p.weight, lineHeight: 1, fontFamily: p.family }}>Aa</span>
              <span style={{ display: "flex", gap: 3, alignItems: "center" }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: p.accent }} /><span style={{ fontSize: 10.5, opacity: 0.8 }}>{p.name}</span></span>
            </button>
          ))}
        </div>
      );
    case "overrides":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {f.items.map((o, i) => (
            <div key={i} className="pe-ovr">
              <span className="pe-chip blue" style={{ height: 18, padding: "0 6px", fontSize: 10.5 }}>{o.vp}</span>
              <span className="grow">{o.label}</span>
              <span className="pe-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{o.value}</span>
              <button type="button" className="pe-link-btn" onClick={o.reset}>Reset</button>
            </div>
          ))}
          {!f.items.length && <div className="pe-note" style={{ borderStyle: "dashed" }}>{f.empty}</div>}
        </div>
      );
  }
}

export function InspectorGroups({ groups }: { groups: Group[] }) {
  return (
    <>
      {groups.map((g, i) => (
        <section key={`${g.title}-${i}`} className="pe-group">
          <h3>{g.title}</h3>
          {g.fields.map((f, j) => <FieldView key={j} f={f} />)}
        </section>
      ))}
    </>
  );
}
