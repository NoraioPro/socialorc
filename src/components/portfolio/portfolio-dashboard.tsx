"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, Copy, ExternalLink, Globe, History, Loader2, PenLine, Play, Plus, X } from "lucide-react";
import { TEMPLATES } from "@/lib/portfolio/templates";
import type { PortfolioDTO } from "@/lib/portfolio/server";
import type { PublishCheck } from "@/lib/portfolio/checks";
import { PortfolioThumb } from "./thumb";
import { TemplateGallery, type SavedTemplate, type TemplateChoice } from "./template-gallery";

interface Profile { name: string | null; headline: string | null; location: string | null; image: string | null; bio: string | null }
interface VersionRow { id: string; kind: string; label: string | null; createdAt: string; live: boolean }
type HandleCheck = { status: "ok" | "invalid" | "reserved" | "taken"; message: string; suggestions: string[] };

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const KIND_LABEL: Record<string, string> = { CREATED: "Created", AUTOSAVE: "Autosaved", PUBLISHED: "Published", NAMED: "Named version", BEFORE_RESTORE: "Saved before a change" };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const data = await res.json().catch(() => null);
    return res.ok ? { ok: true, data: data as T } : { ok: false, status: res.status, error: data?.error ?? `Request failed (${res.status})`, data };
  } catch {
    return { ok: false, status: 0, error: "You appear to be offline.", data: null };
  }
}

/**
 * /socialork/portfolio: the first-time flow (claim an address, pick a starting
 * point) and, once a portfolio exists, its status, address, visibility and versions.
 */
