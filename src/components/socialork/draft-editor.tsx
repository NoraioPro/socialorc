"use client";

/**
 * Draft editor: the screen the old app had at /dashboard/drafts/[id].
 * Everything here goes through the existing routes (PATCH/DELETE /api/posts/[id],
 * POST /api/posts/[id]/approve, POST /api/media), so the approval gate and the
 * audit trail stay where they were.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { DIRECT_UPLOAD_THRESHOLD, uploadMediaDirect } from "@/lib/media/client-upload";

type Media = { id: string; url: string; mimeType: string; filename: string };

export function DraftEditor({
  id,
  initialTitle,
  initialContent,
  platform,
  status,
  initialMedia,
}: {
  id: string;
  initialTitle: string;
  initialContent: string;
  platform: keyof typeof PLATFORM_CONFIGS;
  status: string;
  initialMedia: Media[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [media, setMedia] = useState<Media[]>(initialMedia);
  const [busy, setBusy] = useState<string | null>(null);
  const [cascadeTargets, setCascadeTargets] = useState<string[]>([]);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const limit = PLATFORM_CONFIGS[platform]?.maxTextLength ?? 0;
  const over = limit > 0 && content.length > limit;
  const locked = status !== "DRAFT";

  const payload = () => ({
    title: title.trim() || undefined,
    content: content.trim(),
    platform,
    mediaAssetIds: media.map((m) => m.id),
  });

  const save = async () => {
    if (!content.trim()) {
      setNote({ kind: "err", text: "A post needs some content." });
      return;
    }
    setBusy("save");
    setNote(null);
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Save failed (${res.status}).` });
        return;
      }
      setNote({ kind: "ok", text: "Saved. Editing clears any approval — that rule is the server's." });
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was saved." });
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    setBusy("submit");
    setNote(null);
    try {
      const saved = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!saved.ok) {
        const data = (await saved.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? "Could not save before submitting." });
        return;
      }
      const res = await fetch(`/api/posts/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Could not submit (${res.status}).` });
        return;
      }
      router.push("/socialork/approvals");
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — the post was not submitted." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setNote(null);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Delete failed (${res.status}).` });
        return;
      }
      router.push("/socialork/drafts");
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was deleted." });
    } finally {
      setBusy(null);
    }
  };

  /** Cascade: adapt this post into drafts for other channels. */
  const cascade = async () => {
    if (cascadeTargets.length === 0) {
      setNote({ kind: "err", text: "Pick at least one other channel." });
      return;
    }
    setBusy("cascade");
    setNote(null);
    try {
      const res = await fetch(`/api/posts/${id}/cascade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetPlatforms: cascadeTargets, createDrafts: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Cascade failed (${res.status}).` });
        return;
      }
      router.push("/socialork/drafts");
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — no drafts were created." });
    } finally {
      setBusy(null);
    }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("upload");
    setNote(null);
    const added: Media[] = [];
    for (const file of Array.from(files)) {
      try {
        // Large files bypass /api/media: Vercel refuses a >4.5MB function body.
        if (file.size > DIRECT_UPLOAD_THRESHOLD) {
          try {
            const direct = await uploadMediaDirect(file);
            added.push({ id: direct.id, url: direct.url, mimeType: direct.mimeType, filename: direct.filename });
          } catch (err) {
            setNote({ kind: "err", text: err instanceof Error ? err.message : `Upload failed for ${file.name}.` });
          }
          continue;
        }

        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setNote({
            kind: "err",
            text: data?.code === "MEDIA_STORAGE_NOT_CONFIGURED"
              ? "Media storage is not configured in this deployment."
              : data.error ?? `Upload failed (${res.status}).`,
          });
          continue;
        }
        const asset = data.asset ?? data.media ?? data;
        added.push({
          id: asset.id,
          url: asset.url,
          mimeType: asset.mimeType ?? file.type,
          filename: asset.filename ?? file.name,
        });
      } catch {
        setNote({ kind: "err", text: `Network error uploading ${file.name}.` });
      }
    }
    if (added.length) setMedia((m) => [...m, ...added]);
    setBusy(null);
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  return (
    <div className="so-grid so-grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0,1fr) 300px" }}>
      <section className="so-card so-card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="title">Title (optional)</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} style={field} disabled={locked} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="content">Content</label>
          <textarea id="content" rows={14} value={content} onChange={(e) => setContent(e.target.value)}
            style={{ ...field, resize: "vertical", lineHeight: 1.6 }} disabled={locked} />
          <span className="so-mono" style={{ fontSize: 11, color: over ? "var(--red)" : "var(--text3)" }}>
            {content.length}{limit ? ` / ${limit}` : ""} {over ? "· over the channel limit" : ""}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span className="so-stat-label">Attachments</span>
          {media.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text3)" }}>No files attached.</span>
          ) : (
            <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
              {media.map((m) => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                  border: "1px solid var(--line2)", background: "var(--panel2)", maxWidth: 260,
                }}>
                  {m.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" width={28} height={28} style={{ borderRadius: 5, objectFit: "cover" }} />
                  ) : <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)" }}>VIDEO</span>}
                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                    {m.filename}
                  </span>
                  <button type="button" onClick={() => setMedia((l) => l.filter((x) => x.id !== m.id))}
                    style={{ border: 0, background: "transparent", color: "var(--text3)", cursor: "pointer" }}
                    aria-label={`Remove ${m.filename}`}>✕</button>
                </div>
              ))}
            </div>
          )}
          {!locked ? (
            <label className="so-btn" style={{ height: 30, justifySelf: "start", cursor: "pointer" }}>
              {busy === "upload" ? "Uploading…" : "Attach image or video"}
              <input type="file" hidden multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                disabled={busy === "upload"}
                onChange={(e) => { void attach(e.target.files); e.target.value = ""; }} />
            </label>
          ) : null}
        </div>

        <div className="so-row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {note ? (
            <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)", marginRight: "auto" }}>
              {note.text}
            </span>
          ) : null}
          <button className="so-btn" style={{ color: "var(--red)" }} onClick={() => void remove()} disabled={busy === "delete"}>
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
          <button className="so-btn" onClick={() => void save()} disabled={locked || busy === "save"}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          <button className="so-btn" data-variant="primary" onClick={() => void submit()} disabled={locked || busy === "submit"}>
            {busy === "submit" ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      </section>

      <aside className="so-card so-card-pad" style={{ display: "grid", gap: 10, position: "sticky", top: 12 }}>
        <span className="so-stat-label">Post</span>
        <div style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text3)" }}>
          <span className="so-mono">id · {id.slice(-8)}</span>
          <span className="so-mono">channel · {PLATFORM_CONFIGS[platform]?.name ?? platform}</span>
          <span className="so-mono">status · {status.toLowerCase().replace("_", " ")}</span>
          <span className="so-mono">attachments · {media.length}</span>
        </div>
        {locked ? (
          <div className="so-frame" style={{ fontSize: 12 }}>
            This post is no longer a draft, so it is read-only here. Editing is what clears an approval,
            and the server will not let that happen silently.
          </div>
        ) : null}
        <div className="so-divider" />
        <span className="so-stat-label">Adapt to other channels</span>
        <div className="so-row" style={{ gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(PLATFORM_CONFIGS) as (keyof typeof PLATFORM_CONFIGS)[])
            .filter((p) => String(p) !== String(platform))
            .map((p) => {
              const active = cascadeTargets.includes(String(p));
              return (
                <button
                  key={String(p)}
                  type="button"
                  className="so-btn"
                  style={{
                    height: 24, padding: "0 8px", fontSize: 10.5,
                    borderColor: active ? "var(--accent)" : undefined,
                    color: active ? "var(--accent)" : "var(--text2)",
                    background: active ? "var(--accentSoft)" : "var(--panel2)",
                  }}
                  onClick={() =>
                    setCascadeTargets((list) =>
                      active ? list.filter((x) => x !== String(p)) : [...list, String(p)],
                    )
                  }
                >
                  {PLATFORM_CONFIGS[p]?.name ?? String(p)}
                </button>
              );
            })}
        </div>
        <button className="so-btn" style={{ height: 28 }} onClick={() => void cascade()} disabled={busy === "cascade"}>
          {busy === "cascade" ? "Creating drafts…" : "Create drafts for these channels"}
        </button>

        <a href="/socialork/drafts" style={{ fontSize: 12.5 }}>← All drafts</a>
      </aside>
    </div>
  );
}
