"use client";

/**
 * The visual builder (P4–P6), rebuilt around three complaints: it was busy, it
 * broke on narrow screens, and one bad state could take the page down.
 *
 * Rules the shell now follows:
 *  - one primary action in the toolbar (Publish); everything else secondary;
 *  - insert from a grouped menu, not a wall of sixteen buttons;
 *  - the inspector shows only the controls that component has, in collapsible
 *    groups, so a heading does not look like a grid;
 *  - three panes on desktop, two on tablet, one plus a sheet on mobile;
 *  - the canvas is transform-scaled inside a sized box, never CSS-`zoom`ed, so
 *    clicks land where they look;
 *  - an error boundary keeps a render mistake from blanking the page.
 */
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DocumentRenderer, type RenderMedia } from "@/components/portfolio/render/document-renderer";
import { applyCommand, applyResponsive, locateNode } from "@/lib/portfolio/commands";
import { markdownToNodes } from "@/lib/portfolio/markdown";
import { REGISTRY, childAllowed, isUserInsertable } from "@/lib/portfolio/registry";
import { FONT_ALLOWLIST } from "@/lib/portfolio/tokens";
import { parseDocument } from "@/lib/portfolio/validate";
import type { PortfolioDocument, PortfolioNode, StyleSet } from "@/lib/portfolio/types";

type Breakpoint = "desktop" | "tablet" | "mobile";
type NodeType = PortfolioNode["type"];

const FRAME_WIDTH: Record<Breakpoint, number> = { desktop: 1120, tablet: 820, mobile: 390 };
const STAGE_HEIGHT: Record<Breakpoint, number> = { desktop: 720, tablet: 880, mobile: 760 };

const CATEGORIES: { label: string; types: NodeType[] }[] = [
  { label: "Layout", types: ["SECTION", "CONTAINER", "STACK", "GRID", "COLUMN", "SPACER", "DIVIDER"] },
  { label: "Content", types: ["HEADING", "TEXT", "BUTTON"] },
  { label: "Media", types: ["IMAGE"] },
  { label: "Portfolio", types: ["PROJECT_CARD", "EXPERIENCE_ITEM", "SKILL_GROUP", "SOCIAL_LINKS", "CONTACT_BLOCK"] },
];

interface FieldSpec {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}

const CONTENT_FIELDS: Partial<Record<NodeType, FieldSpec[]>> = {
  HEADING: [{ key: "text", label: "Text", multiline: true }, { key: "level", label: "Level (1–4)" }],
  TEXT: [{ key: "text", label: "Text", multiline: true }],
  BUTTON: [{ key: "label", label: "Label" }, { key: "href", label: "Link", placeholder: "https://… or mailto:…" }],
  IMAGE: [{ key: "src", label: "Image URL", placeholder: "/portfolio/cover-aether.jpg" }, { key: "alt", label: "Alt text" }, { key: "caption", label: "Caption" }],
  PROJECT_CARD: [
    { key: "title", label: "Title" },
    { key: "summary", label: "Summary", multiline: true },
    { key: "year", label: "Year" },
    { key: "coverSrc", label: "Cover image", placeholder: "/portfolio/cover-aether.jpg" },
    { key: "href", label: "Link" },
  ],
  EXPERIENCE_ITEM: [
    { key: "title", label: "Role" },
    { key: "org", label: "Company" },
    { key: "start", label: "Start (YYYY-MM)" },
    { key: "end", label: "End (YYYY-MM)" },
  ],
  SKILL_GROUP: [{ key: "title", label: "Group label" }],
  CONTACT_BLOCK: [
    { key: "email", label: "Email" },
    { key: "ctaLabel", label: "Button label" },
    { key: "note", label: "Note", multiline: true },
  ],
  SECTION: [{ key: "anchor", label: "Anchor id", placeholder: "contact" }],
};

/** Only the style controls that make sense for the selected component. */
const TYPE_STYLE_KEYS: Partial<Record<NodeType, (keyof StyleSet)[]>> = {
  HEADING: ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign"],
  TEXT: ["fontSize", "lineHeight", "maxWidth", "textAlign"],
  BUTTON: ["radius", "paddingX", "paddingY"],
  IMAGE: ["radius", "opacity"],
  PROJECT_CARD: ["radius", "paddingY"],
  EXPERIENCE_ITEM: ["gap"],
  SKILL_GROUP: ["gap"],
  CONTACT_BLOCK: ["gap"],
  SECTION: ["paddingY", "minHeight"],
  CONTAINER: ["maxWidth", "paddingX"],
  STACK: ["gap", "paddingY"],
  GRID: ["columns", "rowGap", "columnGap"],
  COLUMN: ["span"],
  SPACER: ["minHeight"],
  DIVIDER: ["paddingY"],
};

