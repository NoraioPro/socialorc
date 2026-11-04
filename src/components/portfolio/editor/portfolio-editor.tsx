"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as RMouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowDown, ArrowUp, Bookmark, Check, ChevronLeft, ChevronRight, Copy, CornerUpLeft, ExternalLink, Eye, EyeOff, FileText,
  Globe, History, Keyboard, Layers, ListCollapse, ListTree, MoreHorizontal, Play, Plus, Redo2, RefreshCw, Search, SlidersHorizontal, Trash2, Undo2, WifiOff, X,
} from "lucide-react";
import { COMPONENT_ICON, VIEWPORT_ICON } from "./icons";
import { InspectorGroups } from "./fields";
import { nodeGroups, pageGroups, type InspectorApi, type InspectorTab } from "./inspector";
import { MarkdownEditor } from "./markdown-editor";
import { uploadImage } from "./upload";
import { PortfolioView } from "../render";
import {
  checkDrop, clone, COMPONENTS, countDescendants, countNodes, dropNode, duplicateNode, type DropPosition, insertNode, isBox, locate, makeNode,
  moveSibling, nodeName, pathTo, removeNode, truncate, walk,
} from "@/lib/portfolio/model";
import { newComponent, previewSample } from "@/lib/portfolio/samples";
import { NODE_TYPES, type NodeType, type PortfolioDoc, type Viewport, VIEWPORT_LABEL, VIEWPORT_WIDTH } from "@/lib/portfolio/types";
import type { PortfolioDTO } from "@/lib/portfolio/server";
import type { PublishCheck } from "@/lib/portfolio/checks";

type SaveState = "saved" | "unsaved" | "saving" | "offline" | "failed";
type Meta = Omit<PortfolioDTO, "doc" | "revision">;
interface VersionRow { id: string; kind: string; label: string | null; createdAt: string; live: boolean }
type Modal =
  | { kind: "publish"; checks: PublishCheck[]; error?: string }
  | { kind: "publishing" }
  | { kind: "published" }
  | { kind: "failed"; error: string }
  | { kind: "delete"; id: string }
  | { kind: "unpublish" }
  | { kind: "keys" }
  | { kind: "restore" }
  | { kind: "conflict"; server: PortfolioDTO }
  | { kind: "saveTemplate"; name: string };

const LOCAL_KEY = (id: string) => `socialork:portfolio-draft:${id}`;
const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const KIND_LABEL: Record<string, string> = { CREATED: "Created", AUTOSAVE: "Autosaved", PUBLISHED: "Published", NAMED: "Named version", BEFORE_RESTORE: "Saved before a change" };
const KIND_DOT: Record<string, string> = { PUBLISHED: "#48ED85", NAMED: "oklch(.78 .11 245)", CREATED: "#A6A6B0", BEFORE_RESTORE: "oklch(.83 .13 80)", AUTOSAVE: "#55555F" };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: data as T };
    return { ok: false, status: res.status, error: (data && typeof data.error === "string" ? data.error : null) ?? `Request failed (${res.status})`, data };
  } catch {
    return { ok: false, status: 0, error: "You appear to be offline.", data: null };
  }
}

