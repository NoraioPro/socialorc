"use client";

/**
 * Create, in the handoff's shape: one brief, a brain, the channels to hit, and
 * per-channel drafts. Generation spends the workspace's own AI key — when no key
 * is configured the screen says so and offers the manual path instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { mediaProblems, platformSpec } from "@/lib/social/platform-rules";
import { DIRECT_UPLOAD_THRESHOLD, uploadMediaDirect } from "@/lib/media/client-upload";

const PLATFORMS = [
  { id: "LINKEDIN", name: "LinkedIn" },
  { id: "TWITTER", name: "X" },
  { id: "INSTAGRAM", name: "Instagram" },
  { id: "FACEBOOK", name: "Facebook" },
  { id: "YOUTUBE", name: "YouTube" },
  { id: "TIKTOK", name: "TikTok" },
  { id: "TELEGRAM", name: "Telegram" },
] as const;

type Brain = { id: string; name: string; isDefault: boolean };
type Variant = { platform: string; title?: string | null; content: string; usedMock?: boolean; model?: string };

type AccountOption = { id: string; platform: string; handle: string | null; owner: string; shared: boolean };

export function ComposeForm({ accounts = [] }: { accounts?: AccountOption[] }) {
  const router = useRouter();
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string>("");
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [brief, setBrief] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("professional");
  const [picked, setPicked] = useState<string[]>(["LINKEDIN"]);
  const [accountId, setAccountId] = useState<string>("");
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [media, setMedia] = useState<{ id: string; url: string; filename: string; mimeType: string; devOnly: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/brains");
        if (res.ok) {
          const data = await res.json();
          const list: Brain[] = data?.brains ?? [];
          setBrains(list);
          setBrainId(list.find((b) => b.isDefault)?.id ?? list[0]?.id ?? "");
        }
      } catch {
        /* no brain yet is fine */
      }
      try {
        const [mine, shared] = await Promise.all([
          fetch("/api/ai/credentials?scope=user").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/ai/credentials?scope=workspace").then((r) => (r.ok ? r.json() : null)),
        ]);
        const hasKey = Boolean(
          mine?.scopes?.user ?? mine?.user ?? shared?.scopes?.workspace ?? shared?.workspace,
        );
        setAiReady(hasKey);
      } catch {
        setAiReady(false);
      }
    })();
  }, []);

  const mediaRequiredMissing = useMemo(
    () =>
      picked.filter((id) => {
        const caps = PLATFORM_CONFIGS[id as keyof typeof PLATFORM_CONFIGS]?.capabilities;
        return Boolean(caps?.mediaRequired) && media.length === 0;
      }),
    [picked, media],
  );

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const added: typeof media = [];
    for (const file of Array.from(files)) {
      try {
        // Vercel caps a serverless request body at 4.5MB, so anything bigger goes
        // straight from the browser to Blob storage instead of through /api/media.
        if (file.size > DIRECT_UPLOAD_THRESHOLD) {
          try {
            const direct = await uploadMediaDirect(file);
            added.push({
              id: direct.id,
              url: direct.url,
              filename: direct.filename,
              mimeType: direct.mimeType,
              devOnly: false,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : `Upload failed for ${file.name}.`);
          }
          continue;
        }

        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data?.code === "MEDIA_STORAGE_NOT_CONFIGURED") {
            setError("Media storage is not configured in this deployment (BLOB_READ_WRITE_TOKEN).");
          } else {
            setError(data.error ?? `Upload failed for ${file.name} (${res.status}).`);
          }
          continue;
        }
        const asset = data.asset ?? data.media ?? data;
        added.push({
          id: asset.id,
          url: asset.url,
          filename: asset.filename ?? file.name,
          mimeType: asset.mimeType ?? file.type,
          devOnly: String(asset.url ?? "").startsWith("data:"),
        });
      } catch {
        setError(`Network error uploading ${file.name}.`);
      }
    }
    if (added.length) setMedia((m) => [...m, ...added]);
    setUploading(false);
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const generate = async () => {
    if (!brief.trim() || picked.length === 0) {
      setError("Write the brief and pick at least one channel.");
      return;
    }
    setBusy("generate");
    setError(null);
    setVariants(null);
    try {
      const res = await fetch("/api/posts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: brief.trim(), platforms: picked, tone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Generation failed (${res.status}).`);
        return;
      }
      const list: Variant[] =
        data?.variants ?? data?.results ?? data?.posts ?? (Array.isArray(data) ? data : []);
      if (!list.length) {
        setError("The model returned nothing usable. Try a longer brief.");
        return;
      }
      setVariants(list.map((v) => ({ ...v, platform: String(v.platform ?? picked[0]) })));
    } catch {
      setError("Network error — nothing was generated.");
    } finally {
      setBusy(null);
    }
  };

  /** Manual path: one draft per selected channel, no AI key involved. */
  const createManual = async () => {
    const text = (body || brief).trim();
    if (!text || picked.length === 0) {
      setError("Write the post and pick at least one channel.");
      return;
    }
    if (mediaRequiredMissing.length) {
      setError(`Attach an image or video first — ${mediaRequiredMissing.join(", ")} cannot publish without media.`);
      return;
    }
    setBusy("manual");
    setError(null);
    const failed: string[] = [];
    for (const platform of picked) {
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: brief.trim() ? brief.trim().slice(0, 90) : undefined,
            content: text,
            platform,
            socialAccountId:
              accounts.find((a) => a.id === accountId && a.platform === platform)?.id ?? undefined,
            mediaAssetIds: media.map((m) => m.id),
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          failed.push(`${platform}: ${data.error ?? res.status}`);
        }
      } catch {
        failed.push(`${platform}: network error`);
      }
    }
    setBusy(null);
    if (failed.length === picked.length) {
      setError(`Nothing was saved — ${failed.join("; ")}`);
      return;
    }
    if (failed.length) setError(`Saved the rest. Failed → ${failed.join("; ")}`);
    router.push("/socialork/drafts");
    router.refresh();
  };

  const saveVariant = async (v: Variant) => {
    setBusy(`save:${v.platform}`);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: v.title ?? undefined,
          content: v.content,
          platform: v.platform,
          mediaAssetIds: media.map((m) => m.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Could not save the ${v.platform} draft (${res.status}).`);
        return;
      }
      router.push("/socialork/drafts");
      router.refresh();
    } catch {
      setError("Network error — the draft was not saved.");
    } finally {
      setBusy(null);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };

  const chip = (active: boolean): React.CSSProperties => ({
    height: 30, padding: "0 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--line2)"}`,
    background: active ? "var(--accentSoft)" : "var(--panel2)",
    color: active ? "var(--accent)" : "var(--text2)",
    fontWeight: active ? 600 : 500,
  });

  const channelsLabel = useMemo(
    () => picked.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id).join(" · "),
    [picked],
  );

  return (
    <>
      {aiReady === false ? (
        <div className="so-banner">
          <div style={{ display: "grid", gap: 2 }}>
            <strong>AI generation is off</strong>
            <span style={{ color: "var(--text2)" }}>
              No API key is set for you or for this workspace. You can still write each variant
              yourself.
            </span>
          </div>
          <a href="/socialork/settings/ai" className="so-btn" style={{ marginLeft: "auto", flex: "none", height: 28 }}>
            Add API key
          </a>
        </div>
      ) : null}

      <form
        className="so-card so-card-pad"
        style={{ display: "grid", gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="brief">Brief</label>
          <textarea id="brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder="What are you announcing, and who is it for?"
            style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
        </div>

        <div className="so-grid so-grid-2">
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="brain">Brain</label>
            <select id="brain" value={brainId} onChange={(e) => setBrainId(e.target.value)} style={field}>
              {brains.length === 0 ? <option value="">No brain yet</option> : null}
              {brains.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.isDefault ? " (active)" : ""}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="tone">Tone</label>
            <select id="tone" value={tone} onChange={(e) => setTone(e.target.value)} style={field}>
              {["professional", "casual", "humorous", "inspirational", "educational", "conversational"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="account">Publish as</label>
          <select id="account" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={field}>
            <option value="">Each channel&apos;s default (mine, else the team&apos;s)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.platform} · {a.handle ?? "connected"} · {a.owner}{a.shared ? " · shared" : ""}
              </option>
            ))}
          </select>
          <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
            Your own connections, plus any the team shared. A personal account is never used by someone else.
          </span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span className="so-stat-label">Channels</span>
          <div className="so-row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" style={chip(picked.includes(p.id))} onClick={() => toggle(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          {/* What the picked channels accept, before the post is written — the
              alternative was learning it from a rejection at publish time. */}
          {picked.length > 0 ? (
            <ul
              data-testid="platform-specs"
              style={{ margin: "2px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 5 }}
            >
              {picked.map((id) => {
                const spec = platformSpec(id as keyof typeof PLATFORM_CONFIGS);
                return (
                  <li
                    key={id}
                    style={{
                      display: "grid",
                      gap: 2,
                      borderLeft: "2px solid var(--line2)",
                      paddingLeft: 9,
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: "var(--text2)" }}>
                      <strong style={{ color: "var(--text)" }}>{spec.name}</strong> — {spec.summary}
                    </span>
                    <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                      {spec.media}
                      {spec.maxCaption ? ` · caption up to ${spec.maxCaption.toLocaleString()} characters` : ""}
                    </span>
                    {spec.rules.map((rule) => (
                      <span key={rule} className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                        · {rule}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="body">Post content (written by you)</label>
          <textarea id="body" rows={6} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Write it once — a draft is created for every channel you picked."
            style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
          <div className="so-row" style={{ gap: 10, flexWrap: "wrap" }}>
            {picked.length === 0 ? (
              <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                pick at least one channel
              </span>
            ) : (
              picked.map((id) => {
                const limit = PLATFORM_CONFIGS[id as keyof typeof PLATFORM_CONFIGS]?.maxTextLength ?? 0;
                const over = limit > 0 && body.length > limit;
                return (
                  <span key={id} className="so-mono" style={{ fontSize: 10.5, color: over ? "var(--red)" : "var(--text3)" }}>
                    {PLATFORM_CONFIGS[id as keyof typeof PLATFORM_CONFIGS]?.name ?? id}
                    {limit ? ` ${body.length}/${limit}` : ""}
                    {over ? " over" : ""}
                  </span>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span className="so-stat-label">Attachments</span>
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label
              className="so-btn"
              style={{ height: 30, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}
            >
              {uploading ? "Uploading…" : "Attach image or video"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
            <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
              JPG · PNG · GIF · WebP · MP4 · MOV · WebM · up to 100MB each
            </span>
          </div>

          {media.length > 0 ? (
            <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
              {media.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                    border: "1px solid var(--line2)", background: "var(--panel2)", maxWidth: 260,
                  }}
                >
                  {m.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" width={28} height={28} style={{ borderRadius: 5, objectFit: "cover" }} />
                  ) : (
                    <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)" }}>VIDEO</span>
                  )}
                  <span style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                    {m.filename}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMedia((list) => list.filter((x) => x.id !== m.id))}
                    style={{ border: 0, background: "transparent", color: "var(--text3)", cursor: "pointer", fontSize: 12 }}
                    aria-label={`Remove ${m.filename}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {media.some((m) => m.devOnly) ? (
            <span className="so-mono" style={{ fontSize: 10.5, color: "var(--amber)" }}>
              dev storage: this asset is stored inline and cannot be published — set BLOB_READ_WRITE_TOKEN for a real upload
            </span>
          ) : null}
          {mediaRequiredMissing.length > 0 ? (
            <span style={{ fontSize: 11.5, color: "var(--amber)" }}>
              {mediaRequiredMissing.map((id) => PLATFORM_CONFIGS[id as keyof typeof PLATFORM_CONFIGS]?.name ?? id).join(", ")} needs an image or video before it can publish.
            </span>
          ) : null}
          {/* Rejections the adapter would produce, said before publishing. */}
          {picked
            .flatMap((id) =>
              mediaProblems(id as keyof typeof PLATFORM_CONFIGS, media).map((problem) => ({ id, problem })),
            )
            .map(({ id, problem }) => (
              <span
                key={`${id}-${problem}`}
                data-testid="media-problem"
                style={{ fontSize: 11.5, color: "var(--amber)" }}
              >
                {problem}
              </span>
            ))}
        </div>

        <div className="so-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            {picked.length} channel{picked.length === 1 ? "" : "s"} · saves as drafts, nothing publishes
          </span>
          <div className="so-row" style={{ gap: 8 }}>
            <button className="so-btn" type="button" onClick={() => void createManual()}
              data-variant="primary" disabled={busy === "manual"}>
              {busy === "manual" ? "Saving…" : `Create ${picked.length} draft${picked.length === 1 ? "" : "s"}`}
            </button>
            <button className="so-btn" type="submit" disabled={busy === "generate" || aiReady === false}
              title={aiReady === false ? "Needs an AI key — add one under Settings → AI keys" : undefined}>
              {busy === "generate" ? "Generating…" : "Generate with AI"}
            </button>
          </div>
        </div>

        {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
      </form>

      {variants ? (
        <section style={{ display: "grid", gap: 12 }}>
          <div className="so-row" style={{ justifyContent: "space-between" }}>
            <span className="so-stat-label">Generated for {channelsLabel}</span>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              {variants[0]?.model ?? "model"} · nothing saved yet
            </span>
          </div>
          <div className="so-grid so-grid-2">
            {variants.map((v, i) => (
              <article key={`${v.platform}-${i}`} className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
                <div className="so-row" style={{ justifyContent: "space-between" }}>
                  <span className="so-pill">{PLATFORMS.find((p) => p.id === v.platform)?.name ?? v.platform}</span>
                  {v.usedMock ? <span className="so-mock">mock</span> : null}
                </div>
                {v.title ? <div style={{ fontWeight: 600 }}>{v.title}</div> : null}
                <div style={{ color: "var(--text2)", fontSize: 12.5, whiteSpace: "pre-wrap" }}>{v.content}</div>
                <div className="so-row" style={{ justifyContent: "flex-end" }}>
                  <button className="so-btn" style={{ height: 28 }} onClick={() => void saveVariant(v)}
                    disabled={busy === `save:${v.platform}`}>
                    {busy === `save:${v.platform}` ? "Saving…" : "Save as draft"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