export function PortfolioDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioDTO | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saved, setSaved] = useState<SavedTemplate[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [handle, setHandle] = useState("");
  const [check, setCheck] = useState<HandleCheck | null>(null);
  const [prefill, setPrefill] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startOver, setStartOver] = useState(false);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<null | { kind: "publish"; checks: PublishCheck[] } | { kind: "unpublish" } | { kind: "rename" }>(null);
  const [newHandle, setNewHandle] = useState("");

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 3200); };

  const load = useCallback(async () => {
    const r = await call<{ portfolio: PortfolioDTO | null; profile: Profile }>("/api/portfolio");
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setPortfolio(r.data.portfolio);
    setProfile(r.data.profile);
    if (!r.data.portfolio) setHandle((h) => h || slug(r.data.profile?.name ?? "") || "");
    else {
      setNewHandle(r.data.portfolio.handle);
      const v = await call<{ versions: VersionRow[] }>("/api/portfolio/versions");
      if (v.ok) setVersions(v.data.versions);
    }
    const t = await call<{ templates: SavedTemplate[] }>("/api/portfolio/templates");
    if (t.ok) setSaved(t.data.templates);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (params.get("startOver") === "1") setStartOver(true); }, [params]);

  useEffect(() => {
    if (step !== 1) return;
    if (!handle) { setCheck(null); return; }
    const t = setTimeout(async () => {
      const r = await call<HandleCheck>(`/api/portfolio/handle?h=${encodeURIComponent(handle)}`);
      if (r.ok) setCheck(r.data);
    }, 300);
    return () => clearTimeout(t);
  }, [handle, step]);

  const create = async (choice: TemplateChoice) => {
    setBusy(true);
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio", { method: "POST", body: JSON.stringify({ handle, prefill, ...choice }) });
    setBusy(false);
    if (!r.ok) { flash(r.error); if (r.status === 409) setStep(1); return; }
    router.push("/portfolio/edit");
  };
  const reset = async (choice: TemplateChoice) => {
    setBusy(true);
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/reset", { method: "POST", body: JSON.stringify(choice) });
    setBusy(false);
    if (!r.ok) { flash(r.error); return; }
    router.push("/portfolio/edit");
  };
  const deleteSaved = async (id: string) => {
    const r = await call(`/api/portfolio/templates/${id}`, { method: "DELETE" });
    if (r.ok) setSaved((s) => s.filter((x) => x.id !== id));
    else flash(r.error);
  };
  const copy = () => {
    if (!portfolio) return;
    const url = `${window.location.origin}/p/${portfolio.handle}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    flash(`Link copied: ${url.replace(/^https?:\/\//, "")}`);
  };
  const publish = async () => {
    setBusy(true);
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/publish", { method: "POST" });
    setBusy(false);
    setDialog(null);
    if (!r.ok) { flash(r.error); return; }
    setPortfolio(r.data.portfolio);
    flash("Published. Your portfolio is live.");
    void load();
  };
  const settings = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/settings", { method: "PATCH", body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { flash(r.error); return false; }
    setPortfolio(r.data.portfolio);
    flash(done);
    return true;
  };

  if (loading) return <div className="pe" style={{ display: "grid", placeItems: "center", minHeight: 400 }}><Loader2 className="animate-spin" /></div>;
  if (error) return <div className="pe" style={{ padding: 32 }}><div className="pe-note warn">{error}</div></div>;

  const header = (title: string, sub: string, right?: React.ReactNode) => (
    <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "22px 32px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h1>
        <p style={{ margin: "2px 0 0", color: "var(--text2)" }}>{sub}</p>
      </div>
      {right}
    </header>
  );
  const toastEl = toast && <div className="pe-toast" role="status"><Check size={14} color="#48ED85" />{toast}</div>;

  /* ---------- choosing a template (first time, or starting over) ---------- */
  if ((!portfolio && step === 2) || (portfolio && startOver)) {
    return (
      <div className="pe">
        {header(portfolio ? "Start over from a template" : "Choose a starting point", "Templates are only a head start. Every section, block, colour and font stays editable.",
          <button type="button" className="pe-btn ghost" onClick={() => (portfolio ? (setStartOver(false), router.replace("/socialork/portfolio")) : setStep(1))}><ChevronLeft size={14} />Back</button>)}
        <div style={{ padding: "24px 32px 48px", maxWidth: 1280 }}>
          {portfolio && <div className="pe-note info" style={{ marginBottom: 18 }}>Your current design is kept in version history, and your live site stays as it is until you publish the new one.</div>}
          <TemplateGallery saved={saved} busy={busy} cta={portfolio ? "Start from this" : "Use template"} onChoose={(c) => void (portfolio ? reset(c) : create(c))} onDeleteSaved={(id) => void deleteSaved(id)} />
        </div>
        {toastEl}
      </div>
    );
  }

  /* ---------- first time ---------- */
  if (!portfolio) {
    if (step === 1) {
      const ok = check?.status === "ok";
      return (
        <div className="pe">
          {header("Claim your address", "This is the link you’ll put in your bio, CV and email signature.")}
          <div style={{ maxWidth: 560, padding: "40px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
            <div>
              <label htmlFor="handle-in" className="pe-lbl" style={{ display: "block", marginBottom: 6 }}>Address</label>
              <div style={{ display: "flex", alignItems: "center", height: 44, border: `1px solid ${ok ? "rgba(72,237,133,.45)" : check && check.status !== "ok" ? "oklch(.73 .17 25 / .6)" : "var(--line2)"}`, borderRadius: 10, background: "var(--panel)", overflow: "hidden" }} className="pe-mono">
                <span style={{ padding: "0 4px 0 14px", color: "var(--text3)", whiteSpace: "nowrap" }}>/p/</span>
                <input id="handle-in" value={handle} spellCheck={false} aria-describedby="handle-msg" onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} style={{ flex: 1, minWidth: 0, height: "100%", border: 0, background: "transparent", padding: "0 12px 0 0", outline: "none", fontSize: 14 }} />
              </div>
              <p id="handle-msg" role="status" style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: ok ? "var(--accent)" : check ? "var(--red)" : "var(--text3)" }}>
                {ok ? <Check size={14} /> : check ? <AlertTriangle size={14} /> : null}{check ? (ok ? `/p/${handle} is available` : check.message) : "Lowercase letters, numbers and hyphens."}
              </p>
              {check && !ok && check.suggestions.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{check.suggestions.map((s) => <button type="button" key={s} className="pe-btn pe-mono" style={{ height: 28, fontSize: 12 }} onClick={() => setHandle(s)}>{s}</button>)}</div>}
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text3)" }}>You can change it later; the old link keeps redirecting for 30 days.</p>
            </div>
            <div style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 600 }}>Use my name from my SocialOrk profile</span><span style={{ display: "block", fontSize: 12, color: "var(--text3)" }}>Templates swap their sample name for yours. Change anything afterwards.</span></span>
                <button type="button" role="switch" aria-checked={prefill} aria-label="Use my name from my profile" className="pe-switch" onClick={() => setPrefill(!prefill)}><span /></button>
              </div>
              {prefill && profile?.name && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span className="pe-chip muted">Name · {profile.name}</span>{profile.headline && <span className="pe-chip muted">Headline · {profile.headline}</span>}</div>}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="pe-btn ghost lg" onClick={() => setStep(0)}>Cancel</button>
              <button type="button" className="pe-btn pri lg" disabled={!ok} onClick={() => setStep(2)}>Continue</button>
            </div>
          </div>
          {toastEl}
        </div>
      );
    }
    const fan = [TEMPLATES[2], TEMPLATES[3], TEMPLATES[4]].map((t) => t.make());
    return (
      <div className="pe">
        {header("Portfolio", "Your public, professional website. Separate from your social channels and fully designed by you.")}
        <div style={{ padding: "48px 32px 64px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 28 }}>
          <div aria-hidden="true" style={{ position: "relative", width: "min(560px,100%)", aspectRatio: "14 / 9" }}>
            {[{ left: "4%", top: "6%", rot: -7, d: fan[0] }, { right: "4%", top: "6%", rot: 7, d: fan[2] }, { left: "29%", top: 0, rot: 0, d: fan[1] }].map((f, i) => (
              <div key={i} style={{ position: "absolute", left: f.left, right: f.right, top: f.top, width: "42%", aspectRatio: "3 / 4", borderRadius: 10, overflow: "hidden", border: "1px solid var(--line2)", transform: `rotate(${f.rot}deg)`, boxShadow: "0 20px 50px rgba(0,0,0,.5)" }}>
                <PortfolioThumb doc={f.d} scope={`fan${i}`} />
              </div>
            ))}
          </div>
          <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.025em", textWrap: "balance" }}>A website that looks like you, not like everyone else</h2>
            <p style={{ margin: 0, color: "var(--text2)", fontSize: 15, lineHeight: 1.6 }}>Design your own professional site block by block: projects, experience, skills, the way you want them. Nothing goes public until you publish.</p>
          </div>
          <button type="button" className="pe-btn pri lg" onClick={() => setStep(1)}><Plus size={15} />Create your portfolio</button>
          <ol style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px,100%),1fr))", gap: 12, width: "min(820px,100%)", textAlign: "left" }}>
            {[["Pick a starting point", "A blank canvas, or one of eight templates you can change completely."], ["Design every block", "Layout, type, colour and spacing, tuned separately for desktop, tablet and phone."], ["Publish when it’s ready", "Drafts save as you work and stay private. Your link only updates when you publish."]].map(([a, b], i) => (
              <li key={a} style={{ padding: 16, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}><div className="pe-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>0{i + 1}</div><div style={{ fontWeight: 600, marginBottom: 4 }}>{a}</div><div style={{ color: "var(--text2)", fontSize: 12.5 }}>{b}</div></li>
            ))}
          </ol>
        </div>
        {toastEl}
      </div>
    );
  }

  /* ---------- existing portfolio ---------- */
  const live = portfolio.status === "PUBLISHED";
  const status = live ? { label: "Published", cls: "ok" } : portfolio.status === "UNPUBLISHED" ? { label: "Unpublished", cls: "off" } : { label: "Draft · never published", cls: "muted" };
  return (
    <div className="pe">
      {header("Portfolio", "Your public, professional website. Separate from your social channels and fully designed by you.",
        live ? <a className="pe-btn" href={`/p/${portfolio.handle}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />View live site</a> : undefined)}
      <div style={{ padding: "28px 32px 48px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1280 }}>
        <section aria-label="Your portfolio" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(360px,100%),1fr))", overflow: "hidden" }}>
          <div style={{ padding: 20, background: "#0E0E12", borderRight: "1px solid var(--line)" }}>
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--line2)" }}>
              <div style={{ height: 26, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", background: "var(--panel2)", borderBottom: "1px solid var(--line)" }}>
                {[0, 1, 2].map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#3A3A44" }} />)}
                <span className="pe-mono" style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "var(--text3)" }}>/p/{portfolio.handle}</span>
              </div>
              <div style={{ aspectRatio: "16 / 10" }}><PortfolioThumb doc={portfolio.doc} scope="dash" /></div>
            </div>
          </div>
          <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className={`pe-chip ${status.cls}`}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />{status.label}</span>
              {live && portfolio.hasUnpublishedChanges && <span className="pe-chip warn">Unpublished changes</span>}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>{portfolio.doc.seo.title || portfolio.doc.owner.name}</h2>
              <p style={{ margin: "4px 0 0", color: "var(--text2)" }}>{portfolio.publishedAt ? `Last published ${new Date(portfolio.publishedAt).toLocaleString()}` : "Not published yet"} · draft edited {new Date(portfolio.updatedAt).toLocaleString()}</p>
            </div>
            <div>
              <div className="pe-lbl" style={{ marginBottom: 6 }}>Public address</div>
              <div style={{ display: "flex", gap: 6 }}>
                <div className="pe-mono" style={{ flex: 1, minWidth: 0, height: 36, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid var(--line2)", borderRadius: 8, background: "var(--bg)", fontSize: 12.5, overflow: "hidden", whiteSpace: "nowrap" }}>
                  <Globe size={14} color={live ? "#48ED85" : "#7C7C87"} style={{ flex: "none" }} /><span style={{ color: "var(--text3)" }}>/p/</span>{portfolio.handle}
                </div>
                <button type="button" className="pe-btn" style={{ height: 36 }} onClick={copy}><Copy size={14} />Copy</button>
              </div>
              {portfolio.status === "UNPUBLISHED" && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text3)" }}>Not public. Visitors to this link see a “not public right now” page.</p>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
              <Link className="pe-btn pri lg" href="/portfolio/edit"><PenLine size={15} />Open editor</Link>
              <Link className="pe-btn lg" href="/portfolio/preview"><Play size={14} />Preview draft</Link>
              {(!live || portfolio.hasUnpublishedChanges) && <button type="button" className="pe-btn lg" style={{ borderColor: "rgba(72,237,133,.35)", color: "var(--accent)" }} disabled={busy} onClick={async () => { const r = await call<{ checks: PublishCheck[] }>("/api/portfolio/publish"); setDialog({ kind: "publish", checks: r.ok ? r.data.checks : [] }); }}>{portfolio.status === "UNPUBLISHED" ? "Publish again" : live ? "Publish changes" : "Publish"}</button>}
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px,100%),1fr))", gap: 20, alignItems: "start" }}>
          <section aria-labelledby="rev-h" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 20px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <h3 id="rev-h" style={{ margin: 0, fontSize: 14, fontWeight: 600, flex: 1 }}>Publishing &amp; versions</h3>
              <Link className="pe-btn ghost" style={{ height: 28 }} href="/portfolio/edit"><History size={14} />Open history in editor</Link>
            </div>
            {versions.slice(0, 5).map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center", flex: "none", background: v.kind === "PUBLISHED" ? "var(--accentSoft)" : "var(--panel2)", color: v.kind === "PUBLISHED" ? "var(--accent)" : "var(--text2)" }}>{v.kind === "PUBLISHED" ? <Check size={14} /> : <History size={14} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600, fontSize: 12.5 }}>{v.label || KIND_LABEL[v.kind] || v.kind}</span><span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>{new Date(v.createdAt).toLocaleString()}</span></span>
                {v.live && <span className="pe-chip ok">Live</span>}
              </div>
            ))}
            {!versions.length && <p style={{ color: "var(--text3)", fontSize: 12.5 }}>No versions yet.</p>}
          </section>

          <section aria-labelledby="vis-h" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 id="vis-h" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Visibility, address &amp; search</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 600, fontSize: 12.5 }}>Allow search engines to index</span><span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>Off means your page is still public by link, just not listed in search results.</span></span>
              <button type="button" role="switch" aria-checked={portfolio.searchIndexing} aria-label="Allow search engines to index" className="pe-switch" disabled={busy} onClick={() => void settings({ searchIndexing: !portfolio.searchIndexing }, portfolio.searchIndexing ? "Search engines will skip your page." : "Search engines may now list your page.")}><span /></button>
            </div>
            <div style={{ padding: 14, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Search &amp; link preview</div>
              <div style={{ fontSize: 15, color: "oklch(.78 .11 245)", fontWeight: 500 }}>{portfolio.doc.seo.title || portfolio.doc.owner.name}</div>
              <div className="pe-mono" style={{ fontSize: 11.5, color: "var(--accent)", margin: "2px 0 4px" }}>/p/{portfolio.handle}</div>
              <div style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.5 }}>{portfolio.doc.seo.desc || "Add a description in the editor: Page › Content."}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <button type="button" className="pe-btn" onClick={() => { setNewHandle(portfolio.handle); setDialog({ kind: "rename" }); }}>Change address</button>
              {live && <button type="button" className="pe-btn" style={{ color: "var(--red)" }} onClick={() => setDialog({ kind: "unpublish" })}>Unpublish portfolio</button>}
              <button type="button" className="pe-btn ghost" onClick={() => setStartOver(true)}>Start over from a template</button>
            </div>
          </section>
        </div>
        <p style={{ margin: 0, color: "var(--text3)", fontSize: 12 }}>Each account has one portfolio. Starting over keeps your current design in version history.</p>
      </div>

      {dialog && (
        <>
          <div className="pe-backdrop" onClick={() => setDialog(null)} />
          <div className="pe-modal" role="dialog" aria-modal="true" aria-labelledby="dash-dlg">
            {dialog.kind === "publish" && (
              <>
                <div className="pe-modal-pad">
                  <h2 id="dash-dlg">{live ? "Publish your changes?" : "Publish your portfolio?"}</h2>
                  <p>Everyone visiting <span className="pe-mono" style={{ color: "var(--text)" }}>/p/{portfolio.handle}</span> will see your current draft.</p>
                  {dialog.checks.map((c, i) => <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--text2)" }}>{c.level === "ok" ? <Check size={15} color="#48ED85" /> : <AlertTriangle size={15} color={c.level === "block" ? "oklch(.73 .17 25)" : "oklch(.83 .13 80)"} />}{c.text}</div>)}
                </div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="pe-btn pri lg" disabled={busy || dialog.checks.some((c) => c.level === "block")} onClick={() => void publish()}>Publish</button></div>
              </>
            )}
            {dialog.kind === "unpublish" && (
              <>
                <div className="pe-modal-pad"><h2 id="dash-dlg">Unpublish your portfolio?</h2><p>Visitors will see a “not public right now” page. Your draft, design and versions are kept.</p></div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="pe-btn danger lg" disabled={busy} onClick={async () => { const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/unpublish", { method: "POST" }); setDialog(null); if (r.ok) { setPortfolio(r.data.portfolio); flash("Unpublished."); } else flash(r.error); }}>Unpublish</button></div>
              </>
            )}
            {dialog.kind === "rename" && (
              <form onSubmit={async (e) => { e.preventDefault(); if (await settings({ handle: newHandle }, "Address changed. The old link redirects for 30 days.")) setDialog(null); }}>
                <div className="pe-modal-pad">
                  <h2 id="dash-dlg">Change your address</h2>
                  <p>The old address keeps redirecting here for 30 days.</p>
                  <div className="pe-mono" style={{ display: "flex", alignItems: "center", height: 40, border: "1px solid var(--line2)", borderRadius: 8, background: "var(--bg)" }}>
                    <span style={{ padding: "0 4px 0 12px", color: "var(--text3)" }}>/p/</span>
                    <input autoFocus aria-label="New address" value={newHandle} onChange={(e) => setNewHandle(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} style={{ flex: 1, height: "100%", border: 0, background: "transparent", outline: "none" }} />
                  </div>
                </div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setDialog(null)}><X size={14} />Cancel</button><button type="submit" className="pe-btn pri lg" disabled={busy || !newHandle || newHandle === portfolio.handle}>Save address</button></div>
              </form>
            )}
          </div>
        </>
      )}
      {toastEl}
    </div>
  );
}
