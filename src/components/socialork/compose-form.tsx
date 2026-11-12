"use client";

/**
 * Create, in the handoff's shape: one brief, a brain, the channels to hit, and
 * per-channel drafts. Generation spends the workspace's own AI key — when no key
 * is configured the screen says so and offers the manual path instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Images, ImagePlus, KeyRound, Sparkles, Upload, X } from "lucide-react";
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

export function ComposeForm({
  accounts = [],
  initialBody = "",
  initialPlatform,
  canApprove = false,
}: { accounts?: AccountOption[]; initialBody?: string; initialPlatform?: string; canApprove?: boolean }) {
  const router = useRouter();
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainId, setBrainId] = useState<string>("");
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [brief, setBrief] = useState("");
  const [body, setBody] = useState(initialBody);
  const [tone, setTone] = useState("professional");
  const [postTitle, setPostTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [cta, setCta] = useState("");
  const [picked, setPicked] = useState<string[]>([PLATFORMS.some((p) => p.id === initialPlatform) ? (initialPlatform as string) : "LINKEDIN"]);
  const [accountId, setAccountId] = useState<string>("");
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [media, setMedia] = useState<{ id: string; url: string; filename: string; mimeType: string; devOnly: boolean }[]>([]);
  const [genBusy, setGenBusy] = useState(false);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [imgPrompt, setImgPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [library, setLibrary] = useState<{ id: string; url: string; filename: string; mimeType: string; altText?: string | null }[] | null>(null);
  const openLibrary = async () => {
    const next = !libOpen;
    setLibOpen(next);
    if (next && !library) {
      const r = await fetch("/api/media?limit=60");
      const j = (await r.json().catch(() => ({}))) as { assets?: { id: string; url: string; filename: string; mimeType: string; altText?: string | null }[] };
      setLibrary(j.assets ?? []);
    }
  };
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
        // The endpoint reports the key that would actually be used for a text
        // request (the person's, else the team's). Image keys are a separate kind
        // and never count here.
        const hasKey = Boolean(mine?.effectiveSource ?? shared?.effectiveSource);
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

  /**
   * Generate an image on the workspace/user image key and attach it straight
   * away — the route stores it as a media asset, so it uploads nothing.
   */
  const generateImage = async () => {
    const prompt = (imgPrompt.trim() || brief.trim() || body.trim()).slice(0, 1500);
    if (!prompt) {
      setError("Describe the image you want, or write the brief first.");
      return;
    }
    setGenBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/images", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        filename?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(data.error ?? `Image generation failed (${res.status}).`);
        return;
      }
      const newId = String(data.id ?? data.url);
      setCoverId(newId);
      setMedia((m) => [
        ...m,
        {
          id: newId,
          url: String(data.url),
          filename: data.filename ?? "ai-image.png",
          mimeType: data.mimeType ?? "image/png",
          devOnly: false,
        },
      ]);
    } catch {
      setError("Network error generating the image.");
    } finally {
      setGenBusy(false);
    }
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
        body: JSON.stringify({ idea: brief.trim(), platforms: picked, tone, additionalContext: [audience.trim() && `Audience: ${audience.trim()}`, cta.trim() && `Call to action: ${cta.trim()}`].filter(Boolean).join("\n") || undefined }),
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
  // Managers and admins decide here, so the one-click option is the default for them.
  const [after, setAfter] = useState<"draft" | "approval" | "schedule">(canApprove ? "schedule" : "draft");

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
    const createdIds: string[] = [];
    for (const platform of picked) {
      try {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: postTitle.trim() ? postTitle.trim().slice(0, 90) : brief.trim() ? brief.trim().slice(0, 90) : undefined,
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
        } else {
          const data = (await res.json().catch(() => ({}))) as { id?: string; post?: { id?: string } };
          const id = data.id ?? data.post?.id;
          if (id) createdIds.push(id);
        }
      } catch {
        failed.push(`${platform}: network error`);
      }
    }
    // One-click follow-ups: send for approval, or approve + schedule the next free slot.
    let landing = "/socialork/drafts";
    if (after !== "draft" && createdIds.length) {
      let slot: string | null = null;
      if (after === "schedule") {
        const r = await fetch("/api/posts/next-slot").then((x) => (x.ok ? x.json() : null)).catch(() => null);
        slot = (r as { at?: string } | null)?.at ?? null;
      }
      for (const id of createdIds) {
        const submit = await fetch(`/api/posts/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
        if (!submit.ok) { failed.push(`submit: ${submit.status}`); continue; }
        landing = "/socialork/approvals";
        if (after === "schedule" && slot) {
          const ap = await fetch(`/api/posts/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve" }) });
          if (!ap.ok) {
            const why = ((await ap.json().catch(() => ({}))) as { error?: string }).error;
            failed.push(why ?? `approve failed (${ap.status})`);
            continue;
          }
          const sc = await fetch(`/api/posts/${id}/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduledFor: slot }) });
          if (sc.ok) landing = "/socialork/publishing";
          else {
            const d = (await sc.json().catch(() => ({}))) as { error?: string };
            // the autoSchedule rule may already have scheduled it on approve; that is fine
            if (d.error?.includes("Current status: SCHEDULED")) landing = "/socialork/publishing";
            else failed.push(`post: ${d.error ?? sc.status}`);
          }
        }
      }
    }
    setBusy(null);
    if (failed.length === picked.length && !createdIds.length) {
      setError(`Nothing was saved — ${failed.join("; ")}`);
      return;
    }
    if (failed.length) { setError(`Saved, but some steps need attention → ${failed.join("; ")}`); if (landing === "/socialork/drafts") { router.refresh(); return; } }
    router.push(landing);
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
    height: 30, padding: "0 10px", borderRadius: 7, fontSize: 12.5, cursor: "pointer",
    border: `1px solid ${active ? "var(--accent)" : "var(--line2)"}`,
    background: active ? "var(--accentSoft)" : "var(--panel2)",
    color: active ? "var(--accent)" : "var(--text2)",
    fontWeight: active ? 600 : 500,
  });

  const cover = media.find((m) => m.id === coverId) ?? media[media.length - 1] ?? null;

  const channelsLabel = useMemo(
    () => picked.map((id) => PLATFORMS.find((p) => p.id === id)?.name ?? id).join(" · "),
    [picked],
  );

  return (
    <>
      {aiReady === false ? (
        <div className="so-card" style={{ display: "flex", gap: 14, alignItems: "center", padding: "14px 18px" }}>
          <span aria-hidden style={{ width: 34, height: 34, flex: "none", borderRadius: 9, display: "grid", placeItems: "center", background: "var(--amberSoft)", color: "var(--amber)" }}><KeyRound size={16} /></span>
          <div style={{ display: "grid", gap: 2 }}>
            <strong>AI generation is off</strong>
            <span style={{ color: "var(--text2)" }}>
              No text key is set for you or for this workspace. Image keys do not count here: add a
              text key under Settings → AI keys (Text). You can still write each variant yourself.
            </span>
          </div>
          <a href="/socialork/settings/ai" className="so-btn" style={{ marginLeft: "auto", flex: "none", height: 28 }}>
            Add API key
          </a>
        </div>
      ) : null}

      <style>{`.so-cf-preview{display:grid;align-content:start;overflow:hidden;padding:0}.so-cf-stage{position:relative;height:clamp(280px,46vh,520px);background:var(--bg);border-bottom:1px solid var(--line);display:grid;place-items:center;overflow:hidden}.so-cf-stage img,.so-cf-stage video{width:100%;height:100%;object-fit:contain;display:block}.so-cf-stage-empty{position:relative;display:grid;justify-items:center;gap:8px;text-align:center;padding:24px;width:100%;height:100%;align-content:center}.so-cf-shimmer{position:absolute;inset:0;background:linear-gradient(100deg,var(--panel2) 20%,var(--line2) 50%,var(--panel2) 80%);background-size:200% 100%;animation:so-shimmer 1.4s linear infinite;opacity:.6}.so-cf-line{height:12px;border-radius:4px;background:linear-gradient(100deg,var(--panel2) 20%,var(--line2) 50%,var(--panel2) 80%);background-size:200% 100%;animation:so-shimmer 1.4s linear infinite}@keyframes so-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}.so-cf-stage-remove{position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--line2);background:var(--panel);color:var(--text);font-size:12px;cursor:pointer}.so-cf-thumbs{display:flex;gap:8px;padding:10px 16px;overflow-x:auto;border-bottom:1px solid var(--line)}.so-cf-thumb{position:relative;flex:none;width:72px;height:72px;border-radius:9px;border:2px solid var(--line2);overflow:hidden;background:var(--bg)}.so-cf-thumb[data-active=true]{border-color:var(--accent)}.so-cf-thumb-pick{all:unset;cursor:pointer;display:grid;place-items:center;width:100%;height:100%}.so-cf-thumb-pick img{width:100%;height:100%;object-fit:cover}.so-cf-thumb-x{position:absolute;top:3px;right:3px;width:20px;height:20px;display:grid;place-items:center;border-radius:6px;border:0;background:rgba(0,0,0,.65);color:#fff;cursor:pointer}.so-cf-tools{display:grid;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.so-cf-genbar{display:flex;gap:8px;flex-wrap:wrap}.so-cf-genbar input{flex:1 1 240px;min-width:0;height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--line2);background:var(--panel2);color:var(--text);font-size:13px}.so-cf-genbar .so-btn{height:34px;display:inline-flex;align-items:center;gap:6px}.so-cf-tools .so-btn{display:inline-flex;align-items:center;gap:6px}.so-cf-library{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;max-height:240px;overflow-y:auto;padding:2px}.so-cf-library button{padding:0;aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;background:var(--bg);border:2px solid var(--line2)}.so-cf-library img{width:100%;height:100%;object-fit:cover}.so-cf-post{display:grid;gap:8px;padding:14px 16px 16px}.so-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.so-create-grid{display:grid;grid-template-columns:minmax(0,440px) minmax(0,1fr);gap:14px;align-items:start}.so-cf2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.so-cf-actions{position:sticky;bottom:0;background:var(--panel);padding-top:10px;border-top:1px solid var(--line);display:grid;gap:8px;z-index:2}@media(max-width:960px){.so-create-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:560px){.so-cf2{grid-template-columns:minmax(0,1fr)}}`}</style>
      <div className="so-create-grid">
      <form
        className="so-card"
        style={{ display: "grid", gap: 12, padding: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <div style={{ fontWeight: 600 }}>Brief</div>
        <div className="so-cf2">
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="post-title">Title</label>
          <input id="post-title" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="Internal name for the post" style={field} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="audience">Audience</label>
          <input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Who is this for?" style={field} />
        </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="brief">Core message</label>
          <textarea id="brief" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)}
            placeholder="What are you announcing, and who is it for?"
            style={{ ...field, resize: "vertical", lineHeight: 1.55 }} />
        </div>

        <details className="so-cf-more" style={{ display: "grid", gap: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text2)", fontWeight: 500 }}>More options: brain, tone, call to action, publish as</summary>
        <div className="so-cf2">
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="brain">Brain</label>
            <select id="brain" value={brainId} onChange={(e) => setBrainId(e.target.value)} style={field}>
              {brains.length === 0 ? <option value="">No brain yet</option> : null}
              {brains.map((b) => (
                <option key={b.id} value={b.id}>{b.name}{b.isDefault ? " (active)" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span className="so-stat-label">Tone</span>
          <div role="radiogroup" aria-label="Tone" style={{ display: "flex", padding: 2, border: "1px solid var(--line2)", borderRadius: 8, background: "var(--panel2)" }}>
            {["professional", "friendly", "bold"].map((t) => (
              <button key={t} type="button" role="radio" aria-checked={tone === t} onClick={() => setTone(t)}
                style={{ flex: 1, height: 30, border: 0, borderRadius: 6, cursor: "pointer", textTransform: "capitalize", fontSize: 12.5, fontWeight: 500, background: tone === t ? "var(--bg)" : "transparent", color: tone === t ? "var(--text)" : "var(--text3)" }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="cta">Call to action</label>
          <input id="cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="What should people do next?" style={field} />
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
        </details>

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


        <div className="so-cf-actions">
        <div className="so-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            {picked.length} channel{picked.length === 1 ? "" : "s"} ·{" "}
            {after === "draft" ? "saves as drafts, nothing publishes" : after === "approval" ? "goes to approval, nothing publishes until approved" : "approved and queued for the next free slot"}
          </span>
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div role="radiogroup" aria-label="After creating" data-testid="after-create" style={{ display: "flex", padding: 2, border: "1px solid var(--line2)", borderRadius: 8, background: "var(--panel2)" }}>
              {([["draft", "Draft"], ["approval", "Send for approval"], ["schedule", canApprove ? "Approve & schedule" : "Schedule next slot"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={after === k} onClick={() => setAfter(k)}
                  style={{ border: 0, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", background: after === k ? "var(--accent-soft, var(--panel))" : "transparent", color: after === k ? "var(--text)" : "var(--text3)", fontWeight: after === k ? 600 : 400 }}>{l}</button>
              ))}
            </div>
            <button className="so-btn" type="button" onClick={() => void createManual()}
              data-variant="primary" disabled={busy === "manual"} data-testid="create-submit">
              {busy === "manual" ? "Working…" : after === "draft" ? `Create ${picked.length} draft${picked.length === 1 ? "" : "s"}` : after === "approval" ? "Create & send for approval" : canApprove ? "Create, approve & schedule" : "Create & schedule"}
            </button>
            <button className="so-btn" type="submit" disabled={busy === "generate" || aiReady === false}
              title={aiReady === false ? "Needs an AI key — add one under Settings → AI keys" : undefined}>
              {busy === "generate" ? "Generating…" : "Generate with AI"}
            </button>
          </div>
        </div>

        {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}
        </div>
      </form>

      <section className="so-card so-cf-preview">
        {/* The image stage: the picked (or newest) image at full size. */}
        <div className="so-cf-stage" data-testid="media-stage">
          {genBusy ? (
            <div className="so-cf-stage-empty" role="status">
              <div className="so-cf-shimmer" aria-hidden />
              <span style={{ position: "relative", fontWeight: 600 }}>Generating your image…</span>
              <span style={{ position: "relative", color: "var(--text3)", fontSize: 12 }}>This can take up to a minute.</span>
            </div>
          ) : cover ? (
            cover.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt={cover.filename} />
            ) : (
              <video src={cover.url} controls />
            )
          ) : (
            <div className="so-cf-stage-empty">
              <ImagePlus size={34} aria-hidden style={{ color: "var(--text3)" }} />
              <strong>No image yet</strong>
              <span style={{ color: "var(--text2)", maxWidth: 340 }}>
                Generate one with AI below, upload your own, or pick one from the library.
              </span>
            </div>
          )}
          {cover && !genBusy ? (
            <button
              type="button"
              className="so-cf-stage-remove"
              aria-label={`Remove ${cover.filename}`}
              onClick={() => {
                setMedia((list) => list.filter((x) => x.id !== cover.id));
                setCoverId(null);
              }}
            >
              <X size={14} aria-hidden /> Remove
            </button>
          ) : null}
        </div>

        {media.length > 1 ? (
          <div className="so-cf-thumbs" aria-label="Attached media">
            {media.map((m) => (
              <div key={m.id} className="so-cf-thumb" data-active={cover?.id === m.id}>
                <button type="button" className="so-cf-thumb-pick" aria-label={`Show ${m.filename}`} aria-pressed={cover?.id === m.id} onClick={() => setCoverId(m.id)}>
                  {m.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt="" />
                  ) : (
                    <span className="so-mono" style={{ fontSize: 10 }}>VIDEO</span>
                  )}
                </button>
                <button type="button" className="so-cf-thumb-x" aria-label={`Remove ${m.filename}`} onClick={() => setMedia((list) => list.filter((x) => x.id !== m.id))}>
                  <X size={11} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Image tools: AI first, then upload and the library. */}
        <div className="so-cf-tools">
          <div className="so-cf-genbar">
            <label htmlFor="img-prompt" className="so-sr-only">Image prompt</label>
            <input
              id="img-prompt"
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void generateImage(); } }}
              placeholder="Describe the image… (empty uses your brief)"
              aria-label="Image prompt"
            />
            <button type="button" className="so-btn" data-variant="primary" disabled={genBusy} onClick={() => void generateImage()}>
              <Sparkles size={14} aria-hidden /> {genBusy ? "Generating…" : "Generate image with AI"}
            </button>
          </div>
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="so-btn" style={{ height: 30, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}>
              <Upload size={14} aria-hidden /> {uploading ? "Uploading…" : "Upload image or video"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
            <button type="button" className="so-btn" style={{ height: 30 }} aria-expanded={libOpen} onClick={() => void openLibrary()}>
              <Images size={14} aria-hidden /> Choose from library
            </button>
            <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
              JPG · PNG · GIF · WebP · MP4 · MOV · WebM · up to 100MB
            </span>
          </div>

          {libOpen ? (
            <div data-testid="media-library" className="so-cf-library">
              {library === null ? <span style={{ fontSize: 12, color: "var(--text3)" }}>Loading…</span> : library.length === 0 ? <span style={{ fontSize: 12, color: "var(--text3)" }}>The library is empty. Upload something first.</span> : library.map((a) => {
                const on = media.some((m) => m.id === a.id);
                return (
                  <button key={a.id} type="button" title={a.altText || a.filename} aria-pressed={on}
                    onClick={() => {
                      if (on) {
                        setMedia((list) => list.filter((x) => x.id !== a.id));
                      } else {
                        setMedia((list) => [...list, { id: a.id, url: a.url, filename: a.filename, mimeType: a.mimeType, devOnly: false }]);
                        setCoverId(a.id);
                      }
                    }}
                    style={{ borderColor: on ? "var(--accent)" : "var(--line2)" }}>
                    {a.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.altText || a.filename} />
                    ) : <span className="so-mono" style={{ fontSize: 10 }}>VIDEO</span>}
                  </button>
                );
              })}
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
          {picked
            .flatMap((id) => mediaProblems(id as keyof typeof PLATFORM_CONFIGS, media).map((problem) => ({ id, problem })))
            .map(({ id, problem }) => (
              <span key={`${id}-${problem}`} data-testid="media-problem" style={{ fontSize: 11.5, color: "var(--amber)" }}>
                {problem}
              </span>
            ))}
        </div>

        {/* What the post will look like, then the AI drafts per channel. */}
        <div className="so-cf-post">
          <div className="so-row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span className="so-stat-label">Post preview</span>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{channelsLabel || "no channel picked"}</span>
          </div>
          {body.trim() ? (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>{body}</div>
          ) : (
            <div style={{ color: "var(--text3)", fontSize: 12.5 }}>
              Your post text shows here as you write it. Generate with AI for one draft per channel.
            </div>
          )}
        </div>

        {variants ? (
          <div style={{ display: "grid", gap: 12, padding: "0 18px 18px" }}>
            <div className="so-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>Generated for {channelsLabel}</span>
              <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                {variants[0]?.model ?? "model"} · nothing saved yet
              </span>
            </div>
            {variants.map((v, i) => (
              <article key={`${v.platform}-${i}`} style={{ display: "grid", gap: 8, padding: 14, border: "1px solid var(--line2)", borderRadius: 10, background: "var(--bg)" }}>
                <div className="so-row" style={{ justifyContent: "space-between" }}>
                  <span className="so-pill">{PLATFORMS.find((p) => p.id === v.platform)?.name ?? v.platform}</span>
                  {v.usedMock ? <span className="so-mock">mock</span> : null}
                </div>
                {v.title ? <div style={{ fontWeight: 600 }}>{v.title}</div> : null}
                <div style={{ color: "var(--text2)", fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{v.content}</div>
                <div className="so-row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <button className="so-btn" style={{ height: 28 }} type="button" onClick={() => setBody(v.content)}>
                    Use this text
                  </button>
                  <button className="so-btn" style={{ height: 28 }} onClick={() => void saveVariant(v)}
                    disabled={busy === `save:${v.platform}`}>
                    {busy === `save:${v.platform}` ? "Saving…" : "Save as draft"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : busy === "generate" ? (
          <div style={{ padding: "0 18px 18px", display: "grid", gap: 12 }} role="status">
            <div style={{ fontSize: 12.5, color: "var(--text2)" }}>Generating a draft for {channelsLabel || "each channel"}…</div>
            {[60, 92, 84, 40].map((w) => (
              <div key={w} className="so-cf-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : null}
      </section>
      </div>
    </>
  );
}