export function PortfolioEditor({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<PortfolioDoc | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState("");
  const docRef = useRef<PortfolioDoc | null>(null);
  const revisionRef = useRef(0);
  const skipSave = useRef(true);
  const [save, setSave] = useState<SaveState>("saved");
  const [savedAt, setSavedAt] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [vp, setVp] = useState<Viewport>("desktop");
  const [leftTab, setLeftTab] = useState<"layers" | "components">("layers");
  const [insTab, setInsTab] = useState<InspectorTab>("content");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [layerQ, setLayerQ] = useState("");
  const [compQ, setCompQ] = useState("");
  const [compHover, setCompHover] = useState<NodeType>("section");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const hist = useRef<string[]>([]);
  const fut = useRef<string[]>([]);
  const lastKey = useRef<string | undefined>(undefined);
  const lastAt = useRef(0);
  const [stacks, setStacks] = useState({ undo: 0, redo: 0 });
  const bump = useCallback(() => setStacks({ undo: hist.current.length, redo: fut.current.length }), []);
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{ text: string; action?: string; run?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [revOpen, setRevOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [revView, setRevView] = useState<{ id: string; title: string; doc: PortfolioDoc } | null>(null);
  const dragRef = useRef<{ id?: string; type: NodeType; isNew?: boolean } | null>(null);
  const [drag, setDrag] = useState<{ over: string; pos: DropPosition; ok: boolean; msg: string; draggingId?: string } | null>(null);
  const [mdId, setMdId] = useState<string | null>(null);
  const [ov, setOv] = useState<{ top: number; left: number; w: number; h: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cw, setCw] = useState(900);
  const [canvasKey, setCanvasKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hovRef = useRef<Element | null>(null);
  const inlineRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef<Promise<boolean> | null>(null);

  const showToast = useCallback((text: string, action?: string, run?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ text, action, run });
    toastTimer.current = setTimeout(() => setToast(null), action ? 6000 : 3200);
  }, []);

  /* ------------------------------------------------------------ load ---- */
  const applyServer = useCallback((p: PortfolioDTO, opts: { keepHistory?: boolean } = {}) => {
    const { doc: d, revision, ...m } = p;
    skipSave.current = true;
    revisionRef.current = revision;
    docRef.current = d;
    setDoc(d);
    setMeta(m);
    setSave("saved");
    if (!opts.keepHistory) { hist.current = []; fut.current = []; setStacks({ undo: 0, redo: 0 }); }
    setCanvasKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.innerWidth < 760) { setVp("mobile"); setRightOpen(false); }
      else if (window.innerWidth < 1100) setVp("tablet");
    }
    void (async () => {
      const r = await call<{ portfolio: PortfolioDTO | null }>("/api/portfolio");
      if (!r.ok) { setLoadError(r.error); return; }
      if (!r.data.portfolio) { router.replace("/socialork/portfolio"); return; }
      const p = r.data.portfolio;
      applyServer(p);
      try {
        const local = window.localStorage.getItem(LOCAL_KEY(p.id));
        if (local) {
          const saved = JSON.parse(local) as { revision: number; doc: PortfolioDoc };
          if (saved.revision === p.revision && JSON.stringify(saved.doc) !== JSON.stringify(p.doc)) {
            docRef.current = saved.doc;
            setDoc(saved.doc);
            skipSave.current = false;
            showToast("Restored changes that hadn’t reached the server yet.");
          } else window.localStorage.removeItem(LOCAL_KEY(p.id));
        }
      } catch { /* storage unavailable: nothing to restore */ }
    })();
  }, [applyServer, router, showToast]);

  /* ------------------------------------------------------------ save ---- */
  const portfolioId = meta?.id;
  const persistLocal = useCallback(() => {
    if (!portfolioId || !docRef.current) return;
    try { window.localStorage.setItem(LOCAL_KEY(portfolioId), JSON.stringify({ revision: revisionRef.current, doc: docRef.current })); } catch { /* ignore */ }
  }, [portfolioId]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    const sending = docRef.current;
    if (!sending || !portfolioId) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) { setSave("offline"); persistLocal(); return false; }
    setSave("saving");
    const p = (async () => {
      const r = await call<{ revision: number; savedAt: string }>("/api/portfolio/draft", { method: "PATCH", body: JSON.stringify({ doc: sending, baseRevision: revisionRef.current }) });
      if (r.ok) {
        revisionRef.current = r.data.revision;
        setSavedAt(new Date(r.data.savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
        setMeta((m) => (m && m.status === "PUBLISHED" && !m.hasUnpublishedChanges ? { ...m, hasUnpublishedChanges: true } : m));
        if (docRef.current === sending) {
          setSave("saved");
          try { window.localStorage.removeItem(LOCAL_KEY(portfolioId)); } catch { /* ignore */ }
        } else setSave("unsaved");
        return true;
      }
      persistLocal();
      if (r.status === 409 && r.data?.portfolio) { setSave("failed"); setModal({ kind: "conflict", server: r.data.portfolio as unknown as PortfolioDTO }); return false; }
      if (r.status === 0) { setSave("offline"); return false; }
      setSave("failed");
      showToast(r.error);
      return false;
    })();
    savingRef.current = p;
    const ok = await p;
    savingRef.current = null;
    if (ok && docRef.current !== sending) void saveNow();
    return ok;
  }, [portfolioId, persistLocal, showToast]);

  // Autosave runs off the document only. saveNow is read through a ref so a new
  // save function (it changes when meta changes) never re-arms the timer by itself.
  const saveNowRef = useRef(saveNow);
  useEffect(() => { saveNowRef.current = saveNow; }, [saveNow]);
  useEffect(() => {
    if (!doc) return;
    if (skipSave.current) { skipSave.current = false; return; }
    setSave((s) => (s === "saving" ? s : "unsaved"));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveNowRef.current(); }, 700);
  }, [doc]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  useEffect(() => {
    const online = () => { if (save === "offline") void saveNow(); };
    const before = (e: BeforeUnloadEvent) => { if (save !== "saved") { persistLocal(); e.preventDefault(); } };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", before);
    return () => { window.removeEventListener("online", online); window.removeEventListener("beforeunload", before); };
  }, [save, saveNow, persistLocal]);

  const flushSave = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (save === "saved" && !savingRef.current) return true;
    return saveNow();
  }, [save, saveNow]);

  /* ------------------------------------------------------------ edit ---- */
  const commit = useCallback((next: PortfolioDoc, label: string, key?: string) => {
    const prev = docRef.current;
    if (!prev || revView) return;
    const now = Date.now();
    const coalesce = !!key && key === lastKey.current && now - lastAt.current < 900;
    lastKey.current = key;
    lastAt.current = now;
    if (!coalesce) {
      hist.current = [...hist.current.slice(-79), JSON.stringify(prev)];
      fut.current = [];
      setChangeLog((l) => [label, ...l].slice(0, 30));
    }
    docRef.current = next;
    setDoc(next);
    bump();
  }, [revView, bump]);

  const edit = useCallback((fn: (d: PortfolioDoc) => void, label: string, key?: string) => {
    if (!docRef.current) return;
    const next = clone(docRef.current);
    fn(next);
    commit(next, label, key);
  }, [commit]);

  const undo = useCallback(() => {
    if (!hist.current.length || !docRef.current || revView) return;
    fut.current = [JSON.stringify(docRef.current), ...fut.current];
    const prev = JSON.parse(hist.current.pop()!) as PortfolioDoc;
    lastKey.current = undefined;
    docRef.current = prev;
    setDoc(prev);
    setSel((s) => (s && locate(prev, s) ? s : null));
    bump();
  }, [revView, bump]);
  const redo = useCallback(() => {
    if (!fut.current.length || !docRef.current) return;
    hist.current = [...hist.current, JSON.stringify(docRef.current)];
    const next = JSON.parse(fut.current.shift()!) as PortfolioDoc;
    lastKey.current = undefined;
    docRef.current = next;
    setDoc(next);
    setSel((s) => (s && locate(next, s) ? s : null));
    bump();
  }, [bump]);

  const insert = useCallback((type: NodeType, node = newComponent(type, userEmail)) => {
    if (!docRef.current) return;
    const r = insertNode(docRef.current, node, sel, (kid) => makeNode("section", { label: "New section", anchor: "" }, {}, [kid]));
    commit(r.doc, `Added ${COMPONENTS[type].label.toLowerCase()}`);
    setSel(node.id);
    setInsTab("content");
    if (window.innerWidth < 760) setLeftOpen(false);
    showToast(`Added ${COMPONENTS[type].label} to ${r.target}`);
  }, [commit, sel, showToast, userEmail]);

  const move = useCallback((id: string, d: number) => { if (docRef.current) { const l = locate(docRef.current, id); if (l) commit(moveSibling(docRef.current, id, d), `Moved ${nodeName(l.n)}`); } }, [commit]);
  const dup = useCallback((id: string) => {
    if (!docRef.current) return;
    const l = locate(docRef.current, id);
    const r = duplicateNode(docRef.current, id);
    if (!l || !r.newId) return;
    commit(r.doc, `Duplicated ${nodeName(l.n)}`);
    setSel(r.newId);
    showToast(`Duplicated “${truncate(nodeName(l.n), 28)}”`);
  }, [commit, showToast]);
  const del = useCallback((id: string, force = false) => {
    if (!docRef.current) return;
    const l = locate(docRef.current, id);
    if (!l) return;
    if (!force && countDescendants(l.n) >= 3) { setModal({ kind: "delete", id }); return; }
    commit(removeNode(docRef.current, id), `Deleted ${nodeName(l.n)}`);
    setSel(l.parent?.id ?? null);
    setModal(null);
    showToast(`Deleted “${truncate(nodeName(l.n), 28)}”`, "Undo", undo);
  }, [commit, showToast, undo]);

  const openMarkdown = useCallback((id: string) => { setSel(id); setMdId(id); }, []);
  const openComponents = useCallback((focus = false) => {
    setLeftTab("components");
    setLeftOpen(true);
    if (window.innerWidth < 760) setRightOpen(false);
    if (focus) setTimeout(() => searchRef.current?.focus(), 60);
  }, []);
  const upload = useCallback((file: File, apply: (url: string) => void) => {
    setUploading(true);
    uploadImage(file, userId).then((url) => { apply(url); showToast("Image uploaded."); }).catch((e: unknown) => showToast(e instanceof Error ? e.message : "Upload failed.")).finally(() => setUploading(false));
  }, [showToast, userId]);

  /* --------------------------------------------------------- canvas ---- */
  const viewDoc = revView?.doc ?? doc;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const vpW = VIEWPORT_WIDTH[vp];
  const pad = cw < 600 ? 12 : 28;
  const zoom = Math.max(0.3, Math.min(1, Math.floor(((cw - pad * 2) / vpW) * 100) / 100));

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!sel || revView || !wrap) { setOv(null); return; }
    const measure = () => {
      const el = wrap.querySelector(`[data-nid="${sel}"]`);
      if (!el) { setOv(null); return; }
      const a = el.getBoundingClientRect(), b = wrap.getBoundingClientRect();
      setOv((o) => {
        const n = { top: Math.round(a.top - b.top), left: Math.round(a.left - b.left), w: Math.round(a.width), h: Math.round(a.height) };
        return o && o.top === n.top && o.left === n.left && o.w === n.w && o.h === n.h ? o : n;
      });
    };
    measure();
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [sel, doc, vp, zoom, revView, canvasKey]);

  const onCanvasClick = (e: RMouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a")) e.preventDefault();
    if (inlineRef.current || revView) return;
    const el = target.closest("[data-nid]");
    setSel(el ? el.getAttribute("data-nid") : null);
    setMenu(false);
  };
  const onCanvasDouble = (e: RMouseEvent) => {
    if (revView || !docRef.current) return;
    const el = (e.target as HTMLElement).closest("[data-nid]") as HTMLElement | null;
    if (!el) return;
    const id = el.getAttribute("data-nid")!;
    const l = locate(docRef.current, id);
    if (!l) return;
    if (l.n.type === "text") { openMarkdown(id); return; }
    if (l.n.type !== "heading" && l.n.type !== "button") return;
    inlineRef.current = id;
    el.setAttribute("contenteditable", "plaintext-only");
    if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
    el.focus();
    try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r); } catch { /* ignore */ }
    const before = el.innerText;
    const type = l.n.type;
    const kd = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ev.stopPropagation(); el.blur(); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); el.innerText = before; el.blur(); }
    };
    const done = () => {
      el.removeEventListener("blur", done);
      el.removeEventListener("keydown", kd);
      el.removeAttribute("contenteditable");
      const txt = el.innerText.replace(/\n{3,}/g, "\n\n").trim();
      inlineRef.current = null;
      setCanvasKey((k) => k + 1); // the browser edited React-owned text nodes: remount the canvas
      if (txt && txt !== before.trim()) edit((d) => { const m = locate(d, id); if (m) { if (type === "button") m.n.props.label = txt; else m.n.props.text = txt; } }, `Edited ${COMPONENTS[type].label.toLowerCase()} on the canvas`);
    };
    el.addEventListener("blur", done);
    el.addEventListener("keydown", kd);
    setSel(id);
  };
  const onCanvasOver = (e: RMouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-nid]");
    if (hovRef.current && hovRef.current !== el) hovRef.current.classList.remove("pf-hov");
    if (el && el.getAttribute("data-nid") !== sel) el.classList.add("pf-hov");
    hovRef.current = el;
  };
  const onCanvasLeave = () => { hovRef.current?.classList.remove("pf-hov"); hovRef.current = null; };

  /* ------------------------------------------------------- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mdId) return;
      const tg = e.target as HTMLElement | null;
      const typing = !!tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === "Escape" && menu) { setMenu(false); return; }
      if (modal) { if (e.key === "Escape" && modal.kind !== "publishing") setModal(null); return; }
      if (mod && k === "z" && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === "s") { e.preventDefault(); void flushSave(); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); openComponents(true); return; }
      if (!sel || revView) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); del(sel); }
      else if (mod && k === "d") { e.preventDefault(); dup(sel); }
      else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(sel, -1); }
      else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(sel, 1); }
      else if (e.key === "Escape" && docRef.current) { const p = pathTo(docRef.current, sel); setSel(p.length > 1 ? p[p.length - 2].id : null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, modal, menu, mdId, revView, undo, redo, del, dup, move, openComponents, flushSave]);

  /* ------------------------------------------------ versions & publish ---- */
  const loadVersions = useCallback(async () => {
    const r = await call<{ versions: VersionRow[] }>("/api/portfolio/versions");
    if (r.ok) setVersions(r.data.versions);
  }, []);
  const openHistory = () => {
    setRevOpen(true);
    setRightOpen(true);
    if (window.innerWidth < 760) setLeftOpen(false);
    setMenu(false);
    void loadVersions();
  };
  const viewVersion = async (v: VersionRow) => {
    const r = await call<{ version: { doc: PortfolioDoc } }>(`/api/portfolio/versions/${v.id}`);
    if (!r.ok) { showToast(r.error); return; }
    setSel(null);
    setRevView({ id: v.id, title: `${v.label || KIND_LABEL[v.kind] || v.kind} · ${fmtTime(v.createdAt)}`, doc: r.data.version.doc });
  };
  const restoreVersion = async () => {
    if (!revView) return;
    await flushSave();
    const r = await call<{ portfolio: PortfolioDTO }>(`/api/portfolio/versions/${revView.id}/restore`, { method: "POST" });
    setModal(null);
    if (!r.ok) { showToast(r.error); return; }
    const title = revView.title;
    setRevView(null);
    applyServer(r.data.portfolio);
    setChangeLog((l) => [`Restored the version from ${title}`, ...l]);
    void loadVersions();
    showToast("Version restored. Publish to make it live.");
  };
  const openPublish = async () => {
    setMenu(false);
    await flushSave();
    const r = await call<{ checks: PublishCheck[] }>("/api/portfolio/publish");
    setModal({ kind: "publish", checks: r.ok ? r.data.checks : [] });
  };
  const doPublish = async () => {
    setModal({ kind: "publishing" });
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/publish", { method: "POST" });
    if (r.ok) {
      const { doc: _d, revision: _r, ...m } = r.data.portfolio;
      void _d; void _r;
      setMeta(m);
      setChangeLog([]);
      setModal({ kind: "published" });
      if (versions) void loadVersions();
    } else if (r.status === 422) setModal({ kind: "publish", checks: (r.data?.checks as PublishCheck[]) ?? [], error: r.error });
    else setModal({ kind: "failed", error: r.status === 0 ? "You lost your connection while publishing." : r.error });
  };
  const unpublish = async () => {
    const r = await call<{ portfolio: PortfolioDTO }>("/api/portfolio/unpublish", { method: "POST" });
    setModal(null);
    if (!r.ok) { showToast(r.error); return; }
    const { doc: _d, revision: _r, ...m } = r.data.portfolio;
    void _d; void _r;
    setMeta(m);
    showToast("Unpublished. Visitors now see “not public right now”.");
  };
  const saveTemplate = async (name: string) => {
    await flushSave();
    const r = await call("/api/portfolio/templates", { method: "POST", body: JSON.stringify({ name }) });
    setModal(null);
    showToast(r.ok ? `Saved “${name}” to your templates.` : r.error);
  };
  const copyLink = () => {
    if (!meta) return;
    const url = `${window.location.origin}/p/${meta.handle}`;
    navigator.clipboard?.writeText(url).catch(() => undefined);
    showToast(`Link copied: ${url.replace(/^https?:\/\//, "")}`);
    setMenu(false);
  };
  const goPreview = async () => { await flushSave(); router.push("/portfolio/preview"); };

  /* -------------------------------------------------------- derived ---- */
  const loc = doc && sel && !revView ? locate(doc, sel) : null;
  const inspectorApi: InspectorApi | null = doc && meta ? { doc, vp, tab: insTab, handle: meta.handle, uploading, edit, setVp, openMarkdown, openComponents: () => openComponents(), upload } : null;
  // The setters inside these fields read refs only when the user acts on them, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const groups = inspectorApi ? (loc ? nodeGroups(inspectorApi, loc) : pageGroups(inspectorApi)) : [];

  const layerRows = useMemo(() => {
    if (!viewDoc) return { rows: [] as { n: PortfolioDoc["root"][number]; depth: number; name: string }[], total: 0 };
    const q = layerQ.trim().toLowerCase();
    const rows: { n: PortfolioDoc["root"][number]; depth: number; name: string }[] = [];
    const rec = (list: PortfolioDoc["root"], depth: number) => list.forEach((n) => {
      const name = nodeName(n);
      if (!q || name.toLowerCase().includes(q) || COMPONENTS[n.type].label.toLowerCase().includes(q)) rows.push({ n, depth: q ? 0 : depth, name });
      if (n.kids.length && (q || !collapsed[n.id])) rec(n.kids, depth + 1);
    });
    rec(viewDoc.root, 0);
    return { rows, total: countNodes(viewDoc) };
  }, [viewDoc, layerQ, collapsed]);

  const compGroups = useMemo(() => {
    const q = compQ.trim().toLowerCase();
    const out: { title: string; items: NodeType[] }[] = [];
    NODE_TYPES.forEach((t) => {
      const c = COMPONENTS[t];
      if (q && !`${c.label} ${c.desc} ${c.group}`.toLowerCase().includes(q)) return;
      let g = out.find((x) => x.title === c.group);
      if (!g) { g = { title: c.group, items: [] }; out.push(g); }
      g.items.push(t);
    });
    return out;
  }, [compQ]);

  const previewDoc = useMemo<PortfolioDoc | null>(() => (doc ? { ...doc, root: [previewSample(compHover)] } : null), [doc, compHover]);

  if (loadError) return <div className="pe pe-shell" style={{ display: "grid", placeItems: "center" }}><div className="pe-hint">{loadError} <Link href="/socialork/portfolio" style={{ color: "var(--accent)" }}>Back to your portfolio</Link></div></div>;
  if (!doc || !meta || !viewDoc) return <div className="pe pe-shell" style={{ display: "grid", placeItems: "center" }}><span className="pe-spin" aria-label="Loading editor" /></div>;

  const live = meta.status === "PUBLISHED";
  const changes = changeLog.length;
  const saveInfo: Record<SaveState, [string, string, string]> = {
    unsaved: ["Unsaved changes", "#7C7C87", "Changes will save in a moment"],
    saving: ["Saving…", "#A6A6B0", "Saving your draft"],
    saved: [savedAt ? `Saved · ${savedAt}` : "All changes saved", "#48ED85", "Draft saved. Visitors don’t see it until you publish."],
    offline: ["Offline · saved on this device", "oklch(.83 .13 80)", "Changes are stored locally and sync when you reconnect"],
    failed: ["Couldn’t save · Retry", "oklch(.73 .17 25)", "Click to retry saving"],
  };
  const showHint = !hintDismissed && !revView && !!meta.templateId && meta.templateId !== "blank" && !meta.publishedAt && changeLog.length === 0;
  const ovLabel = loc ? (loc.n.type === "section" ? `Section · ${truncate(loc.n.props.label, 18)}` : COMPONENTS[loc.n.type].label) : "";
  const crumbs = loc ? pathTo(doc, loc.n.id) : [];
  const mdNode = mdId ? locate(doc, mdId)?.n : null;
  const deleting = modal?.kind === "delete" ? locate(doc, modal.id) : null;
  const confirmDelete = () => { if (modal?.kind === "delete") del(modal.id, true); };

  const layerDragStart = (e: DragEvent, id: string, type: NodeType) => {
    if (revView) return;
    try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); } catch { /* ignore */ }
    dragRef.current = { id, type };
    setDrag({ over: "", pos: "before", ok: false, msg: "", draggingId: id });
  };
  const layerDragOver = (e: DragEvent, n: PortfolioDoc["root"][number]) => {
    const d = dragRef.current;
    if (!d || !docRef.current) return;
    e.preventDefault();
    const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - rc.top) / rc.height;
    const pos: DropPosition = y < 0.3 ? "before" : y > 0.7 ? "after" : isBox(n.type) ? "into" : y < 0.5 ? "before" : "after";
    const ck = checkDrop(docRef.current, { id: d.id, type: d.type }, n.id, pos);
    try { e.dataTransfer.dropEffect = ck.ok ? (d.isNew ? "copy" : "move") : "none"; } catch { /* ignore */ }
    setDrag((p) => (p && p.over === n.id && p.pos === pos ? p : { over: n.id, pos, ok: ck.ok, msg: ck.msg, draggingId: d.id }));
  };
  const layerDrop = (e: DragEvent, overId: string) => {
    e.preventDefault();
    const d = dragRef.current;
    const st = drag;
    dragRef.current = null;
    setDrag(null);
    if (!d || !st || !st.ok || st.over !== overId || !docRef.current) return;
    if (d.isNew) {
      const node = newComponent(d.type, userEmail);
      commit(dropNode(docRef.current, { node }, overId, st.pos), `Added ${COMPONENTS[d.type].label.toLowerCase()}`);
      setSel(node.id);
    } else if (d.id) {
      const l = locate(docRef.current, d.id);
      commit(dropNode(docRef.current, { id: d.id }, overId, st.pos), `Moved ${l ? nodeName(l.n) : "an element"}`);
      setSel(d.id);
    }
    if (st.pos === "into") setCollapsed((c) => { const x = { ...c }; delete x[overId]; return x; });
  };
  const dragEnd = () => { dragRef.current = null; setDrag(null); };

  const anyCollapsed = Object.keys(collapsed).length > 0;
  const VpIcon = VIEWPORT_ICON[vp];

  return (
    <div className="pe pe-shell">
      {/* ---------------- top bar ---------------- */}
      <header className="pe-top">
        <Link href="/socialork/portfolio" className="pe-ib" aria-label="Back to portfolio dashboard" title="Back to dashboard"><ChevronLeft size={16} /></Link>
        <div className="pe-title">
          <strong>{doc.owner.name || "Your"} · Portfolio</strong>
          <button type="button" className={`pe-save${save === "saving" ? " saving" : ""}`} style={{ color: saveInfo[save][1] }} title={saveInfo[save][2]} onClick={() => { if (save === "failed" || save === "offline") void saveNow(); }}><i />{saveInfo[save][0]}</button>
        </div>
        <button type="button" className="pe-ib" onClick={undo} disabled={!stacks.undo || !!revView} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={16} /></button>
        <button type="button" className="pe-ib pe-hide-phone" onClick={redo} disabled={!stacks.redo || !!revView} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 size={16} /></button>
        <span className="pe-spacer" />
        <div className="pe-hide-phone" role="group" aria-label="Canvas width" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="pe-seg">
            {(["desktop", "tablet", "mobile"] as Viewport[]).map((k) => { const I = VIEWPORT_ICON[k]; return <button type="button" key={k} aria-pressed={vp === k} style={{ width: 34, flex: "none" }} title={`${VIEWPORT_LABEL[k]} · ${VIEWPORT_WIDTH[k]}px`} aria-label={`${VIEWPORT_LABEL[k]} · ${VIEWPORT_WIDTH[k]}px`} onClick={() => setVp(k)}><I size={15} /></button>; })}
          </div>
          <span className="pe-mono" style={{ fontSize: 11, color: "var(--text3)", minWidth: 84 }}>{vpW}px · {Math.round(zoom * 100)}%</span>
        </div>
        <span className="pe-spacer" />
        <button type="button" className="pe-ib pe-only-wide" onClick={() => (revOpen ? (setRevOpen(false), setRevView(null)) : openHistory())} aria-pressed={revOpen} aria-label="Version history" title="Version history"><History size={16} /></button>
        <button type="button" className="pe-ib pe-only-narrow pe-hide-phone" onClick={() => setRightOpen((o) => !o)} aria-pressed={rightOpen} aria-label="Show inspector" title="Inspector"><SlidersHorizontal size={16} /></button>
        <button type="button" className="pe-btn pe-hide-phone" onClick={() => void goPreview()}><Play size={13} fill="currentColor" />Preview</button>
        <button type="button" className="pe-btn pri" onClick={() => void openPublish()} disabled={save === "offline"} title={save === "offline" ? "Publishing needs a connection. Your draft is safe." : undefined}>
          Publish{live && meta.hasUnpublishedChanges && changes > 0 && <span className="pe-mono" style={{ fontSize: 10.5, background: "rgba(6,20,11,.18)", padding: "1px 5px", borderRadius: 4 }}>{changes}</span>}
        </button>
        <div style={{ position: "relative" }}>
          <button type="button" className="pe-ib" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="More actions" title="More"><MoreHorizontal size={16} /></button>
          {menu && (
            <div className="pe-menu" role="menu" style={{ right: 0, top: "calc(100% + 6px)" }}>
              <button type="button" role="menuitem" className="pe-menuitem" onClick={copyLink}><Copy size={14} />Copy public link</button>
              {live && <a role="menuitem" className="pe-menuitem" href={`/p/${meta.handle}`} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}><ExternalLink size={14} />View live site</a>}
              <button type="button" role="menuitem" className="pe-menuitem" onClick={openHistory}><History size={14} />Version history</button>
              <button type="button" role="menuitem" className="pe-menuitem" onClick={() => { setMenu(false); setModal({ kind: "saveTemplate", name: `${doc.owner.name.split(" ")[0] || "My"}’s design` }); }}><Bookmark size={14} />Save as my template</button>
              <button type="button" role="menuitem" className="pe-menuitem" onClick={() => { setMenu(false); setModal({ kind: "keys" }); }}><Keyboard size={14} />Keyboard shortcuts</button>
              <button type="button" role="menuitem" className="pe-menuitem" onClick={async () => { setMenu(false); await flushSave(); router.push("/socialork/portfolio?startOver=1"); }}><RefreshCw size={14} />Start over from a template</button>
              {live && <button type="button" role="menuitem" className="pe-menuitem red" onClick={() => { setMenu(false); setModal({ kind: "unpublish" }); }}><Globe size={14} />Unpublish portfolio</button>}
            </div>
          )}
        </div>
      </header>

      <div className="pe-body">
        {/* tablet rail */}
        <nav className="pe-rail" aria-label="Panels">
          <button type="button" className="pe-ib" aria-pressed={leftOpen && leftTab === "layers"} aria-label="Layers" title="Layers" onClick={() => { setLeftTab("layers"); setLeftOpen((o) => !(o && leftTab === "layers")); }}><Layers size={17} /></button>
          <button type="button" className="pe-ib" aria-pressed={leftOpen && leftTab === "components"} aria-label="Components" title="Components" onClick={() => { setLeftTab("components"); setLeftOpen((o) => !(o && leftTab === "components")); }}><Plus size={17} /></button>
          <button type="button" className="pe-ib" aria-pressed={revOpen} aria-label="Version history" title="Version history" onClick={() => (revOpen ? (setRevOpen(false), setRevView(null)) : openHistory())}><History size={17} /></button>
        </nav>

        {/* ---------------- left: layers / components ---------------- */}
        <aside className="pe-left" data-open={leftOpen} aria-label="Layers and components">
          <span className="pe-grab" aria-hidden="true" />
          <div className="pe-panel-head">
            <div role="tablist" aria-label="Left panel" style={{ display: "flex", gap: 2, flex: 1 }}>
              <button type="button" role="tab" className="pe-tab" aria-selected={leftTab === "layers"} onClick={() => setLeftTab("layers")}>Layers</button>
              <button type="button" role="tab" className="pe-tab" aria-selected={leftTab === "components"} onClick={() => setLeftTab("components")}>Components</button>
            </div>
            <button type="button" className="pe-ib sm pe-only-narrow" aria-label="Close panel" onClick={() => setLeftOpen(false)}><X size={14} /></button>
          </div>

          {leftTab === "layers" ? (
            <>
              <div style={{ flex: "none", display: "flex", gap: 6, padding: "8px 8px 4px" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <Search size={13} color="#7C7C87" style={{ position: "absolute", left: 9, top: 9 }} />
                  <input className="pe-inp" value={layerQ} onChange={(e) => setLayerQ(e.target.value)} placeholder="Filter layers" aria-label="Filter layers" style={{ paddingLeft: 28, height: 30 }} />
                </div>
                <button type="button" className="pe-ib" style={{ width: 30, height: 30 }} aria-label={anyCollapsed ? "Expand all" : "Collapse all"} title={anyCollapsed ? "Expand all" : "Collapse all"} onClick={() => { if (anyCollapsed) setCollapsed({}); else { const c: Record<string, boolean> = {}; walk(viewDoc.root, (n) => { if (n.kids.length) c[n.id] = true; }); setCollapsed(c); } }}>{anyCollapsed ? <ListTree size={15} /> : <ListCollapse size={15} />}</button>
              </div>
              <div className="pe-scroll" role="tree" aria-label="Page layers" style={{ flex: 1, padding: "2px 6px 10px" }}>
                <button type="button" onClick={() => setSel(null)} className={`pe-layer${!sel ? " on" : ""}`} style={{ width: "100%", border: 0, fontWeight: 600, gap: 8, padding: "0 8px" }}>
                  <FileText size={14} /><span style={{ flex: 1, textAlign: "left" }}>Page</span><span className="pe-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>{layerQ ? `${layerRows.rows.length} of ${layerRows.total}` : layerRows.total}</span>
                </button>
                {layerRows.rows.map(({ n, depth, name }) => {
                  const on = sel === n.id;
                  const hid = !!n.hide[vp];
                  const Icon = COMPONENT_ICON[n.type];
                  const col = !!collapsed[n.id];
                  const dropCls = drag && drag.over === n.id ? ` drop-${drag.pos}` : "";
                  return (
                    <div
                      key={n.id} role="treeitem" aria-level={depth + 1} aria-selected={on} aria-expanded={n.kids.length ? !col : undefined}
                      draggable={!revView} onDragStart={(e) => layerDragStart(e, n.id, n.type)} onDragOver={(e) => layerDragOver(e, n)} onDrop={(e) => layerDrop(e, n.id)} onDragEnd={dragEnd}
                      className={`pe-layer${on ? " on" : ""}${hid ? " hidden" : ""}${dropCls}${drag?.draggingId === n.id ? " dragging" : ""}`}
                      style={drag && drag.over === n.id ? ({ "--dc": drag.ok ? "#48ED85" : "oklch(.73 .17 25)", "--dbg": drag.ok ? "rgba(72,237,133,.1)" : "oklch(.73 .17 25 / .13)" } as React.CSSProperties) : undefined}
                    >
                      <span style={{ width: depth * 14, flex: "none" }} />
                      {n.kids.length > 0 && !layerQ
                        ? <button type="button" className="pe-ib sm" style={{ width: 18, height: 18, color: "var(--text3)" }} aria-label={`${col ? "Expand" : "Collapse"} ${name}`} onClick={() => setCollapsed((c) => { const x = { ...c }; if (x[n.id]) delete x[n.id]; else x[n.id] = true; return x; })}><ChevronRight size={11} style={{ transform: col ? "none" : "rotate(90deg)", transition: "transform .12s" }} /></button>
                        : <span style={{ width: 18, flex: "none" }} />}
                      <button type="button" className="name" title={`${COMPONENTS[n.type].label}: ${name}`} onClick={() => { if (revView) return; setSel(n.id); requestAnimationFrame(() => wrapRef.current?.querySelector(`[data-nid="${n.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" })); }}>
                        <Icon size={14} color={on ? "#48ED85" : "#8A8A95"} style={{ flex: "none" }} /><span>{name}</span>
                      </button>
                      <button type="button" className="pe-ib sm" style={{ color: hid ? "oklch(.83 .13 80)" : "#4A4A55" }} aria-label={`${hid ? "Show" : "Hide"} on ${VIEWPORT_LABEL[vp].toLowerCase()}`} title={`${hid ? "Show" : "Hide"} on ${VIEWPORT_LABEL[vp].toLowerCase()}`} disabled={!!revView} onClick={() => edit((d) => { const m = locate(d, n.id); if (m) m.n.hide[vp] = !hid; }, `${hid ? "Showed" : "Hid"} ${name} on ${VIEWPORT_LABEL[vp].toLowerCase()}`)}>{hid ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                    </div>
                  );
                })}
                {!viewDoc.root.length && <div className="pe-hint">No layers yet.<br /><span style={{ color: "var(--text3)" }}>Add a Section from Components to begin.</span></div>}
                {!!layerQ && !layerRows.rows.length && !!viewDoc.root.length && <div className="pe-hint" style={{ border: 0 }}>No layers match “{layerQ}”.</div>}
              </div>
              {drag && drag.over && drag.msg && (
                <div role="status" style={{ flex: "none", margin: "0 8px 8px", padding: "8px 10px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 8, background: drag.ok ? "var(--accentSoft)" : "var(--redSoft)", color: drag.ok ? "var(--accent)" : "var(--red)" }}>
                  {drag.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{drag.msg}
                </div>
              )}
              <div style={{ flex: "none", padding: "8px 10px", borderTop: "1px solid var(--line)", display: "flex", flexWrap: "wrap", gap: "6px 10px", fontSize: 11, color: "var(--text3)" }}>
                <span>Drag to reorder</span><span><span className="pe-kbd">Alt ↑↓</span> move</span><span><span className="pe-kbd">⌘D</span> duplicate</span><span><span className="pe-kbd">Del</span> delete</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: "none", padding: "8px 8px 4px", position: "relative" }}>
                <Search size={13} color="#7C7C87" style={{ position: "absolute", left: 17, top: 17 }} />
                <input ref={searchRef} className="pe-inp" value={compQ} onChange={(e) => setCompQ(e.target.value)} placeholder="Search components   /" aria-label="Search components" style={{ paddingLeft: 28, height: 30 }} />
              </div>
              <div style={{ flex: "none", margin: "4px 8px", padding: "7px 9px", borderRadius: 7, background: "var(--panel2)", fontSize: 11.5, color: "var(--text2)", display: "flex", gap: 6, alignItems: "center" }}>
                <Plus size={13} color="#48ED85" style={{ flex: "none" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{!loc ? "Adds to the end of the page" : isBox(loc.n.type) ? `Adds inside ${nodeName(loc.n)}` : `Adds after ${nodeName(loc.n)}`}</span>
              </div>
              <div className="pe-scroll" style={{ flex: 1, padding: "2px 6px 10px" }}>
                {compGroups.map((g) => (
                  <div key={g.title}>
                    <div className="pe-group-title">{g.title}</div>
                    {g.items.map((t) => {
                      const Icon = COMPONENT_ICON[t];
                      return (
                        <button type="button" key={t} className={`pe-comp${compHover === t ? " hover" : ""}`} draggable onDragStart={(e) => { try { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", t); } catch { /* ignore */ } dragRef.current = { type: t, isNew: true }; }} onDragEnd={dragEnd} onClick={() => insert(t)} onMouseEnter={() => setCompHover(t)} onFocus={() => setCompHover(t)} title={`Add ${COMPONENTS[t].label}, or drag it onto a layer`} disabled={!!revView}>
                          <span className="ico"><Icon size={15} /></span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 12.5 }}>{COMPONENTS[t].label}{t === "section" && <span style={{ fontWeight: 500, fontSize: 10.5, color: "var(--text3)" }}>· page level</span>}</span>
                            <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)", lineHeight: 1.35 }}>{COMPONENTS[t].desc}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {!compGroups.length && (
                  <div className="pe-hint">
                    <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>Nothing called “{compQ}”</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>The library has 16 components. For a video or embed, use an Image with a link, or a Button that opens it.</div>
                    <button type="button" className="pe-btn" style={{ marginTop: 12, height: 28 }} onClick={() => setCompQ("")}>Clear search</button>
                  </div>
                )}
              </div>
              {previewDoc && (
                <div style={{ flex: "none", borderTop: "1px solid var(--line)", padding: 10 }}>
                  <div style={{ fontSize: 11.5, color: "var(--text2)", marginBottom: 8 }}><strong style={{ color: "var(--text)" }}>{COMPONENTS[compHover].label}</strong> · preview in your theme</div>
                  <div style={{ height: 118, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", background: doc.theme.bg }} aria-hidden="true">
                    <div style={{ zoom: 0.8, pointerEvents: "none" }}><PortfolioView doc={previewDoc} scope="compprev" /></div>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>

        {/* ---------------- canvas ---------------- */}
        <main className="pe-canvas" aria-label="Canvas">
          {save === "failed" && <div className="pe-banner red" role="alert"><AlertTriangle size={15} /><span className="grow">Your last changes didn’t save. They’re kept on this device; don’t close the tab until saving works again.</span><button type="button" className="pe-btn" style={{ height: 26 }} onClick={() => void saveNow()}>Retry now</button></div>}
          {save === "offline" && <div className="pe-banner amber" role="status"><WifiOff size={15} /><span className="grow">You’re offline. Keep editing: changes are stored on this device and sync when you reconnect. Publishing is paused.</span></div>}
          {showHint && <div className="pe-banner blue"><span className="grow">This template starts with sample content. Click anything to make it yours; double-click text to edit it on the canvas.</span><button type="button" className="pe-ib sm" aria-label="Dismiss" onClick={() => setHintDismissed(true)}><X size={13} /></button></div>}
          {revView && <div className="pe-banner green"><History size={15} color="#48ED85" /><span className="grow">Viewing <strong>{revView.title}</strong>. Read-only: nothing changes until you restore it.</span><button type="button" className="pe-btn" style={{ height: 26 }} onClick={() => setRevView(null)}>Back to current draft</button><button type="button" className="pe-btn pri" style={{ height: 26 }} onClick={() => setModal({ kind: "restore" })}>Restore this version</button></div>}
          {vp !== "desktop" && !revView && <div className="pe-banner vp pe-hide-phone"><span className="pe-chip blue"><VpIcon size={12} />{VIEWPORT_LABEL[vp]} layout</span>{vp === "tablet" ? "Layout and style changes apply to tablet and phone. Content is shared across every size." : "Layout and style changes apply to phones only. Content is shared across every size."}</div>}
          <div ref={scrollRef} className="pe-canvas-scroll">
            <div style={{ width: Math.round(vpW * zoom), margin: "0 auto" }}>
              <div className="pe-frame-meta"><span>{VIEWPORT_LABEL[vp]} · {vpW}px{revView ? " · read-only" : ""}</span><span style={{ flex: 1 }} /><span>{zoom < 1 ? `${Math.round(zoom * 100)}% to fit` : "100%"}</span></div>
              <div ref={wrapRef} style={{ position: "relative" }}>
                <div className={`pe-frame${vp === "desktop" ? "" : " device"}`} style={{ width: vpW, zoom, background: viewDoc.theme.bg, minHeight: vp === "mobile" ? 740 : 900 }} onClick={onCanvasClick} onDoubleClick={onCanvasDouble} onMouseOver={onCanvasOver} onMouseLeave={onCanvasLeave}>
                  <PortfolioView key={canvasKey} doc={viewDoc} scope="canvas" edit={!revView} />
                </div>
                {!viewDoc.root.length && !revView && (
                  <div className="pe-empty-guide">
                    <div className="pe-empty-card">
                      <h2>Your page is empty</h2>
                      <p>Pages are built from <strong>Sections</strong>: full-width bands you fill with headings, text, images and project cards. Add your first one, then keep stacking.</p>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                        <button type="button" className="pe-dark-btn" onClick={() => insert("section")}><Plus size={14} />Add a section</button>
                        <button type="button" className="pe-light-btn" onClick={() => insert("section", makeNode("section", { label: "Introduction", anchor: "" }, { padY: 96 }, [makeNode("heading", { text: doc.owner.name || "Your name", level: 1 }), makeNode("text", { text: "One or two sentences about what you do and who you do it for." }, { size: 20, color: "muted", maxW: 620 })]))}>Section with heading &amp; text</button>
                      </div>
                      <div style={{ marginTop: 14, fontSize: 12, color: "#77777F" }}>or press <span className="pe-kbd" style={{ color: "#16161A", borderColor: "rgba(20,20,30,.2)" }}>/</span> to search components</div>
                    </div>
                  </div>
                )}
                {ov && loc && (
                  <>
                    <div className="pe-overlay" aria-hidden="true" style={{ top: ov.top, left: ov.left, width: ov.w, height: ov.h }} />
                    <div className="pe-ovbar" style={{ top: ov.top < 28 ? ov.top + 4 : ov.top - 27, left: Math.max(0, ov.left) }}>
                      <span className="pe-ovlabel">{ovLabel}</span>
                      <span className="pe-ovtools" role="toolbar" aria-label="Selected element actions">
                        <button type="button" className="pe-ib sm" disabled={loc.i === 0} aria-label="Move up" title="Move up (Alt ↑)" onClick={() => move(loc.n.id, -1)}><ArrowUp size={12} /></button>
                        <button type="button" className="pe-ib sm" disabled={loc.i === loc.arr.length - 1} aria-label="Move down" title="Move down (Alt ↓)" onClick={() => move(loc.n.id, 1)}><ArrowDown size={12} /></button>
                        <button type="button" className="pe-ib sm" disabled={!loc.parent} aria-label="Select parent" title="Select parent (Esc)" onClick={() => loc.parent && setSel(loc.parent.id)}><CornerUpLeft size={12} /></button>
                        {loc.n.type === "text" && <button type="button" className="pe-ib sm pe-mono" style={{ width: "auto", padding: "0 6px", fontSize: 10.5, fontWeight: 600, color: "#48ED85" }} aria-label="Edit in Markdown" title="Edit in Markdown" onClick={() => openMarkdown(loc.n.id)}>M↓</button>}
                        <button type="button" className="pe-ib sm" aria-label="Duplicate" title="Duplicate (⌘D)" onClick={() => dup(loc.n.id)}><Copy size={12} /></button>
                        <button type="button" className="pe-ib sm" style={{ color: "var(--red)" }} aria-label="Delete" title="Delete (Del)" onClick={() => del(loc.n.id)}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  </>
                )}
              </div>
              {!revView && !!viewDoc.root.length && <p className="pe-hide-phone" style={{ margin: "12px 0 0", textAlign: "center", fontSize: 11.5, color: "var(--text3)" }}>Click to select · double-click text to edit · Esc selects the parent</p>}
            </div>
          </div>
        </main>

        {/* ---------------- right: inspector / versions ---------------- */}
        <aside className="pe-right" data-open={rightOpen || revOpen} aria-label={revOpen ? "Version history" : "Inspector"}>
          <span className="pe-grab" aria-hidden="true" />
          {revOpen ? (
            <>
              <div className="pe-panel-head" style={{ padding: "12px 12px 10px" }}>
                <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, flex: 1 }}>Version history</h2>
                <button type="button" className="pe-ib sm" aria-label="Close version history" onClick={() => { setRevOpen(false); setRevView(null); }}><X size={14} /></button>
              </div>
              <p style={{ flex: "none", margin: 0, padding: "10px 12px", fontSize: 11.5, color: "var(--text3)", lineHeight: 1.5, borderBottom: "1px solid var(--line)" }}>Your draft saves as you work. A version is kept every time you publish, and every 10 minutes while you edit.</p>
              <div className="pe-scroll" style={{ flex: 1, padding: 8 }}>
                <button type="button" className="pe-rev" aria-pressed={!revView} onClick={() => setRevView(null)} style={{ borderColor: !revView ? "rgba(72,237,133,.35)" : undefined, background: !revView ? "rgba(72,237,133,.08)" : undefined }}>
                  <span className="dot" style={{ background: "var(--amber)" }} />
                  <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontWeight: 600, fontSize: 12.5 }}>Current draft</span><span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>{live && meta.hasUnpublishedChanges ? "Has unpublished changes" : live ? "Matches the live version" : "Not published yet"}</span></span>
                </button>
                {versions === null && <div style={{ display: "grid", placeItems: "center", padding: 24 }}><span className="pe-spin" /></div>}
                {versions?.map((v) => (
                  <button type="button" key={v.id} className="pe-rev" aria-pressed={revView?.id === v.id} onClick={() => void viewVersion(v)}>
                    <span className="dot" style={{ background: KIND_DOT[v.kind] ?? "#55555F" }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 12.5 }}>{v.label || KIND_LABEL[v.kind] || v.kind}{v.live && <span className="pe-chip ok" style={{ height: 17, padding: "0 5px", fontSize: 10 }}>Live</span>}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--text3)" }}>{fmtTime(v.createdAt)}</span>
                    </span>
                  </button>
                ))}
                {versions && !versions.length && <div className="pe-hint"><div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>No versions yet</div><div style={{ fontSize: 12, color: "var(--text3)" }}>Your first version is kept when you publish, or after 10 minutes of editing.</div></div>}
              </div>
              <div style={{ flex: "none", padding: "10px 12px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
                {revView
                  ? <button type="button" className="pe-btn pri" style={{ flex: 1 }} onClick={() => setModal({ kind: "restore" })}>Restore this version</button>
                  : <button type="button" className="pe-btn" style={{ flex: 1 }} onClick={async () => { await flushSave(); const r = await call("/api/portfolio/versions", { method: "POST", body: JSON.stringify({ label: `Named version · ${new Date().toLocaleDateString()}` }) }); showToast(r.ok ? "Saved the current draft as a version." : r.error); void loadVersions(); }}>Name current version</button>}
              </div>
            </>
          ) : (
            <>
              <div style={{ flex: "none", padding: "12px 12px 10px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                <nav className="pe-crumbs" aria-label="Selection path">
                  <button type="button" onClick={() => setSel(null)} style={{ color: loc ? undefined : "var(--text)" }}>Page</button>
                  {crumbs.map((c) => <span key={c.id} style={{ display: "contents" }}><span aria-hidden="true">›</span><button type="button" onClick={() => setSel(c.id)}>{nodeName(c)}</button></span>)}
                </nav>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 28, height: 28, flex: "none", borderRadius: 7, background: "var(--panel2)", display: "grid", placeItems: "center", color: "var(--accent)" }}>{(() => { const I = loc ? COMPONENT_ICON[loc.n.type] : FileText; return <I size={15} />; })()}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loc ? nodeName(loc.n) : "Page"}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text3)" }}>{loc ? COMPONENTS[loc.n.type].label + (loc.n.hide[vp] ? ` · hidden on ${VIEWPORT_LABEL[vp].toLowerCase()}` : "") : "Theme, fonts, spacing and search settings"}</span>
                  </span>
                  {loc && <><button type="button" className="pe-ib sm" aria-label="Duplicate" title="Duplicate (⌘D)" onClick={() => dup(loc.n.id)}><Copy size={14} /></button><button type="button" className="pe-ib sm" aria-label="Delete" title="Delete (Del)" onClick={() => del(loc.n.id)}><Trash2 size={14} /></button></>}
                  <button type="button" className="pe-ib sm pe-only-narrow" aria-label="Close inspector" onClick={() => setRightOpen(false)}><X size={14} /></button>
                </div>
                <div role="tablist" aria-label="Inspector" className="pe-seg">
                  {(["content", "layout", "style", "responsive"] as InspectorTab[]).map((t) => <button type="button" role="tab" key={t} aria-selected={insTab === t} onClick={() => setInsTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
                </div>
                {vp !== "desktop" && loc && (insTab === "layout" || insTab === "style") && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--blue)" }}><VpIcon size={13} />Changes here override {VIEWPORT_LABEL[vp].toLowerCase()}{vp === "tablet" ? " and phone" : ""} only</div>}
              </div>
              <div className="pe-scroll" style={{ flex: 1 }}><InspectorGroups groups={groups} /></div>
              {loc && (
                <div style={{ flex: "none", padding: "8px 12px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="pe-lbl" style={{ flex: 1 }}>Arrange</span>
                  <button type="button" className="pe-btn" style={{ height: 28, padding: "0 9px" }} disabled={loc.i === 0} onClick={() => move(loc.n.id, -1)}><ArrowUp size={12} />Up</button>
                  <button type="button" className="pe-btn" style={{ height: 28, padding: "0 9px" }} disabled={loc.i === loc.arr.length - 1} onClick={() => move(loc.n.id, 1)}><ArrowDown size={12} />Down</button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {/* phone tool bar */}
      <nav className="pe-mobbar" aria-label="Editor tools">
        <button type="button" aria-pressed={leftOpen && leftTab === "layers"} onClick={() => { setLeftTab("layers"); setLeftOpen(!(leftOpen && leftTab === "layers")); setRightOpen(false); setRevOpen(false); }}><Layers size={19} />Layers</button>
        <button type="button" aria-pressed={leftOpen && leftTab === "components"} onClick={() => { setLeftTab("components"); setLeftOpen(!(leftOpen && leftTab === "components")); setRightOpen(false); setRevOpen(false); }}><Plus size={19} />Add</button>
        <button type="button" aria-pressed={rightOpen && !revOpen} onClick={() => { setRightOpen(!rightOpen || revOpen); setRevOpen(false); setLeftOpen(false); }}><SlidersHorizontal size={19} />Edit</button>
        <button type="button" onClick={() => void goPreview()}><Play size={19} />Preview</button>
      </nav>

      {/* ---------------- modals ---------------- */}
      {mdId && mdNode && <MarkdownEditor node={mdNode} doc={doc} name={nodeName(mdNode)} compact={cw < 700} onCancel={() => setMdId(null)} onSave={(text) => { const id = mdId; setMdId(null); if (text !== mdNode.props.text) { edit((d) => { const m = locate(d, id); if (m) m.n.props.text = text; }, "Edited text in Markdown"); showToast("Markdown saved to the page."); } }} />}
      {modal && (
        <>
          <div className="pe-backdrop" onClick={() => { if (modal.kind !== "publishing") setModal(null); }} />
          <div className="pe-modal" role="dialog" aria-modal="true" aria-labelledby="pe-modal-h">
            {modal.kind === "publish" && (
              <>
                <div className="pe-modal-pad">
                  <h2 id="pe-modal-h">{live ? "Publish your changes?" : meta.status === "UNPUBLISHED" ? "Publish your portfolio again?" : "Publish your portfolio?"}</h2>
                  <p>Everyone visiting <span className="pe-mono" style={{ color: "var(--text)" }}>/p/{meta.handle}</span> will see this version. Your previous version stays in history.</p>
                  <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "9px 12px", background: "var(--panel2)", fontSize: 12, fontWeight: 600, display: "flex", gap: 8 }}><span style={{ flex: 1 }}>{live ? (changes ? `${changes} change${changes === 1 ? "" : "s"} this session` : "Changes since the last publish") : "Everything on the page"}</span><button type="button" className="pe-link-btn" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }} onClick={() => { setModal(null); void goPreview(); }}>Preview first</button></div>
                    <ul style={{ listStyle: "none", margin: 0, padding: "6px 12px 8px" }}>
                      {(changeLog.length ? [...new Set(changeLog)].slice(0, 5) : [live ? "Your saved draft" : "First publish of your portfolio"]).map((t) => <li key={t} style={{ fontSize: 12.5, color: "var(--text2)", padding: "3px 0" }}>· {t}</li>)}
                    </ul>
                  </div>
                  {modal.checks.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5 }}>
                      {c.level === "ok" ? <Check size={15} color="#48ED85" /> : <AlertTriangle size={15} color={c.level === "block" ? "oklch(.73 .17 25)" : c.level === "info" ? "oklch(.78 .11 245)" : "oklch(.83 .13 80)"} />}
                      <span style={{ flex: 1, color: "var(--text2)" }}>{c.text}</span>
                      {c.nodeId && <button type="button" className="pe-link-btn" style={{ color: "var(--accent)", fontWeight: 600, fontSize: 12 }} onClick={() => { setModal(null); setSel(c.nodeId!); setInsTab("content"); setRevOpen(false); }}>Fix</button>}
                    </div>
                  ))}
                  {modal.error && <div className="pe-note warn">{modal.error}</div>}
                </div>
                <div className="pe-modal-foot">
                  <button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Cancel</button>
                  <button type="button" className="pe-btn pri lg" disabled={modal.checks.some((c) => c.level === "block")} onClick={() => void doPublish()}>Publish to /p/{meta.handle}</button>
                </div>
              </>
            )}
            {modal.kind === "publishing" && <div className="pe-modal-pad" role="status" aria-live="polite"><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="pe-spin" /><h2 id="pe-modal-h">Publishing…</h2></div><p>Visitors keep seeing the old version until this finishes.</p></div>}
            {modal.kind === "published" && (
              <div className="pe-modal-pad" style={{ alignItems: "center", textAlign: "center" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--accentSoft)", color: "var(--accent)", display: "grid", placeItems: "center" }}><Check size={26} /></div>
                <h2 id="pe-modal-h" style={{ fontSize: 20 }}>Your portfolio is live</h2>
                <p>Anyone with the link sees this version.</p>
                <div style={{ width: "100%", display: "flex", gap: 6 }}>
                  <div className="pe-inp pe-mono" style={{ height: 38, display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>{typeof window !== "undefined" ? window.location.host : ""}/p/{meta.handle}</div>
                  <button type="button" className="pe-btn" style={{ height: 38 }} onClick={copyLink}>Copy link</button>
                </div>
                <div style={{ width: "100%", display: "flex", gap: 8 }}>
                  <button type="button" className="pe-btn lg" style={{ flex: 1 }} onClick={() => setModal(null)}>Keep editing</button>
                  <a className="pe-btn pri lg" style={{ flex: 1 }} href={`/p/${meta.handle}`} target="_blank" rel="noreferrer">View live site</a>
                </div>
                <Link href="/socialork/create" style={{ color: "var(--text2)", fontSize: 12.5 }}>Announce it: draft a post in Create</Link>
              </div>
            )}
            {modal.kind === "failed" && (
              <>
                <div className="pe-modal-pad" role="alert">
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--redSoft)", color: "var(--red)", display: "grid", placeItems: "center" }}><AlertTriangle size={20} /></div>
                  <h2 id="pe-modal-h">Couldn’t publish</h2>
                  <p>{modal.error} Your live site didn’t change, and your draft is saved.</p>
                </div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Close</button><button type="button" className="pe-btn pri lg" onClick={() => void doPublish()}>Try again</button></div>
              </>
            )}
            {modal.kind === "delete" && (
              <>
                <div className="pe-modal-pad"><h2 id="pe-modal-h">Delete “{deleting ? truncate(nodeName(deleting.n), 40) : ""}”?</h2><p>This removes it and the {deleting ? countDescendants(deleting.n) : 0} elements inside. You can undo with <span className="pe-kbd">⌘Z</span> during this session.</p></div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Cancel</button><button type="button" className="pe-btn danger lg" onClick={confirmDelete}>Delete</button></div>
              </>
            )}
            {modal.kind === "unpublish" && (
              <>
                <div className="pe-modal-pad"><h2 id="pe-modal-h">Unpublish your portfolio?</h2><p>Visitors to <span className="pe-mono" style={{ color: "var(--text)" }}>/p/{meta.handle}</span> will see a “not public right now” page. Your draft, design and versions are kept.</p></div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Cancel</button><button type="button" className="pe-btn danger lg" onClick={() => void unpublish()}>Unpublish</button></div>
              </>
            )}
            {modal.kind === "restore" && (
              <>
                <div className="pe-modal-pad"><h2 id="pe-modal-h">Restore this version?</h2><p>Your current draft is replaced by <strong style={{ color: "var(--text)" }}>{revView?.title}</strong>. We keep the current draft in history as “Draft before restore”, so you can switch back.</p><div className="pe-note">Your live site doesn’t change until you publish.</div></div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Cancel</button><button type="button" className="pe-btn pri lg" onClick={() => void restoreVersion()}>Restore version</button></div>
              </>
            )}
            {modal.kind === "conflict" && (
              <>
                <div className="pe-modal-pad"><h2 id="pe-modal-h">This page changed somewhere else</h2><p>It was saved from another tab or device while you were editing. Keep your version (replacing the other one), or load the other one.</p></div>
                <div className="pe-modal-foot">
                  <button type="button" className="pe-btn lg" onClick={() => { applyServer(modal.server); setModal(null); showToast("Loaded the newer version."); }}>Load the other version</button>
                  <button type="button" className="pe-btn pri lg" onClick={() => { revisionRef.current = modal.server.revision; setModal(null); void saveNow(); }}>Keep mine</button>
                </div>
              </>
            )}
            {modal.kind === "saveTemplate" && (
              <form onSubmit={(e) => { e.preventDefault(); if (modal.name.trim()) void saveTemplate(modal.name.trim()); }}>
                <div className="pe-modal-pad">
                  <h2 id="pe-modal-h">Save as my template</h2>
                  <p>Keeps this design (content, layout and theme) so you can start from it again later.</p>
                  <label className="pe-lbl" htmlFor="tpl-name">Template name</label>
                  <input id="tpl-name" className="pe-inp" autoFocus value={modal.name} maxLength={60} onChange={(e) => setModal({ kind: "saveTemplate", name: e.target.value })} />
                </div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn ghost lg" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="pe-btn pri lg" disabled={!modal.name.trim()}>Save template</button></div>
              </form>
            )}
            {modal.kind === "keys" && (
              <>
                <div className="pe-modal-pad">
                  <h2 id="pe-modal-h">Keyboard shortcuts</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "8px 16px", fontSize: 12.5, color: "var(--text2)" }}>
                    {[["Search components", "/"], ["Undo · Redo", "⌘Z · ⇧⌘Z"], ["Save now", "⌘S"], ["Duplicate selection", "⌘D"], ["Delete selection", "Del"], ["Move up · down", "Alt ↑ · Alt ↓"], ["Select parent", "Esc"], ["Edit text on canvas", "Double-click"], ["Finish editing text", "Enter"]].map(([a, b]) => <span key={a} style={{ display: "contents" }}><span>{a}</span><span className="pe-kbd">{b}</span></span>)}
                  </div>
                </div>
                <div className="pe-modal-foot"><button type="button" className="pe-btn lg" onClick={() => setModal(null)}>Done</button></div>
              </>
            )}
          </div>
        </>
      )}
      {toast && <div className="pe-toast" role="status" aria-live="polite"><Check size={14} color="#48ED85" /><span>{toast.text}</span>{toast.action && <button type="button" onClick={() => { const r = toast.run; setToast(null); r?.(); }}>{toast.action}</button>}</div>}
    </div>
  );
}
