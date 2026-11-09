"use client";

/**
 * Brains (design: "Brains" + "New brain"). Each brain is one brand: its voice,
 * audience, pillars, avoid list, example post and channels. Generation reads the
 * active brain first and falls back to the workspace Brand Brain.
 *
 * Writes go through /api/brains (brains:manage on the server). Editors see the
 * same screen read-only.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Platform } from "@prisma/client";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";
import { Portal } from "@/components/socialork/portal";
import {
  BRAIN_COLORS, BRAIN_PLATFORMS, EMPTY_PROFILE, VOICES, missingFields, type BrainProfile,
} from "@/lib/brains/profile";

export type BrainRow = {
  id: string;
  name: string;
  isDefault: boolean;
  color: string | null;
  handle: string | null;
  profile: BrainProfile;
  accounts: { platform: Platform; handle: string | null; ok: boolean }[];
  posts: number;
};

const PNAME: Record<string, { name: string; glyph: GlyphName }> = {
  LINKEDIN: { name: "LinkedIn", glyph: "linkedin" }, TWITTER: { name: "X", glyph: "x" },
  INSTAGRAM: { name: "Instagram", glyph: "instagram" }, FACEBOOK: { name: "Facebook", glyph: "facebook" },
  YOUTUBE: { name: "YouTube", glyph: "youtube" }, TIKTOK: { name: "TikTok", glyph: "tiktok" },
  TELEGRAM: { name: "Telegram", glyph: "telegram" },
};
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const colorOf = (b: { color: string | null; id: string }) =>
  b.color ?? BRAIN_COLORS[[...b.id].reduce((a, c) => a + c.charCodeAt(0), 0) % BRAIN_COLORS.length];

function Glyph({ p }: { p: string }) {
  const g = PNAME[p]?.glyph;
  if (!g) return null;
  return <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: "block", flex: "none" }}><path d={GLYPHS[g]} /></svg>;
}

const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text2)" };
const input: React.CSSProperties = {
  width: "100%", minHeight: 34, padding: "7px 10px", border: "1px solid var(--line2)", borderRadius: 8,
  background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none", font: "inherit", lineHeight: 1.5,
};
const chip = (on: boolean): React.CSSProperties => ({
  height: 28, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", borderRadius: 999,
  border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: on ? "var(--accentSoft)" : "transparent",
  color: on ? "var(--text)" : "var(--text2)", fontSize: 12, fontWeight: 500, cursor: "pointer",
});

/** Free-text list editor: type and press Enter to add, ✕ to remove. */
function ListField({ value, onChange, placeholder, disabled, max }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; disabled: boolean; max: number }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || value.includes(v) || value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {value.map((v) => (
        <span key={v} style={{ ...chip(false), cursor: "default", color: "var(--text)" }}>
          {v}
          {!disabled ? (
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} style={{ border: 0, background: "none", color: "var(--text3)", cursor: "pointer", padding: 0 }}>✕</button>
          ) : null}
        </span>
      ))}
      {!disabled && value.length < max ? (
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add}
          style={{ ...input, width: 200, minHeight: 28, height: 28, padding: "0 10px", borderRadius: 999 }} />
      ) : null}
      {disabled && !value.length ? <span style={{ fontSize: 12.5, color: "var(--text3)" }}>—</span> : null}
    </div>
  );
}

type Draft = { name: string; handle: string; color: string; profile: BrainProfile };
const toDraft = (b: BrainRow): Draft => ({ name: b.name, handle: b.handle ?? "", color: colorOf(b), profile: { ...b.profile } });