const SIZE_CONTROLS: Record<string, { label: string; min: number; max: number; step?: number; unit?: string }> = {
  fontSize: { label: "Font size", min: 10, max: 160, unit: "px" },
  fontWeight: { label: "Weight", min: 400, max: 800, step: 100 },
  lineHeight: { label: "Line height", min: 0.9, max: 2.2, step: 0.05 },
  letterSpacing: { label: "Tracking", min: -0.05, max: 0.3, step: 0.01, unit: "em" },
  gap: { label: "Gap", min: 0, max: 240, unit: "px" },
  rowGap: { label: "Row gap", min: 0, max: 240, unit: "px" },
  columnGap: { label: "Column gap", min: 0, max: 240, unit: "px" },
  paddingX: { label: "Padding X", min: 0, max: 240, unit: "px" },
  paddingY: { label: "Padding Y", min: 0, max: 240, unit: "px" },
  maxWidth: { label: "Max width", min: 320, max: 1600, unit: "px" },
  minHeight: { label: "Min height", min: 0, max: 2000, unit: "px" },
  radius: { label: "Radius", min: 0, max: 999, unit: "px" },
  columns: { label: "Columns", min: 1, max: 12 },
  span: { label: "Span", min: 1, max: 12 },
  opacity: { label: "Opacity", min: 0, max: 1, step: 0.05 },
};

let idCounter = 0;
const newId = (type: string): string => `${type.toLowerCase()}-${Date.now().toString(36)}-${(idCounter += 1).toString(36)}`;

function makeNode(type: NodeType): PortfolioNode {
  const spec = REGISTRY[type];
  const props: Record<string, unknown> = { ...spec.defaults };
  if (type === "HEADING") props.text = "Your heading";
  if (type === "TEXT") props.text = "Write something about your work.";
  if (type === "BUTTON") {
    props.label = "Get in touch";
    props.href = "mailto:you@example.com";
  }
  if (type === "CONTACT_BLOCK") props.email = "you@example.com";
  if (type === "EXPERIENCE_ITEM") {
    props.start = "2022-01";
    props.current = true;
    props.title = "Your role";
    props.org = "Company";
  }
  if (type === "PROJECT_CARD") props.title = "Project name";
  if (type === "SKILL_GROUP") {
    props.title = "Skills";
    props.items = ["One", "Two"];
  }
  if (type === "IMAGE") props.src = "/portfolio/cover-aether.jpg";
  return { id: newId(type), type, props, style: {}, ...(spec.allowsChildren ? { children: [] } : {}) } as PortfolioNode;
}

export interface BuilderProps {
  initialDocument: PortfolioDocument;
  initialVersion: number;
  handle: string;
  status: "DRAFT" | "PUBLISHED";
  media: Record<string, RenderMedia>;
}

class BuilderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="so-page">
        <h1 className="so-h1">The builder hit an error</h1>
        <p className="so-sub">Your draft is saved. Reloading usually clears it.</p>
        <button type="button" className="so-btn" data-variant="primary" onClick={() => window.location.reload()}>
          Reload the builder
        </button>
      </div>
    );
  }
}

