import type { CSSProperties, ReactNode } from "react";
import { imageSrc } from "@/lib/portfolio/art";
import { renderInline, renderMarkdown, safeHref } from "@/lib/portfolio/markdown";
import { COMPONENTS } from "@/lib/portfolio/model";
import { num, overriddenAt, styleValue } from "@/lib/portfolio/resolve";
import { type FontKey, MOBILE_MAX, type PNode, type PortfolioDoc, TABLET_MAX, type Theme, type Viewport, VIEWPORTS } from "@/lib/portfolio/types";

/**
 * The one renderer behind every surface: editor canvas, preview, template
 * thumbnails and the public page.
 *
 * Structure (the React tree) is the same at every screen size. Everything that
 * changes with size is compiled into a scoped stylesheet: desktop rules first,
 * then tablet and phone rules inside container queries on `.pf-root`. That
 * makes the public page responsive with no client JavaScript, and makes the
 * editor's tablet/phone canvas correct simply by being narrower.
 */

export const FONT_STACK: Record<FontKey, string> = {
  hanken: 'var(--font-hanken), "Hanken Grotesk", system-ui, sans-serif',
  geist: 'var(--font-geist-sans), "Geist", system-ui, sans-serif',
  plex: 'var(--font-plex-mono), "IBM Plex Mono", ui-monospace, monospace',
  geistmono: 'var(--font-geist-mono), "Geist Mono", ui-monospace, monospace',
};
export const FONT_NAME: Record<FontKey, string> = { hanken: "Hanken Grotesk", geist: "Geist", plex: "IBM Plex Mono", geistmono: "Geist Mono" };

const TOKENS: Record<string, string> = { bg: "bg", surface: "surface", text: "text", muted: "muted", accent: "accent", onAccent: "on", line: "line" };
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|oklch\([0-9.,\s%/]+\))$/;
const ENUM: Record<string, string[]> = {
  dir: ["row", "column"], align: ["start", "center", "end", "stretch"], justify: ["start", "center", "end", "between"],
  ta: ["left", "center", "right"], case: ["none", "upper"], shadow: ["none", "soft", "lift", "hard"],
};
const AL: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", stretch: "stretch" };
const JU: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", between: "space-between" };
const SHADOW: Record<string, string> = {
  none: "none",
  soft: "0 1px 2px rgba(0,0,0,.06),0 10px 30px rgba(0,0,0,.08)",
  lift: "0 2px 6px rgba(0,0,0,.08),0 28px 60px rgba(0,0,0,.18)",
  hard: "6px 6px 0 currentColor",
};

/** A colour value from a style: a theme token or a literal colour. Anything else is dropped. */
export function cssColor(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  if (v === "none") return "transparent";
  if (TOKENS[v]) return `var(--pf-${TOKENS[v]})`;
  return COLOR_RE.test(v) ? v : "";
}
const safeColor = (v: string, fallback: string) => (COLOR_RE.test(v) ? v : fallback);
const en = (key: string, v: unknown, fallback: string) => (typeof v === "string" && ENUM[key]?.includes(v) ? v : fallback);

type Decls = Record<string, string>;
type Parts = Record<string, Decls>;
interface Ctx { t: Theme; vp: Viewport; pdir: string; pcols: number }

/** Size a font-size down on smaller screens unless the author set one there. */
function autoSize(n: PNode, size: number, vp: Viewport): number {
  if (n.style.autoType === false || overriddenAt(n, "size", vp)) return size;
  if (vp === "tablet" && size > 48) return Math.round(size * 0.8);
  if (vp === "mobile" && size >= 30) return Math.round(Math.max(26, size * 0.58));
  return size;
}

function fontFamily(v: unknown): string {
  if (v === "head") return "var(--pf-fh)";
  if (v === "body") return "var(--pf-fb)";
  return typeof v === "string" && v in FONT_STACK ? FONT_STACK[v as FontKey] : "var(--pf-fb)";
}