export function BrainsBoard({ brains, activeId, canManage, canConnect }: { brains: BrainRow[]; activeId: string; canManage: boolean; canConnect: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(activeId || brains[0]?.id || "");
  const sel = brains.find((b) => b.id === selected) ?? brains[0] ?? null;
  const [draft, setDraft] = useState<Draft | null>(sel ? toDraft(sel) : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ err: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creating, setCreating] = useState(false);

  // Fresh server data (after a save) refreshes the form; picking another brain
  // also clears the status line, so a "Saved" note stays visible after saving.
  useEffect(() => {
    const b = brains.find((x) => x.id === selected) ?? brains[0];
    setDraft(b ? toDraft(b) : null);
  }, [selected, brains]);
  useEffect(() => {
    setConfirmDelete(false);
    setNote(null);
  }, [selected]);

  const dirty = useMemo(() => (sel && draft ? JSON.stringify(toDraft(sel)) !== JSON.stringify(draft) : false), [sel, draft]);
  const setP = (patch: Partial<BrainProfile>) => setDraft((d) => (d ? { ...d, profile: { ...d.profile, ...patch } } : d));

  const use = async (id: string) => {
    setBusy(`use:${id}`);
    const res = await fetch("/api/brains/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brainId: id }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setNote({ err: true, text: "Could not switch brains. Try again." }); return; }
    router.refresh();
  };

  const save = async () => {
    if (!sel || !draft) return;
    if (!draft.name.trim()) { setNote({ err: true, text: "A brain needs a name." }); return; }
    setBusy("save");
    try {
      const res = await fetch(`/api/brains/${sel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name.trim(), handle: draft.handle.trim() || null, color: draft.color, profile: draft.profile }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setNote({ err: true, text: data.error ?? `Could not save (${res.status}).` }); return; }
      setNote({ err: false, text: "Saved. New drafts use this brain's profile." });
      router.refresh();
    } catch {
      setNote({ err: true, text: "Network error — nothing was saved." });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!sel) return;
    setBusy("delete");
    const res = await fetch(`/api/brains/${sel.id}`, { method: "DELETE" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(null);
    setConfirmDelete(false);
    if (!res?.ok) { setNote({ err: true, text: data?.error ?? "Could not delete this brain." }); return; }
    setSelected(activeId === sel.id ? "" : activeId);
    router.refresh();
  };

  const missing = draft ? missingFields(draft.profile) : [];
  const ro = !canManage;
  const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" };

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Brains</h1>
          <p className="so-sub">A brain holds one brand&apos;s voice, audience and channels. Generation reads the active brain, and every draft says which fields it used.</p>
        </div>
        {canManage ? <button className="so-btn" data-variant="primary" style={{ height: 34 }} onClick={() => setCreating(true)}>+ New brain</button> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {brains.map((b, i) => {
            const on = b.id === sel?.id, active = b.id === activeId;
            return (
              <div key={b.id} style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start", borderTop: i ? "1px solid var(--line)" : 0, background: on ? "var(--panel2)" : "transparent", cursor: "pointer" }}
                onClick={() => setSelected(b.id)} role="button" tabIndex={0} aria-pressed={on}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(b.id); } }}>
                <span style={{ width: 28, height: 28, flex: "none", borderRadius: 7, background: colorOf(b), display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, color: "#06140B" }}>{initials(b.name)}</span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                    {active ? <span className="so-pill" data-tone="approved">Active</span> : null}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b.profile.description || "No description yet."}</span>
                  <span aria-hidden="true" style={{ height: 3, borderRadius: 2, background: "var(--panel2)", overflow: "hidden", marginTop: 3 }}>
                    <span style={{ display: "block", height: "100%", width: `${Math.round(((6 - missingFields(b.profile).length) / 6) * 100)}%`, background: missingFields(b.profile).length ? "var(--amber)" : "var(--accent)" }} />
                  </span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{b.accounts.length} channel{b.accounts.length === 1 ? "" : "s"} · {b.posts} post{b.posts === 1 ? "" : "s"}{b.handle ? ` · ${b.handle}` : ""}</span>
                </span>
                {!active ? (
                  <button className="so-btn" style={{ height: 28 }} disabled={busy === `use:${b.id}`} onClick={(e) => { e.stopPropagation(); void use(b.id); }}>Use</button>
                ) : null}
              </div>
            );
          })}
        </div>

        {sel && draft ? (
          <section style={{ ...card, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
              <span style={{ width: 40, height: 40, flex: "none", borderRadius: 10, background: draft.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#06140B" }}>{initials(draft.name || sel.name)}</span>
              <span style={{ flex: 1, minWidth: 160 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 15 }}>{sel.name}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text3)" }}>{sel.id === activeId ? "Active brain · new posts use this voice" : "Not active"}</span>
              </span>
              {sel.id !== activeId ? <button className="so-btn" style={{ height: 32 }} onClick={() => void use(sel.id)} disabled={busy === `use:${sel.id}`}>Use this brain</button> : null}
            </div>

            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
              {ro ? <div className="so-frame" style={{ fontSize: 12 }}>Editors can read brains. Managers and admins edit them.</div> : null}
              {missing.length ? (
                <div className="so-frame" style={{ fontSize: 12 }}>
                  Missing: {missing.join(", ")}. Drafts still generate, and say which fields were missing. Anything left empty falls back to <Link href="/socialork/settings/brand">Brand Brain</Link>.
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Brand name</span>
                  <input style={input} value={draft.name} disabled={ro} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Handle</span>
                  <input style={input} value={draft.handle} disabled={ro} maxLength={60} placeholder="@brand" onChange={(e) => setDraft({ ...draft, handle: e.target.value })} /></label>
                <div style={{ display: "grid", gap: 6 }}><span style={label}>Colour</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", minHeight: 34 }}>
                    {BRAIN_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={draft.color === c} disabled={ro} onClick={() => setDraft({ ...draft, color: c })}
                        style={{ width: 24, height: 24, borderRadius: 7, background: c, border: draft.color === c ? "2px solid var(--text)" : "2px solid transparent", cursor: ro ? "default" : "pointer" }} />
                    ))}
                  </div>
                </div>
              </div>

              <label style={{ display: "grid", gap: 6 }}><span style={label}>Description</span>
                <textarea style={input} rows={2} maxLength={600} disabled={ro} value={draft.profile.description} placeholder="What does the brand do?" onChange={(e) => setP({ description: e.target.value })} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Industry</span>
                  <input style={input} maxLength={120} disabled={ro} value={draft.profile.industry} onChange={(e) => setP({ industry: e.target.value })} /></label>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Audience</span>
                  <input style={input} maxLength={600} disabled={ro} value={draft.profile.audience} placeholder="Who is it for?" onChange={(e) => setP({ audience: e.target.value })} /></label>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={label}>Voice <span style={{ fontWeight: 400, color: "var(--text3)" }}>· up to three</span></span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {VOICES.map((v) => {
                    const on = draft.profile.voice.includes(v);
                    const full = !on && draft.profile.voice.length >= 3;
                    return (
                      <button key={v} type="button" aria-pressed={on} disabled={ro || full} style={{ ...chip(on), opacity: full ? 0.45 : 1 }}
                        onClick={() => setP({ voice: on ? draft.profile.voice.filter((x) => x !== v) : [...draft.profile.voice, v] })}>{v}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={label}>Words and phrases to avoid</span>
                <ListField value={draft.profile.avoid} onChange={(v) => setP({ avoid: v })} placeholder="Add a word, press Enter" disabled={ro} max={30} />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <span style={label}>Content pillars</span>
                <ListField value={draft.profile.pillars} onChange={(v) => setP({ pillars: v })} placeholder="Add a pillar, press Enter" disabled={ro} max={12} />
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={label}>Example post <span style={{ fontWeight: 400, color: "var(--text3)" }}>· generation matches its length and rhythm, not its wording</span></span>
                <textarea style={input} rows={4} maxLength={3000} disabled={ro} value={draft.profile.example} onChange={(e) => setP({ example: e.target.value })} />
              </label>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={label}>Channels</span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>Each brain keeps its own connected accounts. They are connected in Settings → Connections.</span>
                <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                  {BRAIN_PLATFORMS.map((p, i) => {
                    const acct = sel.accounts.find((a) => a.platform === p);
                    const planned = draft.profile.channels.includes(p);
                    const status = acct ? (acct.ok ? `${acct.handle ?? "connected"} · connected` : `${acct.handle ?? ""} · needs reconnecting`) : planned ? "Planned · not connected" : "Not connected";
                    return (
                      <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: i ? "1px solid var(--line)" : 0, opacity: acct || planned ? 1 : 0.65 }}>
                        <span style={{ color: "var(--text2)" }}><Glyph p={p} /></span>
                        <span style={{ fontWeight: 500, width: 90 }}>{PNAME[p].name}</span>
                        <span style={{ flex: 1, fontSize: 12, color: acct && !acct.ok ? "var(--amber)" : "var(--text3)" }}>{status}</span>
                        {!acct && !ro ? (
                          <button type="button" className="so-btn" data-variant="ghost" style={{ height: 26, fontSize: 12 }}
                            onClick={() => setP({ channels: planned ? draft.profile.channels.filter((x) => x !== p) : [...draft.profile.channels, p] })}>
                            {planned ? "Remove" : "Plan"}
                          </button>
                        ) : null}
                        {canConnect && (!acct || !acct.ok) ? <Link href="/socialork/settings" style={{ fontSize: 12, fontWeight: 600 }}>{acct ? "Reconnect" : "Connect"}</Link> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: 12, color: note?.err ? "var(--red)" : "var(--text3)" }}>
                {note?.text ?? `Used by ${sel.posts} post${sel.posts === 1 ? "" : "s"}.`}
              </span>
              {canManage ? (
                confirmDelete ? (
                  <>
                    <span style={{ fontSize: 12, color: "var(--text2)" }}>Delete {sel.name}? Its connected accounts are disconnected.</span>
                    <button className="so-btn" style={{ height: 32, color: "var(--red)" }} onClick={() => void remove()} disabled={busy === "delete"}>Delete</button>
                    <button className="so-btn" data-variant="ghost" style={{ height: 32 }} onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="so-btn" data-variant="ghost" style={{ height: 32 }} onClick={() => setConfirmDelete(true)}>Delete</button>
                    <button className="so-btn" data-variant="ghost" style={{ height: 32 }} disabled={!dirty} onClick={() => setDraft(toDraft(sel))}>Discard</button>
                    <button className="so-btn" data-variant="primary" style={{ height: 32 }} disabled={!dirty || busy === "save"} onClick={() => void save()}>{busy === "save" ? "Saving…" : "Save brain"}</button>
                  </>
                )
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      {creating ? <NewBrain current={sel} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setSelected(id); router.refresh(); }} /> : null}
    </div>
  );
}

/** Three steps: start from, brand basics, channels. */
function NewBrain({ current, onClose, onCreated }: { current: BrainRow | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [from, setFrom] = useState<"blank" | "copy">("blank");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [color, setColor] = useState<string>(BRAIN_COLORS[1]);
  const [profile, setProfile] = useState<BrainProfile>({ ...EMPTY_PROFILE });
  const [makeActive, setMakeActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickFrom = (f: "blank" | "copy") => {
    setFrom(f);
    setProfile(f === "copy" && current ? { ...current.profile } : { ...EMPTY_PROFILE });
  };

  const create = async () => {
    if (!name.trim()) { setStep(2); setErr("Give the brand a name."); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), handle: handle.trim() || null, color, profile }),
      });
      const data = (await res.json().catch(() => ({}))) as { brain?: { id: string }; error?: string };
      if (!res.ok || !data.brain) { setErr(data.error ?? `Could not create the brain (${res.status}).`); return; }
      if (makeActive) {
        await fetch("/api/brains/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brainId: data.brain.id }) }).catch(() => null);
      }
      onCreated(data.brain.id);
    } catch {
      setErr("Network error — the brain was not created.");
    } finally {
      setBusy(false);
    }
  };

  const steps = ["Start from", "Brand", "Channels"];
  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,.55)" }} />
      <div role="dialog" aria-modal="true" aria-label="New brain" style={{ position: "fixed", zIndex: 41, top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(560px, calc(100% - 24px))", maxHeight: "calc(100dvh - 40px)", overflowY: "auto", border: "1px solid var(--line2)", borderRadius: 14, background: "var(--panel)", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: color, display: "grid", placeItems: "center", fontWeight: 700, color: "#06140B" }}>{initials(name || "New")}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 600 }}>{name.trim() || "New brain"}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text3)" }}>Step {step} of 3 · {steps[step - 1]}</span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, border: 0, borderRadius: 8, background: "none", color: "var(--text3)", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {step === 1 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {[
                { k: "blank" as const, t: "A blank brain", s: "Start with an empty profile." },
                ...(current ? [{ k: "copy" as const, t: `A copy of ${current.name}`, s: "Same voice, pillars and avoid list. Change what differs." }] : []),
              ].map((o) => (
                <button key={o.k} onClick={() => pickFrom(o.k)} aria-pressed={from === o.k}
                  style={{ textAlign: "start", padding: 14, borderRadius: 10, border: `1px solid ${from === o.k ? "var(--accent)" : "var(--line2)"}`, background: from === o.k ? "var(--accentSoft)" : "var(--bg)", color: "var(--text)", cursor: "pointer" }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{o.t}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text2)" }}>{o.s}</span>
                </button>
              ))}
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Brand name</span><input autoFocus style={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
                <label style={{ display: "grid", gap: 6 }}><span style={label}>Handle</span><input style={input} value={handle} maxLength={60} placeholder="@brand" onChange={(e) => setHandle(e.target.value)} /></label>
              </div>
              <div style={{ display: "grid", gap: 6 }}><span style={label}>Colour</span>
                <div style={{ display: "flex", gap: 6 }}>{BRAIN_COLORS.map((c) => (
                  <button key={c} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: color === c ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer" }} />
                ))}</div>
              </div>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>What does the brand do?</span><textarea style={input} rows={2} maxLength={600} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={label}>Who is it for?</span><input style={input} maxLength={600} value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} /></label>
              <div style={{ display: "grid", gap: 8 }}>
                <span style={label}>Voice <span style={{ fontWeight: 400, color: "var(--text3)" }}>· up to three</span></span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{VOICES.map((v) => {
                  const on = profile.voice.includes(v), full = !on && profile.voice.length >= 3;
                  return <button key={v} aria-pressed={on} disabled={full} style={{ ...chip(on), opacity: full ? 0.45 : 1 }} onClick={() => setProfile({ ...profile, voice: on ? profile.voice.filter((x) => x !== v) : [...profile.voice, v] })}>{v}</button>;
                })}</div>
              </div>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>You can add an avoid list, pillars and an example post later. Drafts say which fields were missing.</span>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <span style={label}>Channels this brain posts to</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{BRAIN_PLATFORMS.map((p) => {
                const on = profile.channels.includes(p);
                return <button key={p} aria-pressed={on} style={chip(on)} onClick={() => setProfile({ ...profile, channels: on ? profile.channels.filter((x) => x !== p) : [...profile.channels, p] })}><Glyph p={p} />{PNAME[p].name}</button>;
              })}</div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, border: "1px solid var(--line)", borderRadius: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} style={{ marginTop: 3 }} />
                <span><span style={{ display: "block", fontWeight: 600 }}>Make it the active brain</span><span style={{ fontSize: 12, color: "var(--text2)" }}>New posts will use this brand&apos;s voice and channels.</span></span>
              </label>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>The actual accounts are connected afterwards in Settings → Connections. Until then these channels show as not connected.</span>
            </>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--line)" }}>
          {step > 1 ? <button className="so-btn" data-variant="ghost" style={{ height: 32 }} onClick={() => setStep(step - 1)}>Back</button> : null}
          <span style={{ flex: 1, fontSize: 12, color: "var(--red)" }}>{err}</span>
          {step < 3 ? (
            <button className="so-btn" data-variant="primary" style={{ height: 32 }} onClick={() => { if (step === 2 && !name.trim()) { setErr("Give the brand a name."); return; } setErr(null); setStep(step + 1); }}>Continue</button>
          ) : (
            <button className="so-btn" data-variant="primary" style={{ height: 32 }} disabled={busy} onClick={() => void create()}>{busy ? "Creating…" : "Create brain"}</button>
          )}
        </div>
      </div>
    </Portal>
  );
}
