"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { TEMPLATE_FILTERS, TEMPLATES } from "@/lib/portfolio/templates";
import { type PortfolioDoc, type Viewport, VIEWPORT_LABEL, VIEWPORT_WIDTH } from "@/lib/portfolio/types";
import { PortfolioThumb } from "./thumb";
import { PortfolioView } from "./render";
import { VIEWPORT_ICON } from "./editor/icons";

export interface SavedTemplate { id: string; name: string; createdAt: string; doc: PortfolioDoc }
export type TemplateChoice = { templateId: string } | { savedTemplateId: string };

interface Card { key: string; name: string; desc: string; audience: string; fonts: string; tags: string[]; doc: PortfolioDoc | null; mine: boolean; choice: TemplateChoice }

/** The template picker: filter by profession, preview at any width, pick one. */
export function TemplateGallery({ saved, busy, cta, onChoose, onDeleteSaved, suggested = "stone" }: {
  saved: SavedTemplate[]; busy: boolean; cta: string; onChoose: (c: TemplateChoice) => void; onDeleteSaved?: (id: string) => void; suggested?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [preview, setPreview] = useState<Card | null>(null);
  const [vp, setVp] = useState<Viewport>("desktop");
  const cards = useMemo<Card[]>(() => [
    ...saved.map((s) => ({ key: `saved-${s.id}`, name: s.name, desc: `Saved from your portfolio on ${new Date(s.createdAt).toLocaleDateString()}. Includes your content, layout and theme.`, audience: "Only visible to you", fonts: "", tags: ["mine"], doc: s.doc, mine: true, choice: { savedTemplateId: s.id } as TemplateChoice })),
    ...TEMPLATES.map((t) => ({ key: t.id, name: t.name, desc: t.desc, audience: t.audience, fonts: t.fonts, tags: t.tags, doc: t.id === "blank" ? null : t.make(), mine: false, choice: { templateId: t.id } as TemplateChoice })),
  ], [saved]);
  const filters = [...(saved.length ? [["mine", "Your templates"] as [string, string]] : []), ...TEMPLATE_FILTERS];
  const shown = cards.filter((c) => filter === "all" || c.tags.includes(filter));
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div role="group" aria-label="Filter templates by profession" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {filters.map(([id, label]) => {
          const on = filter === id;
          const n = id === "all" ? cards.length : cards.filter((c) => c.tags.includes(id)).length;
          return <button type="button" key={id} aria-pressed={on} onClick={() => setFilter(id)} style={{ height: 32, padding: "0 13px", borderRadius: 999, border: `1px solid ${on ? "rgba(72,237,133,.5)" : "var(--line2)"}`, background: on ? "rgba(72,237,133,.1)" : "transparent", color: on ? "var(--text)" : "var(--text2)", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>{label}<span className="pe-mono" style={{ fontSize: 11, opacity: 0.6 }}>{n}</span></button>;
        })}
      </div>
      <div role="list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(250px, 100%), 1fr))", gap: 18 }}>
        {shown.map((c) => (
          <article role="listitem" key={c.key} style={{ display: "flex", flexDirection: "column", background: "var(--panel)", border: `1px solid ${c.key === suggested || c.mine ? "rgba(72,237,133,.35)" : "var(--line)"}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ position: "relative", aspectRatio: "4 / 5", overflow: "hidden", borderBottom: "1px solid var(--line)", background: c.doc?.theme.bg ?? "#fff" }}>
              {c.doc ? <PortfolioThumb doc={c.doc} scope={`tpl-${c.key}`} /> : (
                <div style={{ position: "absolute", inset: 18, border: "1.5px dashed rgba(20,20,30,.22)", borderRadius: 10, display: "grid", placeItems: "center", color: "#5A5A66", textAlign: "center" }}>
                  <div><Plus size={28} /><div style={{ fontWeight: 600, fontSize: 13, marginTop: 6, color: "#2A2A33" }}>Empty page</div><div style={{ fontSize: 12 }}>Start with a Section</div></div>
                </div>
              )}
              {(c.key === suggested || c.mine) && <span className="pe-chip ok" style={{ position: "absolute", left: 12, top: 12, background: "#06140B", border: "1px solid rgba(72,237,133,.4)" }}>{c.mine ? "Yours" : "Suggested"}</span>}
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{c.name}</h3><span style={{ fontSize: 11.5, color: "var(--text3)" }}>{c.fonts}</span></div>
              <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5, lineHeight: 1.5, flex: 1 }}>{c.desc}</p>
              <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{c.audience}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {c.doc && <button type="button" className="pe-btn" style={{ flex: 1 }} onClick={() => { setVp("desktop"); setPreview(c); }}>Preview</button>}
                <button type="button" className="pe-btn pri" style={{ flex: 1 }} disabled={busy} onClick={() => onChoose(c.choice)}>{c.doc ? cta : "Start blank"}</button>
                {c.mine && onDeleteSaved && "savedTemplateId" in c.choice && <button type="button" className="pe-ib" aria-label={`Delete ${c.name}`} title="Delete template" onClick={() => onDeleteSaved((c.choice as { savedTemplateId: string }).savedTemplateId)}><Trash2 size={15} /></button>}
              </div>
            </div>
          </article>
        ))}
      </div>

      {preview?.doc && (
        <div role="dialog" aria-modal="true" aria-label={`${preview.name} preview`} className="pe" style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", background: "#08080A" }}>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--line)", background: "var(--side)", flexWrap: "wrap" }}>
            <button type="button" className="pe-btn" onClick={() => setPreview(null)}><ChevronLeft size={14} />All templates</button>
            <strong>{preview.name}</strong>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>{preview.mine ? "Your saved design" : "Sample content: you’ll replace it with yours"}</span>
            <span style={{ flex: 1 }} />
            <div className="pe-seg">
              {(["desktop", "tablet", "mobile"] as Viewport[]).map((k) => { const I = VIEWPORT_ICON[k]; return <button type="button" key={k} aria-pressed={vp === k} aria-label={VIEWPORT_LABEL[k]} style={{ width: 34, flex: "none" }} onClick={() => setVp(k)}><I size={14} /></button>; })}
            </div>
            <button type="button" className="pe-btn pri" disabled={busy} onClick={() => { const c = preview; setPreview(null); onChoose(c.choice); }}>{cta}: {preview.name}</button>
          </div>
          <div className="pe-scroll" style={{ flex: 1, padding: vp === "desktop" ? 0 : "28px 16px", background: "#121216" }}>
            <div style={vp === "desktop" ? { width: "100%", minHeight: "100%", background: preview.doc.theme.bg } : { width: VIEWPORT_WIDTH[vp], margin: "0 auto", borderRadius: vp === "mobile" ? 28 : 18, overflow: "clip", background: preview.doc.theme.bg, boxShadow: "0 0 0 1px rgba(255,255,255,.1), 0 30px 80px rgba(0,0,0,.5)" }}>
              <PortfolioView doc={preview.doc} scope="tplpreview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