/** The display a visible node uses; set explicitly so hiding per device can be undone. */
function baseDisplay(n: PNode): string {
  const v = n.props.variant;
  switch (n.type) {
    case "container": case "stack": case "column": return "flex";
    case "grid": return "grid";
    case "button": return "inline-flex";
    case "project": return v === "list" ? "grid" : "flex";
    case "experience": return (v || "row") === "row" ? "grid" : "block";
    case "contact": return v === "split" ? "grid" : "flex";
    default: return "block";
  }
}

/** Every size-dependent declaration of one node at one viewport. */
function partsFor(n: PNode, c: Ctx): Parts {
  const { t, vp } = c;
  const g = (k: string) => styleValue(n, k, vp, t);
  const T = n.type;
  const self: Decls = {};
  const parts: Parts = { self };

  self.display = n.hide[vp] ? "none" : baseDisplay(n);
  const bg = cssColor(g("bg"));
  const color = cssColor(g("color"));
  if (T !== "button" && T !== "divider") self.background = bg || "";
  if (T !== "button") self.color = color || "";
  const bw = num(g("border"));
  self.border = bw ? `${bw}px solid ${cssColor(g("borderColor")) || "var(--pf-line)"}` : "";
  const op = num(g("opacity"), 100);
  self.opacity = op < 100 ? String(Math.max(0.05, op / 100)) : "";
  self["box-shadow"] = SHADOW[en("shadow", g("shadow"), "none")];
  self["margin-top"] = num(g("mt")) ? `${num(g("mt"))}px` : "";
  self["margin-bottom"] = num(g("mb")) ? `${num(g("mb"))}px` : "";
  const w = g("width");
  self.width = w === "hug" ? "fit-content" : typeof w === "number" ? `${Math.max(1, w)}px` : "";
  self["max-width"] = w === "hug" || typeof w === "number" ? "100%" : "";
  const span = num(g("span"), 1);
  self["grid-column"] = span > 1 && c.pcols > 1 ? `span ${Math.min(span, c.pcols)}` : "";
  const fillsRow = c.pdir === "row" && w !== "hug" && typeof w !== "number";
  self.flex = typeof w === "number" ? "none" : fillsRow && ["column", "container", "skills", "project"].includes(T) ? "1 1 240px" : "";
  self["min-width"] = fillsRow ? "0" : "";

  const r = num(g("radius"));
  const rad = r >= 64 ? "999px" : `${r}px`;
  const mw = num(g("maxW"));
  const pad = (y: number, x: number) => `${y}px ${x}px`;
  const flexBox = (dir: string, al: string) => ({
    "flex-direction": dir, gap: `${num(g("gap"))}px`, "align-items": AL[al] ?? "stretch", "justify-content": JU[en("justify", g("justify"), "start")],
  });
  const typo = (size: number) => {
    self["font-family"] = fontFamily(g("font"));
    self["font-size"] = `${autoSize(n, size, vp)}px`;
    self["font-weight"] = String(num(g("weight"), 400));
    self["line-height"] = String(num(g("lh"), 1.5));
    self["letter-spacing"] = `${num(g("ls"))}em`;
    self["text-transform"] = en("case", g("case"), "none") === "upper" ? "uppercase" : "none";
    self["text-align"] = en("ta", g("ta"), "left");
  };
  const k = (base = 16) => { self["--k"] = String(num(g("size"), base) / 16); };

  switch (T) {
    case "section": {
      let py = num(g("padY")), px = num(g("padX"));
      if (n.style.autoPad !== false) {
        if (vp === "mobile" && !overriddenAt(n, "padY", vp)) py = Math.round(py * 0.6);
        if (vp !== "desktop" && !overriddenAt(n, "padX", vp)) px = Math.min(px, vp === "mobile" ? 20 : 32);
      }
      self.padding = pad(py, px);
      const sticky = g("sticky") === true;
      self.position = sticky ? "sticky" : "";
      self.top = sticky ? "0" : "";
      self["z-index"] = sticky ? "5" : "";
      if (sticky && !bg) self.background = "var(--pf-bg)";
      parts.in = { "max-width": `${mw || t.maxW || 1120}px`, display: "flex", ...flexBox(en("dir", g("dir"), "column"), en("align", g("align"), "stretch")) };
      break;
    }
    case "container": {
      let px = num(g("padX"));
      if (vp === "mobile" && !overriddenAt(n, "padX", vp)) px = Math.min(px, 20);
      Object.assign(self, { ...flexBox(en("dir", g("dir"), "column"), en("align", g("align"), "stretch")), padding: pad(num(g("padY")), px), "border-radius": rad });
      if (mw) Object.assign(self, { "max-width": `${mw}px`, width: self.width || "100%", "margin-left": "auto", "margin-right": "auto" });
      break;
    }
    case "stack": {
      let dir = en("dir", g("dir"), "row");
      let al = en("align", g("align"), "center");
      if (vp === "mobile" && dir === "row" && n.style.autoStack !== false && !overriddenAt(n, "dir", vp)) {
        dir = "column";
        if (!overriddenAt(n, "align", vp)) al = "stretch";
      }
      Object.assign(self, { ...flexBox(dir, al), "flex-wrap": g("wrap") === false ? "nowrap" : "wrap", padding: pad(num(g("padY")), num(g("padX"))), "border-radius": rad });
      if (mw) self["max-width"] = `${mw}px`;
      break;
    }
    case "grid": {
      let cols = Math.max(1, Math.min(6, num(g("cols"), 3)));
      if (vp === "tablet" && !overriddenAt(n, "cols", vp)) cols = Math.min(cols, 2);
      if (vp === "mobile" && !overriddenAt(n, "cols", vp)) cols = 1;
      Object.assign(self, { "grid-template-columns": `repeat(${cols},minmax(0,1fr))`, gap: `${num(g("gap"))}px`, "align-items": AL[en("align", g("align"), "stretch")], padding: pad(num(g("padY")), num(g("padX"))), "border-radius": rad });
      break;
    }
    case "column":
      Object.assign(self, { ...flexBox("column", en("align", g("align"), "stretch")), padding: pad(num(g("padY")), num(g("padX"))), "border-radius": rad });
      if (mw) self["max-width"] = `${mw}px`;
      break;
    case "spacer": {
      let h = num(g("height"), 48);
      if (vp === "mobile" && !overriddenAt(n, "height", vp)) h = Math.round(h * 0.6);
      self.height = `${h}px`;
      break;
    }
    case "divider":
      Object.assign(self, { height: `${num(g("thick"), 1)}px`, background: bg || "var(--pf-line)" });
      break;
    case "heading":
      typo(num(g("size"), 32));
      if (mw) self["max-width"] = `${mw}px`;
      break;
    case "text":
      typo(num(g("size"), 17));
      if (mw) self["max-width"] = `${mw}px`;
      break;
    case "button": {
      typo(num(g("size"), 15));
      const v = n.props.variant || "filled";
      if (v === "filled") Object.assign(self, { background: bg || "var(--pf-accent)", color: color || "var(--pf-on)", padding: pad(num(g("padY")), num(g("padX"))), "border-radius": rad });
      else if (v === "outline") Object.assign(self, { background: bg || "transparent", color: color || "var(--pf-text)", padding: pad(Math.max(0, num(g("padY")) - 1.5), Math.max(0, num(g("padX")) - 1.5)), "border-radius": rad, border: self.border || "1.5px solid currentColor" });
      else Object.assign(self, { color: color || "var(--pf-accent)", padding: "0", background: "transparent" });
      break;
    }
    case "image": {
      const shape = n.props.shape || "rect";
      self["aspect-ratio"] = shape === "circle" ? "1/1" : n.props.ratio || "4/3";
      self["border-radius"] = shape === "circle" ? "50%" : shape === "square" ? "0" : rad;
      if (!self.width) self.width = "100%";
      break;
    }
    case "project":
      k();
      self["--r"] = rad;
      if (["outline", "card"].includes(n.props.variant || "card")) {
        const py = num(g("padY")), px = num(g("padX"));
        self.padding = n.props.variant === "outline" ? pad(py || 22, px || 22) : py || px ? pad(py, px) : "";
      }
      break;
    case "experience":
      k();
      if ((n.props.variant || "row") === "row") self["grid-template-columns"] = vp === "mobile" ? "minmax(0,1fr)" : "170px minmax(0,1fr)";
      parts.loc = { display: vp === "mobile" ? "none" : "" };
      break;
    case "skills":
    case "social": {
      k();
      const ta = en("ta", g("ta"), "left");
      self["text-align"] = ta;
      parts.row = { "justify-content": ta === "center" ? "center" : ta === "right" ? "flex-end" : "flex-start" };
      break;
    }
    case "contact": {
      k();
      const v = n.props.variant || "card";
      self["--r"] = `${Math.min(r, 32)}px`;
      self["--br"] = rad;
      if (v === "split") {
        self["grid-template-columns"] = vp === "mobile" ? "minmax(0,1fr)" : "minmax(0,1.3fr) minmax(0,1fr)";
        if (bg) self.padding = vp === "mobile" ? "24px" : "40px";
      } else if (v === "card") {
        self.padding = vp === "mobile" ? "24px" : "44px";
        if (!bg) self.background = "var(--pf-surface)";
      }
      parts.head = { "font-size": `calc(var(--k) * ${vp === "mobile" ? 27 : 36}px)` };
      break;
    }
  }
  return parts;
}

