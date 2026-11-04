"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { clone, makeNode } from "@/lib/portfolio/model";
import type { PNode, PortfolioDoc } from "@/lib/portfolio/types";
import { PortfolioView } from "../render";

type Kind = "bold" | "italic" | "code" | "link" | "h2" | "h3" | "ul" | "ol" | "quote" | "hr";
const WRAP: Partial<Record<Kind, [string, string, string]>> = { bold: ["**", "**", "bold text"], italic: ["*", "*", "italic text"], code: ["`", "`", "code"], link: ["[", "](https://)", "link text"] };
const LINE: Partial<Record<Kind, string>> = { h2: "## ", h3: "### ", ul: "- ", ol: "1. ", quote: "> " };

/** Apply a toolbar action to `value` with the given selection; returns the new text and selection. */
export function applyMarkdown(kind: Kind, value: string, a: number, b: number): { text: string; start: number; end: number } {
  const sel = value.slice(a, b);
  const w = WRAP[kind];
  if (w) {
    const inner = sel || w[2];
    const start = a + w[0].length;
    return { text: value.slice(0, a) + w[0] + inner + w[1] + value.slice(b), start, end: start + inner.length };
  }
  const pre = LINE[kind];
  if (pre) {
    const ls = value.lastIndexOf("\n", a - 1) + 1;
    let le = value.indexOf("\n", b);
    if (le < 0) le = value.length;
    const lines = value.slice(ls, le).split("\n");
    const all = lines.every((l) => l.startsWith(pre));
    const out = lines.map((l, i) => (all ? l.slice(pre.length) : (kind === "ol" ? `${i + 1}. ` : pre) + l.replace(/^(#{1,3} |- |\d+\. |> )/, ""))).join("\n");
    return { text: value.slice(0, ls) + out + value.slice(le), start: ls, end: ls + out.length };
  }
  const ins = (a && value[a - 1] !== "\n" ? "\n\n" : "") + "---\n\n";
  return { text: value.slice(0, a) + ins + value.slice(b), start: a + ins.length, end: a + ins.length };
}

const TOOLS: ({ kind: Kind; label: string; title: string; style?: React.CSSProperties } | "sep")[] = [
  { kind: "bold", label: "B", title: "Bold (⌘B)", style: { fontWeight: 800 } }, { kind: "italic", label: "I", title: "Italic (⌘I)", style: { fontStyle: "italic" } },
  { kind: "h2", label: "H2", title: "Heading" }, { kind: "h3", label: "H3", title: "Subheading" }, "sep",
  { kind: "ul", label: "• List", title: "Bulleted list" }, { kind: "ol", label: "1. List", title: "Numbered list" }, { kind: "quote", label: "❝ Quote", title: "Quote" }, "sep",
  { kind: "link", label: "Link", title: "Link (⌘K)" }, { kind: "code", label: "</>", title: "Inline code" }, { kind: "hr", label: "—", title: "Divider" },
];

/**
 * Split-screen Markdown editor for a Text block. The preview renders the real
 * block with the page's theme, so what you see is what visitors get.
 */
export function MarkdownEditor({ node, doc, name, compact, onSave, onCancel }: { node: PNode; doc: PortfolioDoc; name: string; compact: boolean; onSave: (text: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(node.props.text ?? "");
  const [mode, setMode] = useState<"write" | "split" | "preview">(compact ? "write" : "split");
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); }, []);

  const previewDoc = useMemo<PortfolioDoc>(() => {
    const n = clone(node);
    n.props.text = draft;
    n.style.maxW = 0;
    return { ...doc, root: [makeNode("section", { label: "" }, { padY: 36, padX: 40 }, [n], "mdprev")] };
  }, [doc, node, draft]);

  const run = (kind: Kind) => {
    const el = ta.current;
    const r = applyMarkdown(kind, draft, el?.selectionStart ?? draft.length, el?.selectionEnd ?? draft.length);
    setDraft(r.text);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.start, r.end); });
  };
  const words = (draft.trim().match(/\S+/g) ?? []).length;

  return (
    <>
      <div className="pe-backdrop" onClick={onCancel} />
      <div className="pe-modal wide" role="dialog" aria-modal="true" aria-labelledby="md-h" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
        <header style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px 12px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <span className="pe-chip ok pe-mono" style={{ height: 26 }}>M↓</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="md-h" style={{ fontSize: 15 }}>Write in Markdown</h2>
            <div style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name} · preview uses your page’s fonts and colours</div>
          </div>
          <div className="pe-seg" role="group" aria-label="Editor view" style={{ width: 230 }}>
            {(["write", "split", "preview"] as const).map((m) => <button type="button" key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
          </div>
          <button type="button" className="pe-ib" aria-label="Close without saving" onClick={onCancel}><X size={16} /></button>
        </header>
        <div role="toolbar" aria-label="Formatting" style={{ flex: "none", display: "flex", alignItems: "center", gap: 2, padding: "6px 10px", borderBottom: "1px solid var(--line)", background: "var(--side)", flexWrap: "wrap" }}>
          {TOOLS.map((t, i) => t === "sep"
            ? <span key={i} aria-hidden="true" style={{ width: 1, height: 18, background: "var(--line2)", margin: "0 6px" }} />
            : <button type="button" key={t.kind} className="pe-md-tool" aria-label={t.title} title={t.title} style={t.style} onClick={() => run(t.kind)}>{t.label}</button>)}
          <span style={{ flex: 1 }} />
          <span className="pe-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{words} words · {draft.length} characters</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: mode === "split" ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)" }}>
          {mode !== "preview" && (
            <div style={{ minHeight: 0, borderRight: mode === "split" ? "1px solid var(--line)" : undefined }}>
              <textarea
                ref={ta}
                aria-label="Markdown source"
                className="pe-mono"
                value={draft}
                spellCheck
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  const mod = e.metaKey || e.ctrlKey;
                  const k = e.key.toLowerCase();
                  if (mod && k === "enter") { e.preventDefault(); onSave(draft); }
                  else if (mod && k === "b") { e.preventDefault(); run("bold"); }
                  else if (mod && k === "i") { e.preventDefault(); run("italic"); }
                  else if (mod && k === "k") { e.preventDefault(); run("link"); }
                }}
                style={{ width: "100%", height: "100%", resize: "none", border: 0, outline: "none", padding: "22px 24px", background: "var(--bg)", color: "#E4E4EA", fontSize: 14, lineHeight: 1.75 }}
              />
            </div>
          )}
          {mode !== "write" && (
            <div className="pe-scroll" style={{ background: doc.theme.bg }}>
              <PortfolioView doc={previewDoc} scope="mdprev" />
            </div>
          )}
        </div>
        <footer style={{ flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 240 }}>
            {["**bold**", "*italic*", "[link](url)", "## heading", "- list", "> quote", "⌘↵ save"].map((s) => <span key={s} className="pe-kbd">{s}</span>)}
          </div>
          <button type="button" className="pe-btn ghost lg" onClick={onCancel}>Cancel</button>
          <button type="button" className="pe-btn pri lg" onClick={() => onSave(draft)}>Save to page</button>
        </footer>
      </div>
    </>
  );
}