function BuilderInner({ initialDocument, initialVersion, handle, status, media }: BuilderProps) {
  const [doc, setDoc] = useState<PortfolioDocument>(initialDocument);
  const [version, setVersion] = useState(initialVersion);
  const [selected, setSelected] = useState<string | null>(initialDocument.pages[0]?.root.id ?? null);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [past, setPast] = useState<PortfolioDocument[]>([]);
  const [future, setFuture] = useState<PortfolioDocument[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "conflict">("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [published, setPublished] = useState(status === "PUBLISHED");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1);
  const [panel, setPanel] = useState<"none" | "layers" | "style">("none");
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [markdown, setMarkdown] = useState("## About me\n\nI design **calm** interfaces.\n\n- Design systems\n- Motion\n");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ doc, version });

  useEffect(() => {
    latest.current = { doc, version };
  }, [doc, version]);

  useEffect(() => {
    const width = window.innerWidth;
    setBreakpoint(width < 760 ? "mobile" : width < 1180 ? "tablet" : "desktop");
  }, []);

  const commit = useCallback((next: PortfolioDocument | null, error?: string) => {
    if (!next) {
      setMessage(error ?? "That change is not allowed here.");
      return;
    }
    setPast((stack) => [...stack.slice(-99), latest.current.doc]);
    setFuture([]);
    setDoc(next);
    setSaveState("dirty");
    setMessage(error ?? null);
  }, []);

  const run = useCallback(
    (command: Parameters<typeof applyCommand>[1]) => {
      const result = applyCommand(latest.current.doc, command);
      commit(result.ok ? result.document : null, result.ok ? undefined : result.error);
    },
    [commit],
  );

  useEffect(() => {
    if (saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/portfolio/draft", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: latest.current.doc, documentVersion: latest.current.version }),
        });
        const data = (await res.json().catch(() => ({}))) as { documentVersion?: number; error?: string };
        if (res.status === 409) {
          setSaveState("conflict");
          setMessage("Changed in another tab — reload before editing further.");
          return;
        }
        if (!res.ok) {
          setSaveState("dirty");
          setMessage(data.error ?? `Save failed (${res.status}).`);
          return;
        }
        setVersion(data.documentVersion ?? latest.current.version + 1);
        setSaveState("saved");
      } catch {
        setSaveState("dirty");
        setMessage("Network error while saving.");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveState, doc]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = (): void => {
      const width = stage.getBoundingClientRect().width || stage.clientWidth || window.innerWidth - 32;
      const available = Math.max(200, width - 32);
      setScale(Math.min(1, Math.max(0.25, available / FRAME_WIDTH[breakpoint])));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [breakpoint]);

  const loc = selected ? locateNode(doc, selected) : null;
  const selectedNode = loc?.node ?? null;
  const insertTarget = useMemo(() => {
    if (!selectedNode) return doc.pages[0]?.root ?? null;
    if (REGISTRY[selectedNode.type].allowsChildren) return selectedNode;
    return loc?.parent ?? doc.pages[0]?.root ?? null;
  }, [selectedNode, loc, doc]);

  /**
   * Where a new component of this type can actually go: the selection if it
   * accepts that child, otherwise the nearest ancestor that does. Before this,
   * inserting from the top level tried to put a heading inside PAGE and failed.
   */
  const resolveInsertParent = (type: NodeType): PortfolioNode | null => {
    let current: PortfolioNode | null = selectedNode ?? doc.pages[0]?.root ?? null;
    while (current) {
      if (REGISTRY[current.type].allowsChildren && childAllowed(current.type, type)) return current;
      current = locateNode(doc, current.id)?.parent ?? null;
    }
    return null;
  };

  const insert = (type: NodeType) => {
    const node = makeNode(type);
    const parent = resolveInsertParent(type);

    // Nothing selected, or only the page root: wrap the new component in a
    // SECTION → CONTAINER → STACK so pressing a component always does something.
    if (!parent) {
      const root = doc.pages[0]?.root;
      if (!root) return;
      const wrapper: PortfolioNode = {
        id: newId("section"),
        type: "SECTION",
        props: { fullBleed: true },
        style: { paddingY: { value: 64 } },
        children: [
          {
            id: newId("container"),
            type: "CONTAINER",
            props: { maxWidthPx: 1080, align: "center" },
            style: {},
            children: [
              {
                id: newId("stack"),
                type: "STACK",
                props: { direction: "column", gapPx: 16, align: "stretch", justify: "start" },
                style: {},
                children: [node],
              },
            ],
          },
        ],
      } as PortfolioNode;
      run({ type: "insert", parentId: root.id, index: root.children?.length ?? 0, node: wrapper });
      setSelected(node.id);
      setPanel("none");
      return;
    }

    run({ type: "insert", parentId: parent.id, index: parent.children?.length ?? 0, node });
    setSelected(node.id);
    setPanel("none");
  };

  const styleValue = (node: PortfolioNode, key: keyof StyleSet): number | string | undefined => {
    const layer = breakpoint === "desktop" ? node.style : node.responsive?.[breakpoint];
    const raw = (layer as Record<string, unknown> | undefined)?.[key] as { value?: unknown } | undefined;
    const value = raw?.value;
    return typeof value === "number" || typeof value === "string" ? (value as number | string) : undefined;
  };

  const setStyle = (key: keyof StyleSet, value: number | string | undefined) => {
    if (!selectedNode) return;
    const patch = value === undefined ? { [key]: undefined } : { [key]: { value } };
    commit(applyResponsive(latest.current.doc, selectedNode.id, breakpoint, patch as Record<string, unknown>));
  };

  const setProp = (key: string, value: string) => {
    if (!selectedNode) return;
    run({ type: "updateProps", nodeId: selectedNode.id, props: { [key]: value } });
  };

  const applyMarkdown = (mode: "append" | "replace") => {
    if (mode === "replace" && !window.confirm("Replace the whole page with this Markdown? You can undo it.")) return;
    const nodes = markdownToNodes(markdown, (kind) => newId(kind));
    const page = doc.pages[0];
    if (!page) return;
    if (mode === "replace") {
      const candidate = { ...doc, pages: [{ ...page, root: { ...page.root, children: nodes } }, ...doc.pages.slice(1)] };
      const parsed = parseDocument(candidate);
      if (!parsed.ok) {
        setMessage(parsed.issues[0]?.message ?? "That Markdown does not produce a valid page.");
        return;
      }
      commit(candidate);
    } else {
      let next: PortfolioDocument | null = doc;
      for (const node of nodes) {
        if (!next) break;
        const result = applyCommand(next, { type: "insert", parentId: next.pages[0].root.id, index: next.pages[0].root.children?.length ?? 0, node });
        next = result.ok ? result.document : null;
      }
      if (next) commit(next);
    }
    setMarkdownOpen(false);
    setMessage(mode === "replace" ? "Page replaced from Markdown." : "Section added from Markdown.");
  };

  const publish = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portfolio/publish", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? `Publish failed (${res.status}).`);
        return;
      }
      setPublished(true);
      setMessage(`Live at /p/${handle}`);
    } catch {
      setMessage("Network error while publishing.");
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/unpublish", { method: "POST" });
      if (res.ok) {
        setPublished(false);
        setMessage("Unpublished — the public URL now returns 404.");
      }
    } finally {
      setBusy(false);
    }
  };

  const renderLayer = (node: PortfolioNode, depth: number): ReactNode => (
    <div key={node.id}>
      <button
        type="button"
        draggable
        onDragStart={(event) => event.dataTransfer.setData("text/pf-node", node.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dragged = event.dataTransfer.getData("text/pf-node");
          if (!dragged || dragged === node.id) return;
          run({ type: "move", nodeId: dragged, parentId: node.id, index: node.children?.length ?? 0 });
        }}
        onClick={() => {
          setSelected(node.id);
          setPanel("style");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          textAlign: "left",
          padding: "5px 8px",
          marginLeft: depth * 10,
          borderRadius: 7,
          cursor: "grab",
          background: selected === node.id ? "rgba(72,237,133,0.12)" : "transparent",
          borderLeft: selected === node.id ? "2px solid var(--accent)" : "2px solid transparent",
          border: "none",
          color: selected === node.id ? "var(--green)" : "var(--text2)",
          fontSize: 12,
        }}
        title="Drag onto another row to nest"
      >
        <span className="so-mono" style={{ fontSize: 9.5, opacity: 0.55 }}>{REGISTRY[node.type].category === "layout" ? "▦" : "◆"}</span>
        <span style={{ fontWeight: selected === node.id ? 600 : 400 }}>{node.type.toLowerCase()}</span>
      </button>
      {node.children?.map((child) => renderLayer(child, depth + 1))}
    </div>
  );

  const styleKeys = (selectedNode && TYPE_STYLE_KEYS[selectedNode.type]) || [];
  const saveBadge = saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : saveState === "conflict" ? "conflict" : "unsaved";

  return (
    <div className="pfb">
      <style>{`
        .pfb{display:flex;flex-direction:column;height:100%;min-height:0}
        .pfb-bar{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
        .pfb-body{display:grid;grid-template-columns:224px minmax(0,1fr) 298px;min-height:0;flex:1}
        .pfb-pane{overflow-y:auto;background:var(--side);padding:12px;display:grid;gap:12px;align-content:start}
        .pfb-left{border-right:1px solid var(--line)}
        .pfb-right{border-left:1px solid var(--line)}
        .pfb-stage{overflow:auto;padding:16px;background:radial-gradient(circle at 50% 0%,#16161c 0%,#0a0a0d 60%)}
        .pfb-sheets{display:none}
        .pfb-field{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line2);border-radius:8px;padding:7px 9px;font-size:12.5px;outline:none;font-family:inherit}
        .pfb-field:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
        .pfb-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        @media (max-width: 1180px){
          .pfb{position:fixed;inset:0;z-index:120;background:var(--bg)}
          .pfb-body{grid-template-columns:minmax(0,1fr)}
          .pfb-left,.pfb-right{position:fixed;top:0;bottom:0;z-index:130;width:300px;box-shadow:0 0 60px rgba(0,0,0,.55);transition:transform .22s ease}
          .pfb-left{left:0;transform:translateX(-102%)}
          .pfb-right{right:0;transform:translateX(102%)}
          .pfb-body[data-layers="open"] .pfb-left{transform:translateX(0)}
          .pfb-body[data-style="open"] .pfb-right{transform:translateX(0)}
          .pfb-sheets{display:flex}
        }
        @media (max-width: 1180px){ .pfb-back{display:inline-flex !important} }
        @media (max-width: 720px){
          .pfb-stage{padding:8px}
          .pfb-bar{padding:8px 10px;gap:6px}
          .pfb-left,.pfb-right{width:86vw}
        }
        @media (prefers-reduced-motion: reduce){ .pfb-left,.pfb-right{transition:none} }
      `}</style>

      <div className="pfb-bar">
        <div className="so-row" style={{ gap: 8 }}>
          <a className="so-btn pfb-back" href="/socialork/overview" style={{ textDecoration: "none", display: "none" }}>←</a>
          <span className="so-h1" style={{ fontSize: 15 }}>Portfolio</span>
          <span className="so-pill so-mono">/{handle}</span>
          <span className="so-pill" data-tone={published ? "approved" : "review"}>{published ? "live" : "draft"}</span>
        </div>

        <div className="so-tabs" style={{ border: "none", paddingBottom: 0 }}>
          {(["desktop", "tablet", "mobile"] as Breakpoint[]).map((bp) => (
            <button key={bp} type="button" className="so-tab" data-active={breakpoint === bp} onClick={() => setBreakpoint(bp)}>
              {bp}
            </button>
          ))}
        </div>

        <div className="so-row pfb-sheets" style={{ gap: 4 }}>
          <button type="button" className="so-btn" onClick={() => setPanel(panel === "layers" ? "none" : "layers")}>Layers</button>
          <button type="button" className="so-btn" onClick={() => setPanel(panel === "style" ? "none" : "style")}>Style</button>
          <button type="button" className="so-btn" onClick={() => setMarkdownOpen(true)}>MD</button>
        </div>

        <div className="so-row" style={{ gap: 6 }}>
          <button type="button" className="so-btn" title="Undo" disabled={past.length === 0} style={{ opacity: past.length ? 1 : 0.4 }}
            onClick={() => { const prev = past[past.length - 1]; if (!prev) return; setPast(past.slice(0, -1)); setFuture([doc, ...future]); setDoc(prev); setSaveState("dirty"); }}>↶</button>
          <button type="button" className="so-btn" title="Redo" disabled={future.length === 0} style={{ opacity: future.length ? 1 : 0.4 }}
            onClick={() => { const next = future[0]; if (!next) return; setPast([...past, doc]); setFuture(future.slice(1)); setDoc(next); setSaveState("dirty"); }}>↷</button>
        </div>

        <div className="so-row" style={{ marginLeft: "auto", gap: 8 }}>
          <span className="so-pill" data-tone={saveState === "conflict" ? "changes" : saveState === "saved" ? "approved" : undefined}>{saveBadge}</span>
          <button type="button" className="so-btn" onClick={() => setMarkdownOpen(true)}>Markdown</button>
          <button type="button" className="so-btn" onClick={() => setPreview((v) => !v)} style={preview ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
            {preview ? "Editing" : "Preview"}
          </button>
          <button type="button" className="so-btn" data-variant="primary" disabled={busy} onClick={() => void publish()}>
            {busy ? "Publishing…" : published ? "Publish again" : "Publish"}
          </button>
          {published ? (
            <>
              <a className="so-btn" href={`/p/${handle}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>View ↗</a>
              <button type="button" className="so-btn" onClick={() => void unpublish()} disabled={busy}>Unpublish</button>
            </>
          ) : null}
        </div>
      </div>

      {message ? <div className="so-banner" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}>{message}</div> : null}

      <div className="pfb-body" data-style={panel === "style" ? "open" : "closed"} data-layers={panel === "layers" ? "open" : "closed"}>
        <div className="pfb-pane pfb-left">
          <div>
            <div className="so-stat-label">Add to {insertTarget?.type.toLowerCase() ?? "page"}</div>
            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {CATEGORIES.map((category) => (
                <details key={category.label} open>
                  <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--text2)", padding: "2px 0" }}>{category.label}</summary>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {category.types.filter((type): type is Exclude<NodeType, "PAGE"> => isUserInsertable(type)).map((type) => (
                      <button key={type} type="button" className="so-btn" style={{ height: 24, padding: "0 7px", fontSize: 10.5 }} onClick={() => insert(type)}>
                        {type.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>

          <div>
            <div className="so-stat-label">Layers</div>
            <div style={{ marginTop: 6 }}>{doc.pages[0]?.root ? renderLayer(doc.pages[0].root, 0) : null}</div>
          </div>
        </div>

        <div
          ref={stageRef}
          className="pfb-stage"
          onClick={(event) => {
            if (preview) return;
            const target = (event.target as HTMLElement).closest("[data-pf-node]");
            setSelected(target ? target.getAttribute("data-pf-node") : null);
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)" }}>
              {breakpoint} · {FRAME_WIDTH[breakpoint]}px · {Math.round(scale * 100)}%
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              data-breakpoint={breakpoint}
              style={{
                width: FRAME_WIDTH[breakpoint],
                height: STAGE_HEIGHT[breakpoint],
                overflowY: "auto",
                // `zoom` (not transform: scale) keeps hit-testing aligned with
                // what the user sees, so clicking a heading selects that heading.
                zoom: scale,
                background: "#131317",
                borderRadius: 14,
                border: "1px solid var(--line2)",
                boxShadow: "0 30px 80px rgba(0,0,0,.55)",
              }}
            >
              <DocumentRenderer document={doc} media={media} />
              {!preview ? (
                <style>{`
                  [data-pf-node]{outline-offset:-1px;outline:1px solid transparent;cursor:pointer;transition:outline-color .12s ease}
                  [data-pf-node]:hover{outline-color:rgba(72,237,133,.4)}
                  ${selected ? `[data-pf-node="${selected}"]{outline:2px solid #48ed85 !important}` : ""}
                `}</style>
              ) : null}
            </div>
          </div>
        </div>

        <div className="pfb-pane pfb-right">
          {selectedNode ? (
            <>
              <div className="so-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="so-stat-label">Selected</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{selectedNode.type.toLowerCase()}</div>
                </div>
                {selectedNode.type !== "PAGE" ? (
                  <div className="so-row" style={{ gap: 4 }}>
                    <button type="button" className="so-btn" style={{ height: 24, padding: "0 8px", fontSize: 11 }}
                      onClick={() => { const ids: string[] = []; const collect = (n: PortfolioNode): void => { ids.push(newId(n.type)); n.children?.forEach(collect); }; collect(selectedNode); run({ type: "duplicate", nodeId: selectedNode.id, newIds: ids }); }}>
                      Duplicate
                    </button>
                    <button type="button" className="so-btn" style={{ height: 24, padding: "0 8px", fontSize: 11, color: "var(--red)" }}
                      onClick={() => { run({ type: "delete", nodeId: selectedNode.id }); setSelected(loc?.parent?.id ?? null); }}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              {(CONTENT_FIELDS[selectedNode.type] ?? []).length > 0 ? (
                <details open>
                  <summary className="so-stat-label" style={{ cursor: "pointer" }}>Content</summary>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {(CONTENT_FIELDS[selectedNode.type] ?? []).map((control) => {
                      const value = (selectedNode.props as Record<string, unknown>)[control.key];
                      return (
                        <label key={control.key} style={{ display: "grid", gap: 3 }}>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>{control.label}</span>
                          {control.multiline ? (
                            <textarea className="pfb-field" rows={3} value={String(value ?? "")} placeholder={control.placeholder} onChange={(e) => setProp(control.key, e.target.value)} />
                          ) : (
                            <input className="pfb-field" value={String(value ?? "")} placeholder={control.placeholder} onChange={(e) => setProp(control.key, e.target.value)} />
                          )}
                        </label>
                      );
                    })}
                    {selectedNode.type === "SKILL_GROUP" ? (
                      <label style={{ display: "grid", gap: 3 }}>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>Items (comma separated)</span>
                        <input className="pfb-field" value={((selectedNode.props.items as string[] | undefined) ?? []).join(", ")}
                          onChange={(e) => run({ type: "updateProps", nodeId: selectedNode.id, props: { items: e.target.value.split(",").map((i) => i.trim()).filter(Boolean) } })} />
                      </label>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {selectedNode.type === "PAGE" ? (
                <div className="so-empty">This is the page root. Select a section or a component to edit it.</div>
              ) : (
                <details open={styleKeys.length > 0}>
                  <summary className="so-stat-label" style={{ cursor: "pointer" }}>Style · {breakpoint}</summary>
                  <div className="pfb-grid2" style={{ marginTop: 6 }}>
                    {styleKeys.filter((key) => SIZE_CONTROLS[key as string]).map((key) => {
                      const spec = SIZE_CONTROLS[key as string];
                      return (
                        <label key={String(key)} style={{ display: "grid", gap: 3 }}>
                          <span style={{ fontSize: 10.5, color: "var(--text3)" }}>{spec.label}{spec.unit ? ` (${spec.unit})` : ""}</span>
                          <input
                            type="number"
                            className="pfb-field"
                            style={{ padding: "5px 7px", fontSize: 12 }}
                            min={spec.min}
                            max={spec.max}
                            step={spec.step ?? 1}
                            placeholder="—"
                            value={Number(styleValue(selectedNode, key) ?? "") || ""}
                            onChange={(e) => setStyle(key, e.target.value === "" ? undefined : Number(e.target.value))}
                          />
                        </label>
                      );
                    })}
                  </div>

                  {selectedNode.type === "HEADING" || selectedNode.type === "TEXT" ? (
                    <label style={{ display: "grid", gap: 3, marginTop: 8 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Font</span>
                      <select className="pfb-field" value={String(styleValue(selectedNode, "fontFamily") ?? "")} onChange={(e) => setStyle("fontFamily", e.target.value || undefined)}>
                        <option value="">inherit</option>
                        {FONT_ALLOWLIST.map((font) => <option key={font} value={font}>{font}</option>)}
                      </select>
                    </label>
                  ) : null}

                  <div className="pfb-grid2" style={{ marginTop: 8 }}>
                    <label style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Text</span>
                      <input type="color" className="pfb-field" style={{ height: 30, padding: 2 }} value={String(styleValue(selectedNode, "color") ?? "#ededf1")} onChange={(e) => setStyle("color", e.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Background</span>
                      <input type="color" className="pfb-field" style={{ height: 30, padding: 2 }} value={String(styleValue(selectedNode, "background") ?? "#131317")} onChange={(e) => setStyle("background", e.target.value)} />
                    </label>
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="so-empty">Select a component on the canvas, or a row in Layers.</div>
          )}
        </div>
      </div>

      {markdownOpen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 160, background: "rgba(6,8,10,.66)", display: "grid", placeItems: "center", padding: 20 }} onClick={() => setMarkdownOpen(false)}>
          <div className="so-card so-card-pad" style={{ width: "min(760px,100%)", display: "grid", gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <div className="so-row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 14 }}>Write in Markdown</strong>
              <button type="button" className="so-btn" onClick={() => setMarkdownOpen(false)}>Close</button>
            </div>
            <textarea
              className="pfb-field"
              rows={12}
              spellCheck={false}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, lineHeight: 1.6 }}
            />
            <p style={{ margin: 0, fontSize: 11, color: "var(--text3)" }}>
              # headings · **bold** · *italic* · `code` · [link](https://…) · - lists · &gt; quote · ![alt](/portfolio/cover-aether.jpg)
            </p>
            <div className="so-row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="so-btn" onClick={() => applyMarkdown("replace")}>Replace page</button>
              <button type="button" className="so-btn" data-variant="primary" onClick={() => applyMarkdown("append")}>Add as section</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Builder(props: BuilderProps) {
  return (
    <BuilderBoundary>
      <BuilderInner {...props} />
    </BuilderBoundary>
  );
}