function collect(list: PNode[], c: Ctx, out: Map<string, Parts>) {
  for (const n of list) {
    out.set(n.id, partsFor(n, c));
    if (!n.kids.length) continue;
    const g = (k: string) => styleValue(n, k, c.vp, c.t);
    let dir = "column";
    let cols = 0;
    if (n.type === "stack") {
      dir = en("dir", g("dir"), "row");
      if (c.vp === "mobile" && dir === "row" && n.style.autoStack !== false && !overriddenAt(n, "dir", c.vp)) dir = "column";
    } else if (n.type === "grid") {
      dir = "grid";
      cols = Number((out.get(n.id)?.self["grid-template-columns"] ?? "").match(/repeat\((\d+)/)?.[1] ?? 1);
    } else if (n.type === "section" || n.type === "container") dir = en("dir", g("dir"), "column");
    collect(n.kids, { ...c, pdir: dir, pcols: cols }, out);
  }
}

const sel = (scope: string, id: string, part: string) => `[data-pf="${scope}"] .n-${id}${part === "self" ? "" : "-" + part}`;
const declText = (d: Decls) => Object.entries(d).filter(([, v]) => v !== "").map(([k, v]) => `${k}:${v}`).join(";");

/** Compile the size-dependent stylesheet for a document. */
export function compilePortfolioCss(doc: PortfolioDoc, scope: string): string {
  const per = VIEWPORTS.map((vp) => {
    const m = new Map<string, Parts>();
    collect(doc.root, { t: doc.theme, vp, pdir: "column", pcols: 0 }, m);
    return m;
  });
  const rules: string[][] = [[], [], []];
  for (const [id, base] of per[0]) {
    let prev = base;
    for (const [part, d] of Object.entries(base)) {
      const txt = declText(d);
      if (txt) rules[0].push(`${sel(scope, id, part)}{${txt}}`);
    }
    for (let v = 1; v < 3; v++) {
      const cur = per[v].get(id);
      if (!cur) continue;
      for (const part of new Set([...Object.keys(prev), ...Object.keys(cur)])) {
        const a = prev[part] ?? {}, b = cur[part] ?? {};
        const diff: string[] = [];
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const av = a[key] ?? "", bv = b[key] ?? "";
          if (av !== bv) diff.push(`${key}:${bv === "" ? "unset" : bv}`);
        }
        if (diff.length) rules[v].push(`${sel(scope, id, part)}{${diff.join(";")}}`);
      }
      prev = cur;
    }
  }
  return [
    rules[0].join(""),
    rules[1].length ? `@container pf (max-width:${TABLET_MAX}px){${rules[1].join("")}}` : "",
    rules[2].length ? `@container pf (max-width:${MOBILE_MAX}px){${rules[2].join("")}}` : "",
  ].join("").replace(/</g, "\\3c ");
}

