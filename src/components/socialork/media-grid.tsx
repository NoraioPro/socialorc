"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { card } from "./design-bits";
import { showToast } from "./undo-toast";

export type MediaItem = { id: string; filename: string; mimeType: string; url: string; dims: string; meta: string; altText: string | null; usedIn: number };

function AltEditor({ item, canEdit }: { item: MediaItem; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(item.altText ?? "");
  const [saved, setSaved] = useState(item.altText ?? "");
  async function save() {
    if (v.trim() === saved) return;
    const r = await fetch("/api/media", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, altText: v }) });
    if (r.ok) { setSaved(v.trim()); showToast("Alt text saved."); router.refresh(); } else showToast("Alt text was not saved.");
  }
  return (
    <input className="so-input" aria-label={`Alt text for ${item.filename}`} placeholder={canEdit ? "Add alt text" : "No alt text"} value={v} disabled={!canEdit}
      onChange={(e) => setV(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ height: 28, fontSize: 12 }} />
  );
}

export function MediaGrid({ items, canEdit }: { items: MediaItem[]; canEdit: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
      {items.map((a) => {
        const video = a.mimeType.startsWith("video/");
        return (
          <section key={a.id} data-media={a.id} style={{ ...card, display: "flex", flexDirection: "column" }}>
            <div style={{ aspectRatio: "4 / 3", background: "var(--bg)" }}>
              {video ? (
                <video src={a.url} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.altText || a.filename} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.filename}>{a.filename}</div>
              <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{a.dims} · {a.meta} · used in {a.usedIn} post{a.usedIn === 1 ? "" : "s"}</div>
              {!video && <AltEditor item={a} canEdit={canEdit} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Generate an image with the workspace's own image key; it lands in this library. */
export function GenerateImage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    if (!prompt.trim()) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/ai/images", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Could not generate the image.");
    setPrompt(""); setOpen(false); showToast("Image added to the library."); router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button type="button" className="so-btn" onClick={() => setOpen((o) => !o)}>Generate with AI</button>
      {open && (
        <div className="so-card" style={{ display: "flex", gap: 8, padding: 10, flexWrap: "wrap" }}>
          <input className="so-input" aria-label="Describe the image" placeholder="Describe the image…" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ minWidth: 220 }} />
          <button className="so-btn" data-variant="primary" disabled={busy || !prompt.trim()} onClick={() => void go()}>{busy ? "Generating…" : "Generate"}</button>
        </div>
      )}
      {err && <span role="alert" style={{ fontSize: 11.5, color: "var(--red)" }}>{err}</span>}
    </div>
  );
}
