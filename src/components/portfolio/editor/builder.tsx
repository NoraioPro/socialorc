"use client";

/**
 * The visual builder (P4–P6).
 *
 * Three panes over one document, wearing the app's own design system (`so-*`
 * classes and CSS variables) so it reads as a module of SocialOrk rather than a
 * bolted-on page. Every edit goes through `lib/portfolio/commands`, so the canvas
 * can never hold a tree the validator would reject.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentRenderer, type RenderMedia } from "@/components/portfolio/render/document-renderer";
import { applyCommand, applyResponsive, locateNode } from "@/lib/portfolio/commands";
import { REGISTRY, isUserInsertable } from "@/lib/portfolio/registry";
import { FONT_ALLOWLIST } from "@/lib/portfolio/tokens";
import type { PortfolioDocument, PortfolioNode, StyleSet } from "@/lib/portfolio/types";

type Breakpoint = "desktop" | "tablet" | "mobile";
type NodeType = PortfolioNode["type"];

const CATEGORIES: { label: string; types: NodeType[] }[] = [
  { label: "Layout", types: ["SECTION", "CONTAINER", "STACK", "GRID", "COLUMN", "SPACER", "DIVIDER"] },
  { label: "Content", types: ["HEADING", "TEXT", "BUTTON"] },
  { label: "Media", types: ["IMAGE"] },
  { label: "Portfolio", types: ["PROJECT_CARD", "EXPERIENCE_ITEM", "SKILL_GROUP", "SOCIAL_LINKS", "CONTACT_BLOCK"] },
];

const FRAME_WIDTH: Record<Breakpoint, number> = { desktop: 1120, tablet: 820, mobile: 390 };

const CONTENT_FIELDS: Partial<Record<NodeType, { key: string; label: string; multiline?: boolean }[]>> = {
  HEADING: [{ key: "text", label: "Text", multiline: true }, { key: "level", label: "Level (1–4)" }],
  TEXT: [{ key: "text", label: "Text", multiline: true }],
  BUTTON: [{ key: "label", label: "Label" }, { key: "href", label: "Link (https:// or mailto:)" }],
  IMAGE: [{ key: "assetId", label: "Asset id" }, { key: "alt", label: "Alt text" }, { key: "caption", label: "Caption" }],
  PROJECT_CARD: [{ key: "title", label: "Title" }, { key: "summary", label: "Summary", multiline: true }, { key: "year", label: "Year" }, { key: "href", label: "Link" }],
  EXPERIENCE_ITEM: [{ key: "title", label: "Role" }, { key: "org", label: "Organisation" }, { key: "start", label: "Start (YYYY-MM)" }, { key: "end", label: "End (YYYY-MM)" }],
  SKILL_GROUP: [{ key: "title", label: "Title" }],
  CONTACT_BLOCK: [{ key: "email", label: "Email" }, { key: "ctaLabel", label: "Call to action" }, { key: "note", label: "Note", multiline: true }],
  SECTION: [{ key: "anchor", label: "Anchor id" }],
};

const SIZE_CONTROLS: { key: keyof StyleSet; label: string; min: number; max: number; step?: number }[] = [
  { key: "fontSize", label: "Size", min: 10, max: 160 },
  { key: "fontWeight", label: "Weight", min: 400, max: 800, step: 100 },
  { key: "lineHeight", label: "Line height", min: 0.9, max: 2.2, step: 0.05 },
  { key: "letterSpacing", label: "Tracking", min: -0.05, max: 0.3, step: 0.01 },
  { key: "gap", label: "Gap", min: 0, max: 240 },
  { key: "paddingY", label: "Padding Y", min: 0, max: 240 },
  { key: "paddingX", label: "Padding X", min: 0, max: 240 },
  { key: "maxWidth", label: "Max width", min: 0, max: 1600 },
  { key: "minHeight", label: "Min height", min: 0, max: 2000 },
  { key: "radius", label: "Radius", min: 0, max: 999 },
  { key: "columns", label: "Columns", min: 1, max: 12 },
  { key: "span", label: "Span", min: 1, max: 12 },
];

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
  return { id: newId(type), type, props, style: {}, ...(spec.allowsChildren ? { children: [] } : {}) } as PortfolioNode;
}

export interface BuilderProps {
  initialDocument: PortfolioDocument;
  initialVersion: number;
  handle: string;
  status: "DRAFT" | "PUBLISHED";
  media: Record<string, RenderMedia>;
}

export function Builder({ initialDocument, initialVersion, handle, status, media }: BuilderProps) {
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
  const [zoom, setZoom] = useState(1);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ doc, version });
  latest.current = { doc, version };

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
    const pane = paneRef.current;
    if (!pane) return;
    const measure = (): void => {
      const available = pane.clientWidth - 56;
      setZoom(Math.min(1, Math.max(0.3, available / FRAME_WIDTH[breakpoint])));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [breakpoint]);

  const loc = selected ? locateNode(doc, selected) : null;
  const selectedNode = loc?.node ?? null;
  const insertTarget = useMemo(() => {
    if (!selectedNode) return doc.pages[0]?.root ?? null;
    if (REGISTRY[selectedNode.type].allowsChildren) return selectedNode;
    return loc?.parent ?? doc.pages[0]?.root ?? null;
  }, [selectedNode, loc, doc]);

  const insert = (type: NodeType) => {
    if (!insertTarget) return;
    const node = makeNode(type);
    run({ type: "insert", parentId: insertTarget.id, index: insertTarget.children?.length ?? 0, node });
    setSelected(node.id);
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

  const publish = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portfolio/publish", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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

  const field: React.CSSProperties = {
    width: "100%",
    background: "var(--panel2)",
    color: "var(--text)",
    border: "1px solid var(--line2)",
    borderRadius: 8,
    padding: "7px 9px",
    fontSize: 12.5,
    outline: "none",
    fontFamily: "inherit",
  };

  const renderLayer = (node: PortfolioNode, depth: number): React.ReactNode => (
    <div key={node.id}>
      <div
        draggable
        onDragStart={(event) => event.dataTransfer.setData("text/pf-node", node.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const dragged = event.dataTransfer.getData("text/pf-node");
          if (!dragged || dragged === node.id) return;
          run({ type: "move", nodeId: dragged, parentId: node.id, index: node.children?.length ?? 0 });
        }}
        onClick={() => setSelected(node.id)}
        title="Drag onto another row to nest it"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "5px 8px",
          marginLeft: depth * 10,
          borderRadius: 7,
          cursor: "grab",
          background: selected === node.id ? "rgba(72,237,133,0.12)" : "transparent",
          border: `1px solid ${selected === node.id ? "rgba(72,237,133,0.35)" : "transparent"}`,
          color: selected === node.id ? "var(--green)" : "var(--text2)",
          fontSize: 12,
        }}
      >
        <span className="so-mono" style={{ fontSize: 9.5, opacity: 0.6 }}>{REGISTRY[node.type].category === "layout" ? "▦" : "◆"}</span>
        <span style={{ fontWeight: selected === node.id ? 600 : 400 }}>{node.type}</span>
      </div>
      {node.children?.map((child) => renderLayer(child, depth + 1))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%", minHeight: 0 }}>
      <div className="so-card" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="so-row" style={{ gap: 8 }}>
          <span className="so-h1" style={{ fontSize: 15 }}>Portfolio</span>
          <span className="so-pill so-mono" data-tone={published ? "approved" : undefined}>/{handle}</span>
          <span className="so-pill" data-tone={published ? "approved" : "review"}>{published ? "published" : "draft"}</span>
        </div>

        <div className="so-tabs" style={{ border: "none", paddingBottom: 0, marginLeft: 8 }}>
          {(["desktop", "tablet", "mobile"] as Breakpoint[]).map((bp) => (
            <button key={bp} type="button" className="so-tab" data-active={breakpoint === bp} onClick={() => setBreakpoint(bp)}>
              {bp}
            </button>
          ))}
        </div>

        <div className="so-row" style={{ gap: 6 }}>
          <button
            type="button"
            className="so-btn"
            disabled={past.length === 0}
            style={{ opacity: past.length === 0 ? 0.45 : 1 }}
            onClick={() => {
              const previous = past[past.length - 1];
              if (!previous) return;
              setPast(past.slice(0, -1));
              setFuture([doc, ...future]);
              setDoc(previous);
              setSaveState("dirty");
            }}
          >
            ↶
          </button>
          <button
            type="button"
            className="so-btn"
            disabled={future.length === 0}
            style={{ opacity: future.length === 0 ? 0.45 : 1 }}
            onClick={() => {
              const next = future[0];
              if (!next) return;
              setPast([...past, doc]);
              setFuture(future.slice(1));
              setDoc(next);
              setSaveState("dirty");
            }}
          >
            ↷
          </button>
        </div>

        <div className="so-row" style={{ marginLeft: "auto", gap: 8 }}>
          <span className="so-pill" data-tone={saveState === "conflict" ? "changes" : saveState === "saved" ? "approved" : undefined}>
            {saveState === "saved" ? "saved" : saveState === "saving" ? "saving…" : saveState === "conflict" ? "conflict" : "unsaved"}
          </span>
          <button type="button" className="so-btn" data-active={preview} onClick={() => setPreview((v) => !v)} style={preview ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
            {preview ? "Editing" : "Preview"}
          </button>
          <button type="button" className="so-btn" data-variant="primary" disabled={busy} onClick={() => void publish()}>
            {busy ? "Publishing…" : published ? "Publish again" : "Publish"}
          </button>
          {published ? (
            <>
              <a className="so-btn" href={`/p/${handle}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                View live ↗
              </a>
              <button type="button" className="so-btn" onClick={() => void unpublish()} disabled={busy}>
                Unpublish
              </button>
            </>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="so-banner" style={{ borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" }}>{message}</div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "232px 1fr 300px", minHeight: 0 }}>
        {/* insert + layers */}
        <div style={{ borderRight: "1px solid var(--line)", background: "var(--side)", overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
          <div>
            <div className="so-stat-label">Insert into {insertTarget?.type ?? "PAGE"}</div>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {CATEGORIES.map((category) => (
                <div key={category.label}>
                  <div className="so-stat-label" style={{ opacity: 0.65, marginBottom: 4 }}>{category.label}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {category.types
                      .filter((type): type is Exclude<NodeType, "PAGE"> => isUserInsertable(type))
                      .map((type) => (
                        <button key={type} type="button" className="so-btn" style={{ height: 24, padding: "0 7px", fontSize: 10.5 }} onClick={() => insert(type)}>
                          {type.toLowerCase()}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="so-stat-label">Layers</div>
            <div style={{ marginTop: 6 }}>{doc.pages[0]?.root ? renderLayer(doc.pages[0].root, 0) : null}</div>
          </div>
        </div>

        {/* canvas */}
        <div
          ref={paneRef}
          style={{
            overflow: "auto",
            padding: 20,
            background:
              "radial-gradient(circle at 50% 0%, #17171d 0%, #0b0b0e 55%), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 40px)",
          }}
          onClick={(event) => {
            if (preview) return;
            const target = (event.target as HTMLElement).closest("[data-pf-node]");
            if (target) setSelected(target.getAttribute("data-pf-node"));
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)" }}>
              {breakpoint} · {FRAME_WIDTH[breakpoint]}px · {Math.round(zoom * 100)}%
            </span>
          </div>
          <div
            style={{
              width: FRAME_WIDTH[breakpoint],
              zoom,
              margin: "0 auto",
              background: "#131317",
              borderRadius: 14,
              border: "1px solid var(--line2)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}
            data-breakpoint={breakpoint}
          >
            <DocumentRenderer document={doc} media={media} />
            {!preview ? (
              <style>{`
                [data-pf-node]{outline-offset:-1px;outline:1px solid transparent;cursor:pointer;transition:outline-color .12s ease}
                [data-pf-node]:hover{outline-color:rgba(72,237,133,0.4)}
                ${selected ? `[data-pf-node="${selected}"]{outline:2px solid #48ed85 !important}` : ""}
              `}</style>
            ) : null}
          </div>
        </div>

        {/* inspector */}
        <div style={{ borderLeft: "1px solid var(--line)", background: "var(--side)", overflowY: "auto", padding: 12, display: "grid", gap: 12, alignContent: "start" }}>
          {selectedNode ? (
            <>
              <div className="so-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div className="so-stat-label">Selected</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{selectedNode.type}</div>
                </div>
                {selectedNode.type !== "PAGE" ? (
                  <div className="so-row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="so-btn"
                      style={{ height: 26, padding: "0 8px", fontSize: 11 }}
                      onClick={() => {
                        const ids: string[] = [];
                        const collect = (node: PortfolioNode): void => {
                          ids.push(newId(node.type));
                          node.children?.forEach(collect);
                        };
                        collect(selectedNode);
                        run({ type: "duplicate", nodeId: selectedNode.id, newIds: ids });
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="so-btn"
                      style={{ height: 26, padding: "0 8px", fontSize: 11, color: "var(--red)" }}
                      onClick={() => {
                        run({ type: "delete", nodeId: selectedNode.id });
                        setSelected(loc?.parent?.id ?? null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="so-stat-label">Content</div>
                <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                  {(CONTENT_FIELDS[selectedNode.type] ?? []).map((control) => {
                    const value = (selectedNode.props as Record<string, unknown>)[control.key];
                    return (
                      <label key={control.key} style={{ display: "grid", gap: 3 }}>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>{control.label}</span>
                        {control.multiline ? (
                          <textarea rows={3} style={field} value={String(value ?? "")} onChange={(event) => setProp(control.key, event.target.value)} />
                        ) : (
                          <input style={field} value={String(value ?? "")} onChange={(event) => setProp(control.key, event.target.value)} />
                        )}
                      </label>
                    );
                  })}
                  {selectedNode.type === "SKILL_GROUP" ? (
                    <label style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>Items (comma separated)</span>
                      <input
                        style={field}
                        value={((selectedNode.props.items as string[] | undefined) ?? []).join(", ")}
                        onChange={(event) =>
                          run({
                            type: "updateProps",
                            nodeId: selectedNode.id,
                            props: { items: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) },
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              {selectedNode.type === "PAGE" ? (
                <div className="so-empty">
                  This is the page root. Select a section or a component to edit its content and style.
                </div>
              ) : (
              <div>
                <div className="so-row" style={{ justifyContent: "space-between" }}>
                  <div className="so-stat-label">Style</div>
                  <span className="so-pill">{breakpoint}</span>
                </div>
                <div style={{ display: "grid", gap: 7, marginTop: 6 }}>
                  <label style={{ display: "grid", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>Font</span>
                    <select style={field} value={String(styleValue(selectedNode, "fontFamily") ?? "")} onChange={(event) => setStyle("fontFamily", event.target.value || undefined)}>
                      <option value="">inherit</option>
                      {FONT_ALLOWLIST.map((font) => (
                        <option key={font} value={font}>{font}</option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {SIZE_CONTROLS.map((control) => (
                      <label key={String(control.key)} style={{ display: "grid", gap: 3 }}>
                        <span style={{ fontSize: 10.5, color: "var(--text3)" }}>{control.label}</span>
                        <input
                          type="number"
                          style={{ ...field, padding: "5px 7px", fontSize: 12 }}
                          min={control.min}
                          max={control.max}
                          step={control.step ?? 1}
                          value={Number(styleValue(selectedNode, control.key) ?? "")}
                          onChange={(event) => setStyle(control.key, event.target.value === "" ? undefined : Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <label style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Text</span>
                      <input type="color" style={{ ...field, height: 30, padding: 2 }} value={String(styleValue(selectedNode, "color") ?? "#ededf1")} onChange={(event) => setStyle("color", event.target.value)} />
                    </label>
                    <label style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 10.5, color: "var(--text3)" }}>Background</span>
                      <input type="color" style={{ ...field, height: 30, padding: 2 }} value={String(styleValue(selectedNode, "background") ?? "#131317")} onChange={(event) => setStyle("background", event.target.value)} />
                    </label>
                  </div>

                  <div className="so-row" style={{ gap: 4 }}>
                    {(["left", "center", "right"] as const).map((align) => (
                      <button key={align} type="button" className="so-btn" style={{ height: 24, padding: "0 8px", fontSize: 10.5 }} onClick={() => setStyle("textAlign", align)}>
                        {align}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              )}
            </>
          ) : (
            <div className="so-empty">Select a component on the canvas, or a row in Layers.</div>
          )}
        </div>
      </div>
    </div>
  );
}