export function themeVars(t: Theme): CSSProperties {
  return {
    "--pf-bg": safeColor(t.bg, "#ffffff"), "--pf-surface": safeColor(t.surface, "#f4f4f5"), "--pf-text": safeColor(t.text, "#111111"),
    "--pf-muted": safeColor(t.muted, "#666666"), "--pf-accent": safeColor(t.accent, "#111111"), "--pf-on": safeColor(t.onAccent, "#ffffff"),
    "--pf-line": safeColor(t.line, "rgba(0,0,0,0.12)"), "--pf-fh": FONT_STACK[t.fontHead] ?? FONT_STACK.hanken, "--pf-fb": FONT_STACK[t.fontBody] ?? FONT_STACK.hanken,
    "--pf-hw": String(t.headWeight || 600), "--pf-hw-s": String(Math.max(t.headWeight || 600, 500)), "--pf-hls": `${t.headLs ?? -0.02}em`,
  } as CSSProperties;
}

/* ---------------------------------------------------------------- tree ---- */

interface RCtx { edit: boolean; owner: PortfolioDoc["owner"] }

const ImageIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3h18v18H3zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01" />
  </svg>
);
const Missing = ({ label }: { label: string }) => <div className="pf-missing"><div><ImageIcon /><div>{label}</div></div></div>;
const Monogram = ({ initials }: { initials: string }) => (
  <svg viewBox="0 0 100 100" className="pf-fill" aria-hidden="true">
    <rect width="100" height="100" fill="var(--pf-accent)" />
    <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontWeight="600" fontSize="34" fill="var(--pf-on)" style={{ fontFamily: "var(--pf-fh)" }}>{initials || "?"}</text>
  </svg>
);

