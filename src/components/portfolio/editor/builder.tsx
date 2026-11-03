"use client";

/**
 * The visual builder (P4–P6).
 *
 * Three panes over one document: layers + insert on the left, the real renderer
 * in the middle, the inspector on the right. Every edit is a command from
 * `lib/portfolio/commands` — the same engine the tests cover — so the canvas can
 * never hold a tree the validator would reject.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentRenderer, type RenderMedia } from "@/components/portfolio/render/document-renderer";
import { applyCommand, applyResponsive, locateNode } from "@/lib/portfolio/commands";
import { REGISTRY, USER_INSERTABLE_TYPES, isUserInsertable } from "@/lib/portfolio/registry";
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
  HEADING: [{ key: "text", label: "Text", multiline: true }, { key: "level", label: "Level" }],
  TEXT: [{ key: "text", label: "Text", multiline: true }],
  BUTTON: [{ key: "label", label: "Label" }, { key: "href", label: "Link (https:// or mailto:)" }],
  IMAGE: [{ key: "assetId", label: "Asset id (from the media library)" }, { key: "alt", label: "Alt text" }, { key: "caption", label: "Caption" }],
  PROJECT_CARD: [{ key: "title", label: "Title" }, { key: "summary", label: "Summary", multiline: true }, { key: "year", label: "Year" }, { key: "href", label: "Link" }],
  EXPERIENCE_ITEM: [{ key: "title", label: "Role" }, { key: "org", label: "Organisation" }, { key: "start", label: "Start (YYYY-MM)" }, { key: "end", label: "End (YYYY-MM)" }],
  SKILL_GROUP: [{ key: "title", label: "Title" }],
  CONTACT_BLOCK: [{ key: "email", label: "Email" }, { key: "ctaLabel", label: "Call to action" }, { key: "note", label: "Note", multiline: true }],
  SECTION: [{ key: "anchor", label: "Anchor id" }],
};

const SIZE_CONTROLS: { key: keyof StyleSet; label: string; min: number; max: number; step?: number }[] = [
  { key: "fontSize", label: "Font size", min: 10, max: 160 },
  { key: "fontWeight", label: "Weight", min: 400, max: 800, step: 100 },
  { key: "lineHeight", label: "Line height", min: 0.9, max: 2.2, step: 0.05 },
  { key: "letterSpacing", label: "Tracking (em)", min: -0.05, max: 0.3, step: 0.01 },
  { key: "gap", label: "Gap", min: 0, max: 240 },
  { key: "paddingY", label: "Padding Y", min: 0, max: 240 },
  { key: "paddingX", label: "Padding X", min: 0, max: 240 },
  { key: "maxWidth", label: "Max width", min: 0, max: 1600 },
  { key: "minHeight", label: "Min height", min: 0, max: 2000 },
  { key: "radius", label: "Radius", min: 0, max: 999 },
  { key: "columns", label: "Grid columns", min: 1, max: 12 },
  { key: "span", label: "Column span", min: 1, max: 12 },
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

  // Autosave: 800ms after the last edit, compare-and-set on the version.
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
        const data = (await res.json().catch(() => ({}))) as { documentVersion?: number; error?: string; issues?: { path: string; message: string }[] };
        if (res.status === 409) {
          setSaveState("conflict");
          setMessage("This portfolio was changed in another tab. Reload before editing further.");
          return;
        }
        if (!res.ok) {
          setSaveState("dirty");
          setMessage(data.error ?? `Save failed (${res.status}).`);
          return;
        }
        setVersion(data.documentVersion ?? latest.current.version + 1);
        setSaveState("saved");
        setMessage(null);
      } catch {
        setSaveState("dirty");
        setMessage("Network error while saving.");
      }
    }, 800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [saveState, doc]);

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
    if (value === undefined) {
      const cleaned = applyResponsive(doc, selectedNode.id, breakpoint, patch as Record<string, unknown>);
      if (cleaned) commit(cleaned);
      return;
    }
    commit(applyResponsive(latest.current.doc, selectedNode.id, breakpoint, patch));
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
      setMessage(`Published. Your portfolio is live at /p/${handle}.`);
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
        setMessage("Unpublished. The public URL now returns 404.");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ?? "Could not unpublish.");
      }
    } finally {
      setBusy(false);
    }
  };

  const panel: React.CSSProperties = { background: "#0f0f13", borderRight: "1px solid rgba(255,255,255,0.07)", overflow: "auto", padding: 12 };
  const field: React.CSSProperties = {
    width: "100%",
    background: "#1b1b21",
    color: "#ededf1",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 8,
    padding: "7px 9px",
    fontSize: 12.5,
    outline: "none",
  };
  const button: React.CSSProperties = {
    background: "#1b1b21",
    color: "#ededf1",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    cursor: "pointer",
  };
  const label: React.CSSProperties = { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7c7c87" };

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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 6px",
          paddingLeft: 6 + depth * 12,
          borderRadius: 6,
          cursor: "pointer",
          background: selected === node.id ? "rgba(72,237,133,0.14)" : "transparent",
          color: selected === node.id ? "#48ed85" : "#c9c9d1",
          fontSize: 12,
        }}
      >
        <span style={{ opacity: 0.5, fontSize: 10 }}>{REGISTRY[node.type].category === "layout" ? "▦" : "◆"}</span>
        {node.type}
      </div>
      {node.children?.map((child) => renderLayer(child, depth + 1))}
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "calc(100vh - 56px)", background: "#0b0b0e", color: "#ededf1" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>Portfolio</strong>
        <span style={{ ...label, fontSize: 11 }}>/{handle}</span>
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {(["desktop", "tablet", "mobile"] as Breakpoint[]).map((bp) => (
            <button key={bp} type="button" onClick={() => setBreakpoint(bp)} style={{ ...button, background: breakpoint === bp ? "#48ed85" : "#1b1b21", color: breakpoint === bp ? "#003917" : "#ededf1", fontWeight: breakpoint === bp ? 700 : 400 }}>
              {bp}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            style={button}
            disabled={past.length === 0}
            onClick={() => {
              const previous = past[past.length - 1];
              if (!previous) return;
              setPast(past.slice(0, -1));
              setFuture([doc, ...future]);
              setDoc(previous);
              setSaveState("dirty");
            }}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            style={button}
            disabled={future.length === 0}
            onClick={() => {
              const next = future[0];
              if (!next) return;
              setPast([...past, doc]);
              setFuture(future.slice(1));
              setDoc(next);
              setSaveState("dirty");
            }}
          >
            ↷ Redo
          </button>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: saveState === "conflict" ? "#ff6b6b" : saveState === "saved" ? "#48ed85" : "#a6a6b0" }}>
          {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "conflict" ? "Conflict" : "Unsaved changes"}
        </span>
        <button type="button" style={button} onClick={() => setPreview((value) => !value)}>
          {preview ? "Editing" : "Preview"}
        </button>
        <button type="button" style={{ ...button, background: "#48ed85", color: "#003917", fontWeight: 700 }} disabled={busy} onClick={() => void publish()}>
          {busy ? "Publishing…" : published ? "Publish again" : "Publish"}
        </button>
        {published ? (
          <>
            <a href={`/p/${handle}`} target="_blank" rel="noreferrer" style={{ ...button, textDecoration: "none" }}>
              Open /p/{handle}
            </a>
            <button type="button" style={button} onClick={() => void unpublish()} disabled={busy}>
              Unpublish
            </button>
          </>
        ) : null}
      </div>

      {message ? (
        <div style={{ padding: "6px 14px", fontSize: 12, background: "rgba(72,237,133,0.1)", borderBottom: "1px solid rgba(72,237,133,0.25)" }}>{message}</div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 280px", minHeight: 0 }}>
        {/* left: insert + layers */}
        <div style={panel}>
          <div style={label}>Insert into {insertTarget?.type ?? "PAGE"}</div>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {CATEGORIES.map((category) => (
              <div key={category.label} style={{ display: "grid", gap: 4 }}>
                <div style={{ ...label, opacity: 0.7 }}>{category.label}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {category.types.filter((type): type is (typeof USER_INSERTABLE_TYPES)[number] => isUserInsertable(type)).map((type) => (
                    <button key={type} type="button" style={{ ...button, padding: "4px 7px", fontSize: 11 }} onClick={() => insert(type)}>
                      + {type}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...label, marginTop: 16 }}>Layers</div>
          <div style={{ marginTop: 6 }}>{doc.pages[0]?.root ? renderLayer(doc.pages[0].root, 0) : null}</div>
        </div>

        {/* centre: canvas */}
        <div style={{ overflow: "auto", padding: 18, background: "#0b0b0e" }} onClick={(event) => {
          const target = (event.target as HTMLElement).closest("[data-pf-node]");
          if (target) setSelected(target.getAttribute("data-pf-node"));
        }}>
          <div
            style={{
              width: FRAME_WIDTH[breakpoint],
              maxWidth: "100%",
              margin: "0 auto",
              background: "#131317",
              borderRadius: 12,
              overflow: "hidden",
              outline: selected ? `1px dashed rgba(72,237,133,0.5)` : "1px solid rgba(255,255,255,0.08)",
              position: "relative",
            }}
            data-breakpoint={breakpoint}
          >
            <DocumentRenderer document={doc} media={media} />
            <style>{`
              [data-pf-node]{outline-offset:-1px;outline:1px solid transparent;cursor:pointer}
              [data-pf-node]:hover{outline-color:rgba(72,237,133,0.45)}
              ${selected ? `[data-pf-node="${selected}"]{outline:2px solid #48ed85 !important}` : ""}
            `}</style>
          </div>
        </div>

        {/* right: inspector */}
        <div style={{ ...panel, borderRight: "none", borderLeft: "1px solid rgba(255,255,255,0.07)" }}>
          {selectedNode ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: 12.5 }}>{selectedNode.type}</strong>
                {selectedNode.type !== "PAGE" ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      style={button}
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
                    <button type="button" style={{ ...button, color: "#ff8f8f" }} onClick={() => { run({ type: "delete", nodeId: selectedNode.id }); setSelected(loc?.parent?.id ?? null); }}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div style={{ ...label, marginTop: 12 }}>Content</div>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {(CONTENT_FIELDS[selectedNode.type] ?? []).map((control) => {
                  const value = (selectedNode.props as Record<string, unknown>)[control.key];
                  return (
                    <label key={control.key} style={{ display: "grid", gap: 3 }}>
                      <span style={{ fontSize: 11, color: "#a6a6b0" }}>{control.label}</span>
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
                    <span style={{ fontSize: 11, color: "#a6a6b0" }}>Items (comma separated)</span>
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

              <div style={{ ...label, marginTop: 14 }}>Style · {breakpoint}</div>
              <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                <label style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "#a6a6b0" }}>Font family</span>
                  <select
                    style={field}
                    value={String(styleValue(selectedNode, "fontFamily") ?? "")}
                    onChange={(event) => setStyle("fontFamily", event.target.value || undefined)}
                  >
                    <option value="">(inherit)</option>
                    {FONT_ALLOWLIST.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </label>

                {SIZE_CONTROLS.map((control) => (
                  <label key={String(control.key)} style={{ display: "grid", gap: 3 }}>
                    <span style={{ fontSize: 11, color: "#a6a6b0" }}>{control.label}</span>
                    <input
                      type="number"
                      style={field}
                      min={control.min}
                      max={control.max}
                      step={control.step ?? 1}
                      value={Number(styleValue(selectedNode, control.key) ?? "")}
                      onChange={(event) => setStyle(control.key, event.target.value === "" ? undefined : Number(event.target.value))}
                    />
                  </label>
                ))}

                <label style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "#a6a6b0" }}>Text colour</span>
                  <input
                    type="color"
                    style={{ ...field, height: 32, padding: 2 }}
                    value={String(styleValue(selectedNode, "color") ?? "#ededf1")}
                    onChange={(event) => setStyle("color", event.target.value)}
                  />
                </label>
                <label style={{ display: "grid", gap: 3 }}>
                  <span style={{ fontSize: 11, color: "#a6a6b0" }}>Background</span>
                  <input
                    type="color"
                    style={{ ...field, height: 32, padding: 2 }}
                    value={String(styleValue(selectedNode, "background") ?? "#131317")}
                    onChange={(event) => setStyle("background", event.target.value)}
                  />
                </label>
                <button type="button" style={button} onClick={() => setStyle("textAlign", "center")}>Align centre</button>
              </div>
            </>
          ) : (
            <p style={{ color: "#a6a6b0", fontSize: 12.5 }}>Select a component on the canvas or in the layer list.</p>
          )}
        </div>
      </div>
    </div>
  );
}