function nodeAttrs(n: PNode, x: RCtx, extra = "") {
  return { className: `n-${n.id}${extra ? " " + extra : ""}`, ...(x.edit ? { "data-nid": n.id } : {}) };
}

function kidsOf(n: PNode, x: RCtx): ReactNode {
  if (n.kids.length) return n.kids.map((k) => <Node key={k.id} n={k} x={x} />);
  if (!x.edit) return null;
  return <div className={`pf-empty${n.type === "section" ? " pf-empty-lg" : ""}`}>Empty {COMPONENTS[n.type].label.toLowerCase()}. Select it, then add components.</div>;
}

function Node({ n, x }: { n: PNode; x: RCtx }): ReactNode {
  const p = n.props;
  const a = (extra?: string) => nodeAttrs(n, x, extra);
  switch (n.type) {
    case "section":
      return <section {...a("pf-section")} id={p.anchor || undefined}><div className={`n-${n.id}-in pf-section-in`}>{kidsOf(n, x)}</div></section>;
    case "container": case "stack": case "grid": case "column":
      return <div {...a("pf-box")}>{kidsOf(n, x)}</div>;
    case "spacer":
      return <div {...a(x.edit ? "pf-spacer pf-spacer-edit" : "pf-spacer")} aria-hidden="true" />;
    case "divider":
      return <div {...a("pf-divider")} role="separator" />;
    case "heading": {
      const lv = Math.min(3, Math.max(1, p.level || 2));
      const lines = String(p.text ?? "").split("\n");
      const content = lines.flatMap((l, i) => (i ? [<br key={i} />, l] : [l]));
      if (lv === 1) return <h1 {...a("pf-heading")}>{content}</h1>;
      if (lv === 2) return <h2 {...a("pf-heading")}>{content}</h2>;
      return <h3 {...a("pf-heading")}>{content}</h3>;
    }
    case "text":
      return <div {...a("pf-md")}>{renderMarkdown(p.text ?? "")}</div>;
    case "button":
      return <a {...a(`pf-btn pf-btn-${p.variant || "filled"}`)} href={safeHref(p.href || "#")} {...(p.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{p.label}</a>;
    case "image": {
      const src = imageSrc(p.src);
      const avatar = (p.shape || "rect") === "circle";
      if (!src && !avatar && !x.edit) return null;
      return (
        <figure {...a("pf-figure")}>
          {src ? <img src={src} alt={p.alt || ""} className="pf-fill pf-cover" loading="lazy" decoding="async" />
            : avatar ? <><Monogram initials={x.owner.initials} />{x.edit && <span className="pf-nophoto">No photo · add one</span>}</>
              : <Missing label="Add an image" />}
        </figure>
      );
    }
    case "project": return <Project n={n} x={x} />;
    case "experience": {
      const v = p.variant || "row";
      const role = <div className="pf-exp-role">{p.role}{p.company && <span className="pf-muted pf-exp-co"> · {p.company}</span>}</div>;
      const desc = p.desc ? <p className="pf-exp-desc">{renderInline(p.desc)}</p> : null;
      if (v === "stacked") return <div {...a("pf-exp pf-exp-stacked")}><div className="pf-exp-meta">{p.period}{p.location ? ` · ${p.location}` : ""}</div>{role}{desc}</div>;
      return <div {...a("pf-exp pf-exp-row")}><div className="pf-exp-period">{p.period}{p.location && <span className={`n-${n.id}-loc`}><br />{p.location}</span>}</div><div>{role}{desc}</div></div>;
    }
    case "skills": {
      const v = p.variant || "chips";
      const items = (p.items ?? []).filter(Boolean);
      return (
        <div {...a("pf-skills")}>
          {p.title && <div className="pf-label">{p.title}</div>}
          {v === "list" ? <ul className="pf-skill-list">{items.map((s, i) => <li key={i}><span aria-hidden="true">—</span>{s}</li>)}</ul>
            : v === "inline" ? <p className="pf-skill-inline">{items.map((s, i) => <span key={i}>{i > 0 && <span className="pf-muted"> / </span>}{s}</span>)}</p>
              : <div className={`pf-chips n-${n.id}-row`}>{items.map((s, i) => <span key={i} className="pf-chip">{s}</span>)}</div>}
        </div>
      );
    }
    case "social": {
      const v = p.variant || "text";
      const links = (p.links ?? []).filter((l) => l.label);
      const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/^mailto:/, "").replace(/\/.*$/, "");
      return (
        <div {...a(`pf-social pf-social-${v}`)}>
          <div className={`pf-social-row n-${n.id}-row`}>
            {links.map((l, i) => (
              <a key={i} className="pf-link" href={safeHref(l.url || "#")} target="_blank" rel="noopener noreferrer">
                {l.label}
                {v === "pills" && <span aria-hidden="true" className="pf-arrow"> ↗</span>}
                {v === "list" && <span className="pf-muted">{host(l.url)} ↗</span>}
              </a>
            ))}
          </div>
        </div>
      );
    }
    case "contact": {
      const v = p.variant || "card";
      const head = <h2 className={`pf-contact-head n-${n.id}-head`}>{p.heading}</h2>;
      const txt = p.text ? <p className="pf-contact-text">{renderInline(p.text)}</p> : null;
      const info = (
        <div className="pf-contact-info">
          {p.availability && <span className="pf-avail"><span className="pf-avail-dot" />{p.availability}</span>}
          <div className="pf-contact-meta">
            {p.email && <a className="pf-link pf-contact-email" href={`mailto:${p.email}`}>{p.email}</a>}
            {p.location && <span>{p.location}</span>}
          </div>
          {p.button && p.email && <a className="pf-contact-btn" href={`mailto:${p.email}`}>{p.button}</a>}
        </div>
      );
      if (v === "split") return <div {...a("pf-contact pf-contact-split")}><div className="pf-contact-copy">{head}{txt}</div>{info}</div>;
      return <div {...a(`pf-contact pf-contact-${v}`)}>{head}{txt}{info}</div>;
    }
  }
}

function Project({ n, x }: { n: PNode; x: RCtx }) {
  const p = n.props;
  const v = p.variant || "card";
  const tags = (p.tags ?? []).filter(Boolean);
  const ratio = p.ratio || "4/3";
  const src = imageSrc(p.img);
  const letter = String(p.title || "·").replace(/^[^A-Za-z0-9]+/, "").charAt(0).toUpperCase();
  const cover = (
    <div className="pf-cover-box" style={{ aspectRatio: ratio }}>
      {src ? <img src={src} alt="" className="pf-fill pf-cover" loading="lazy" decoding="async" />
        : x.edit ? <Missing label="Add a project image" />
          : <div className="pf-typo-cover" aria-hidden="true"><span>{letter}</span></div>}
    </div>
  );
  const meta = [p.role, p.year].filter(Boolean).join(" · ");
  const title = <h3 className="pf-proj-title">{p.title}</h3>;
  const sum = p.summary ? <p className="pf-proj-sum">{renderInline(p.summary)}</p> : null;
  const link = p.href ? <a className="pf-link pf-proj-link" href={safeHref(p.href)}>{p.linkLabel || "View case study"} →</a> : null;
  const attrs = nodeAttrs(n, x, `pf-proj pf-proj-${v}`);
  if (v === "list") return <article {...attrs}>{title}<span className="pf-proj-year">{p.year}</span>{sum && <div className="pf-span-all">{sum}</div>}{link && <div className="pf-span-all">{link}</div>}</article>;
  if (v === "overlay") return <article {...attrs}>{cover}<div className="pf-proj-caption"><span className="pf-proj-name">{p.title}</span><span className="pf-muted">{meta}</span></div>{sum}{link}</article>;
  if (v === "outline") return <article {...attrs}><div className="pf-proj-top"><span className="pf-accent">{p.year}</span><span>{tags.join(" · ")}</span></div>{title}{sum}{link}</article>;
  return (
    <article {...attrs}>
      {cover}
      <div className="pf-proj-body">
        {meta && <div className="pf-proj-meta">{meta}</div>}
        {title}{sum}
        {tags.length > 0 && <div className="pf-tags">{tags.map((tg, i) => <span key={i}>{tg}</span>)}</div>}
        {link}
      </div>
    </article>
  );
}

/**
 * Render a portfolio. `scope` must be unique on the page (it namespaces the
 * stylesheet); `edit` adds selection hooks and empty-state placeholders.
 */
export function PortfolioView({ doc, scope = "pf", edit = false, className = "" }: { doc: PortfolioDoc; scope?: string; edit?: boolean; className?: string }) {
  const css = compilePortfolioCss(doc, scope);
  const x: RCtx = { edit, owner: doc.owner };
  return (
    <div className={`pf-root ${className}`} data-pf={scope} style={themeVars(doc.theme)}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={`pf-page${edit ? " pf-edit" : ""}`}>
        {doc.root.map((n) => <Node key={n.id} n={n} x={x} />)}
      </div>
    </div>
  );
}

