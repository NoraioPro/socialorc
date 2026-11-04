import { THEME_PRESETS } from "@/lib/portfolio/templates";
import { COMPONENTS, countH1, initialsOf, isBox, locate, type Located, nodeName, setStyle, walk } from "@/lib/portfolio/model";
import { num, str, styleValue } from "@/lib/portfolio/resolve";
import type { FontKey, PNode, PortfolioDoc, StyleValue, Theme, Viewport } from "@/lib/portfolio/types";
import { VIEWPORT_LABEL } from "@/lib/portfolio/types";
import { cssColor, FONT_NAME, FONT_STACK } from "../render";
import type { Field, Group } from "./fields";

/**
 * Which inspector fields a component (or the page) shows, per tab. Ported from
 * the design prototype; every setter goes through `edit` so undo, autosave and
 * the change log see it.
 */

export type InspectorTab = "content" | "layout" | "style" | "responsive";

export interface InspectorApi {
  doc: PortfolioDoc;
  vp: Viewport;
  tab: InspectorTab;
  handle: string;
  uploading: boolean;
  edit: (fn: (d: PortfolioDoc) => void, label: string, coalesceKey?: string) => void;
  setVp: (vp: Viewport) => void;
  openMarkdown: (id: string) => void;
  openComponents: () => void;
  upload: (file: File, apply: (url: string) => void) => void;
}

const WN: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Black" };
const FONT_OPTS = (Object.keys(FONT_STACK) as FontKey[]).map((k) => ({ value: k, label: FONT_NAME[k], family: FONT_STACK[k] }));
const PROPN: Record<string, string> = { size: "Text size", dir: "Direction", width: "Width", cols: "Columns", padY: "Padding top & bottom", padX: "Side padding", gap: "Gap", align: "Align", justify: "Distribute", weight: "Weight", lh: "Line height", ls: "Letter spacing", ta: "Text align", bg: "Background", color: "Text colour", mt: "Space above", mb: "Space below", radius: "Corner radius", maxW: "Max width", height: "Height", opacity: "Opacity", shadow: "Shadow", font: "Font", case: "Case", border: "Border", span: "Column span", sticky: "Sticky", accent: "Accent", thick: "Thickness", wrap: "Wrap", borderColor: "Border colour" };
const SUGG: Record<string, string[]> = {
  bg: ["#FFFFFF", "#F6F3EC", "#F5F3EF", "#131317", "#0D0F0C", "#B83D0B"], surface: ["#FFFFFF", "#F3F3F1", "#EDE7DB", "#1B1B21", "#151913", "#9E3409"],
  text: ["#111111", "#17171C", "#1C1B18", "#EDEDF1", "#D6E3CF", "#FFF4E6"], muted: ["#636363", "#62626B", "#655F55", "#A6A6B0", "#8C9985", "#FFDCC2"],
  accent: ["#2E3E8F", "#2D4BFF", "#B4441F", "#0F766E", "#F2B33D", "#48ED85"], onAccent: ["#FFFFFF", "#06140B", "#0D0F0C", "#8F2E07"],
};
const fmtVal = (v: StyleValue) => (typeof v === "number" ? (Math.abs(v) < 3 && v % 1 !== 0 ? v.toFixed(2) : String(v)) : typeof v === "boolean" ? (v ? "on" : "off") : String(v));
const toHex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "");
const THEME_SW: [string, string][] = [["", "None"], ["bg", "Page background"], ["surface", "Surface"], ["text", "Text"], ["muted", "Muted text"], ["accent", "Accent"]];

function colorField(label: string, value: string, theme: Theme, set: (v: string | null) => void, opts: { list?: [string, string][]; none?: string; ov?: boolean; reset?: () => void } = {}): Field {
  const list = opts.list ?? THEME_SW;
  const resolved = value && value in theme ? String(theme[value as keyof Theme]) : value;
  return {
    kind: "color", label, value, ov: opts.ov, reset: opts.reset, onChange: set,
    swatches: list.map(([v, title]) => ({ value: v, title, css: v ? (v in theme ? String(theme[v as keyof Theme]) : cssColor(v) || v) : "repeating-linear-gradient(135deg,#3A3A44 0 3px,#16161B 3px 6px)" })),
    hex: toHex(resolved) || "#888888",
    hexText: !value ? opts.none ?? "None" : value.startsWith("#") ? value.toUpperCase() : value.startsWith("rgb") ? "Custom" : `Theme · ${value}`,
  };
}

export function pageGroups(api: InspectorApi): Group[] {
  const { doc, tab } = api;
  const t = doc.theme;
  const setT = <K extends keyof Theme>(k: K, label: string) => (v: Theme[K]) => api.edit((d) => { d.theme[k] = v; }, label, "t" + String(k));
  if (tab === "content") {
    const title = doc.seo.title;
    return [
      { title: "Search & sharing", fields: [
        { kind: "text", label: "Page title", value: title, onChange: (v) => api.edit((d) => { d.seo.title = v; }, "Edited the page title", "seot"), warn: title.length > 60 ? `Search results show about 60 characters; this is ${title.length}.` : undefined },
        { kind: "area", label: "Description", value: doc.seo.desc, rows: 3, onChange: (v) => api.edit((d) => { d.seo.desc = v; }, "Edited the page description", "seod"), hint: `${doc.seo.desc.length} / 160 characters. Shown in search results and link previews.` },
      ] },
      { title: "Address", fields: [{ kind: "note", text: `socialork.com/p/${api.handle} · change it from the portfolio dashboard. The old link keeps redirecting for 30 days.` }] },
      { title: "Monogram", fields: [{ kind: "text", label: "Your name", value: doc.owner.name, onChange: (v) => api.edit((d) => { d.owner = { name: v, initials: initialsOf(v) }; }, "Changed the owner name", "own"), hint: `Shown as ${doc.owner.initials} wherever there’s no profile photo.` }] },
    ];
  }
  if (tab === "layout") {
    const space = t.space <= 0.85 ? "compact" : t.space >= 1.2 ? "airy" : "comfortable";
    return [{ title: "Page", fields: [
      { kind: "range", label: "Content width", value: t.maxW, min: 640, max: 1440, step: 20, display: `${t.maxW}px`, onChange: setT("maxW", "Changed the content width") },
      { kind: "seg", label: "Spacing", value: space, options: [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }, { value: "airy", label: "Airy" }], onChange: (v) => setT("space", "Changed page spacing")(v === "compact" ? 0.8 : v === "airy" ? 1.3 : 1) },
      { kind: "note", text: "Every section uses this width and spacing unless you change it on that section." },
    ] }];
  }
  if (tab === "style") {
    return [
      { title: "Theme presets", fields: [
        { kind: "presets", items: THEME_PRESETS.map((p) => ({ name: p.name, bg: p.theme.bg!, fg: p.theme.text!, accent: p.theme.accent!, family: FONT_STACK[p.theme.fontHead as FontKey], weight: p.theme.headWeight ?? 600, apply: () => api.edit((d) => { Object.assign(d.theme, p.theme); }, `Applied the ${p.name} theme`) })) },
        { kind: "note", text: "Presets change colours and fonts only. Your content and layout stay put." },
      ] },
      { title: "Colours", fields: (["bg", "surface", "text", "muted", "accent", "onAccent"] as const).map((k) => {
        const label = { bg: "Background", surface: "Surface", text: "Text", muted: "Muted text", accent: "Accent", onAccent: "Text on accent" }[k];
        return colorField(label, t[k], t, (v) => { if (v) setT(k, `Changed the ${label.toLowerCase()} colour`)(v); }, { list: SUGG[k].map((h) => [h, h]) });
      }) },
      { title: "Fonts", fields: [
        { kind: "font", label: "Headings", value: t.fontHead, options: FONT_OPTS, onChange: (v) => setT("fontHead", "Changed the heading font")(v as FontKey) },
        { kind: "range", label: "Heading weight", value: t.headWeight, min: 300, max: 800, step: 100, display: WN[t.headWeight] ?? String(t.headWeight), onChange: setT("headWeight", "Changed the heading weight") },
        { kind: "range", label: "Heading letter spacing", value: t.headLs, min: -0.08, max: 0.05, step: 0.005, display: `${t.headLs.toFixed(3)}em`, onChange: setT("headLs", "Changed heading spacing") },
        { kind: "font", label: "Body text", value: t.fontBody, options: FONT_OPTS, onChange: (v) => setT("fontBody", "Changed the body font")(v as FontKey) },
      ] },
      { title: "Shape", fields: [{ kind: "range", label: "Corner radius", value: Math.min(t.radius, 64), min: 0, max: 64, display: t.radius >= 64 ? "Pill" : `${t.radius}px`, onChange: setT("radius", "Changed the corner radius") }] },
    ];
  }
  const items: { vp: string; label: string; value: string; reset: () => void }[] = [];
  walk(doc.root, (n) => {
    (["tablet", "mobile"] as const).forEach((d) => {
      Object.entries(n.resp[d]).forEach(([k, v]) => items.push({ vp: VIEWPORT_LABEL[d], label: `${nodeName(n)} · ${PROPN[k] ?? k}`, value: fmtVal(v), reset: () => api.edit((dd) => { const m = locate(dd, n.id); if (m) delete m.n.resp[d][k]; }, `Reset a ${VIEWPORT_LABEL[d].toLowerCase()} override`) }));
      if (n.hide[d]) items.push({ vp: VIEWPORT_LABEL[d], label: `${nodeName(n)} · Hidden`, value: "", reset: () => api.edit((dd) => { const m = locate(dd, n.id); if (m) m.n.hide[d] = false; }, `Showed ${nodeName(n)}`) });
    });
  });
  return [
    { title: "Editing for", fields: [vpSeg(api), { kind: "note", tone: "info", text: "Desktop is 1024px and wider, tablet 640–1023px, phone below 640px. You design on desktop; tablet and phone inherit it until you override something there." }] },
    { title: "All overrides on this page", fields: [{ kind: "overrides", items, empty: "No overrides yet." }] },
  ];
}

const vpSeg = (api: InspectorApi): Field => ({ kind: "seg", label: "", value: api.vp, options: [{ value: "desktop", label: "Desktop" }, { value: "tablet", label: "Tablet" }, { value: "mobile", label: "Phone" }], onChange: (v) => api.setVp(v as Viewport) });

export function nodeGroups(api: InspectorApi, loc: Located): Group[] {
  const { doc, vp, tab } = api;
  const n = loc.n, t = doc.theme, T = n.type, p = n.props, id = n.id;
  const g = (k: string) => styleValue(n, k, vp, t);
  const box = isBox(T);
  const textish = T === "heading" || T === "text" || T === "button";
  const pro = ["project", "experience", "skills", "social", "contact"].includes(T);
  const label = COMPONENTS[T].label.toLowerCase();
  const mut = (fn: (m: PNode) => void, lab: string, key?: string) => api.edit((d) => { const m = locate(d, id); if (m) fn(m.n); }, lab, key);
  const setP = <K extends keyof PNode["props"]>(k: K, lab?: string) => (v: PNode["props"][K]) => mut((m) => { m.props[k] = v; }, lab ?? `Edited ${label}`, `p${id}${String(k)}`);
  const setS = (k: string) => (v: StyleValue | null) => mut((m) => setStyle(m, vp, k, v), vp === "desktop" ? `Restyled ${nodeName(n)}` : `Adjusted the ${VIEWPORT_LABEL[vp].toLowerCase()} layout of ${nodeName(n)}`, `s${id}${k}${vp}`);
  const O = (k: string) => ({ ov: vp !== "desktop" && k in n.resp[vp], reset: () => setS(k)(null) });
  const upload = (apply: (url: string) => void) => (file: File) => api.upload(file, apply);
  const range = (lab: string, k: string, min: number, max: number, step = 1, fmt?: (v: number) => string): Field => {
    const v = num(g(k));
    return { kind: "range", label: lab, value: v, min, max, step, display: fmt ? fmt(v) : `${v}px`, onChange: setS(k), ...O(k) };
  };
  const seg = (lab: string, k: string, opts: [string, string][]): Field => ({ kind: "seg", label: lab, value: str(g(k)), options: opts.map(([value, l]) => ({ value, label: l })), onChange: (v) => setS(k)(String(v)), ...O(k) });
  const G: Group[] = [];

  if (tab === "content") {
    if (T === "section") {
      G.push({ title: "Section", fields: [
        { kind: "text", label: "Name in layers", value: p.label ?? "", onChange: setP("label", "Renamed a section") },
        { kind: "text", label: "Anchor", value: p.anchor ?? "", placeholder: "e.g. work", onChange: (v) => setP("anchor")(v.toLowerCase().replace(/[^a-z0-9-]/g, "-")), hint: p.anchor ? `Buttons linking to #${p.anchor} scroll here.` : "Lets buttons and your header link to this section." },
      ] });
      G.push({ title: "Inside", fields: [n.kids.length ? { kind: "note", text: `${n.kids.length} direct ${n.kids.length > 1 ? "children" : "child"}. Select one on the canvas or in Layers to edit it.` } : { kind: "note", tone: "info", text: "Empty. Components you add now go inside this section.", action: { label: "Open components", run: api.openComponents } }] });
    } else if (box) {
      G.push({ title: COMPONENTS[T].label, fields: [
        { kind: "text", label: "Name in layers", value: n.name, placeholder: COMPONENTS[T].label, onChange: (v) => mut((m) => { m.name = v; }, "Renamed a layer", `nm${id}`) },
        { kind: "note", text: `${COMPONENTS[T].desc} Arrange its contents in Layout.` },
      ] });
    } else if (T === "heading") {
      const f: Field[] = [
        { kind: "area", label: "Text", value: p.text ?? "", rows: 3, onChange: setP("text"), hint: "Or double-click the heading on the canvas to type in place." },
        { kind: "seg", label: "Level", value: p.level ?? 2, options: [{ value: 1, label: "H1", title: "Page title" }, { value: 2, label: "H2", title: "Section title" }, { value: 3, label: "H3", title: "Small title" }], onChange: (v) => setP("level", "Changed a heading level")(Number(v)) },
      ];
      const h1 = countH1(doc);
      if (h1 > 1 && p.level === 1) f.push({ kind: "note", tone: "warn", text: `This page has ${h1} H1 headings. Search engines and screen readers expect one.` });
      G.push({ title: "Heading", fields: f });
    } else if (T === "text") {
      G.push({ title: "Text · Markdown", fields: [
        { kind: "note", tone: "info", text: "Supports **bold**, *italic*, [links](url), ## headings, - lists and > quotes.", action: { label: "Open the Markdown editor", run: () => api.openMarkdown(id) } },
        { kind: "area", label: "Markdown", value: p.text ?? "", rows: 9, mono: true, onChange: setP("text"), hint: "Double-click the text on the canvas to open the full editor with live preview." },
      ] });
    } else if (T === "button") {
      G.push({ title: "Button", fields: [
        { kind: "text", label: "Label", value: p.label ?? "", onChange: setP("label") },
        { kind: "text", label: "Link", value: p.href ?? "", placeholder: "https://, mailto: or #section", onChange: setP("href"), hint: "#work scrolls to the section with that anchor." },
        { kind: "seg", label: "Style", value: p.variant ?? "filled", options: [{ value: "filled", label: "Filled" }, { value: "outline", label: "Outline" }, { value: "link", label: "Link" }], onChange: (v) => setP("variant", "Changed a button style")(String(v)) },
        { kind: "toggle", label: "Open in a new tab", on: !!p.newTab, onChange: setP("newTab") },
      ] });
    } else if (T === "image") {
      G.push({ title: "Image", fields: [
        { kind: "image", label: "Image", value: p.src ?? null, onChange: setP("src", "Changed an image"), onUpload: upload((url) => setP("src", "Uploaded an image")(url)), uploading: api.uploading },
        { kind: "text", label: "Alt text", value: p.alt ?? "", placeholder: "Describe the image for screen readers", onChange: setP("alt"), warn: p.src && !p.alt ? "Add alt text so screen readers can describe this image." : undefined },
        { kind: "seg", label: "Shape", value: p.shape ?? "rect", options: [{ value: "rect", label: "Rounded" }, { value: "square", label: "Square" }, { value: "circle", label: "Circle" }], onChange: (v) => setP("shape", "Changed an image shape")(String(v)) },
        { kind: "seg", label: "Aspect ratio", value: p.ratio ?? "4/3", options: ["1/1", "4/5", "4/3", "16/9"].map((r) => ({ value: r, label: r.replace("/", ":") })), onChange: (v) => setP("ratio", "Changed an aspect ratio")(String(v)) },
      ] });
    } else if (T === "project") {
      G.push({ title: "Project", fields: [
        { kind: "text", label: "Title", value: p.title ?? "", onChange: setP("title") },
        { kind: "text", label: "Role or client", value: p.role ?? "", placeholder: "e.g. Fjord Co · Lead designer", onChange: setP("role") },
        { kind: "text", label: "Year", value: p.year ?? "", onChange: setP("year") },
        { kind: "area", label: "Summary", value: p.summary ?? "", rows: 3, onChange: setP("summary"), hint: "**bold**, *italic* and [links](url) work here." },
        { kind: "text", label: "Tags", value: p.tagsText ?? (p.tags ?? []).join(", "), onChange: (v) => mut((m) => { m.props.tagsText = v; m.props.tags = v.split(",").map((x) => x.trim()).filter(Boolean); }, "Edited project tags", `p${id}tags`), hint: "Separate with commas." },
        { kind: "text", label: "Link", value: p.href ?? "", placeholder: "Case study or live project URL", onChange: setP("href") },
        { kind: "text", label: "Link text", value: p.linkLabel ?? "View case study", onChange: setP("linkLabel") },
      ] });
      const cover: Field[] = [
        { kind: "image", label: "Cover image", value: p.img ?? null, onChange: setP("img", "Changed a project image"), onUpload: upload((url) => setP("img", "Uploaded a project image")(url)), uploading: api.uploading },
        { kind: "seg", label: "Cover ratio", value: p.ratio ?? "4/3", options: ["1/1", "4/3", "16/9", "21/9"].map((r) => ({ value: r, label: r.replace("/", ":") })), onChange: (v) => setP("ratio")(String(v)) },
      ];
      if (!p.img) cover.push({ kind: "note", tone: "info", text: "No image: visitors see a typographic cover in your accent colour." });
      G.push({ title: "Cover", fields: cover });
      G.push({ title: "Display", fields: [{ kind: "seg", label: "Layout", value: p.variant ?? "card", options: [{ value: "card", label: "Card" }, { value: "overlay", label: "Gallery" }, { value: "list", label: "List" }, { value: "outline", label: "Outline" }], onChange: (v) => setP("variant", "Changed a project layout")(String(v)) }] });
    } else if (T === "experience") {
      G.push({ title: "Experience", fields: [
        { kind: "text", label: "Role", value: p.role ?? "", onChange: setP("role") },
        { kind: "text", label: "Company", value: p.company ?? "", onChange: setP("company") },
        { kind: "text", label: "Dates", value: p.period ?? "", placeholder: "2023 — now", onChange: setP("period") },
        { kind: "text", label: "Location", value: p.location ?? "", placeholder: "Optional", onChange: setP("location") },
        { kind: "area", label: "What you did", value: p.desc ?? "", rows: 3, onChange: setP("desc") },
        { kind: "seg", label: "Layout", value: p.variant ?? "row", options: [{ value: "row", label: "Dates left" }, { value: "stacked", label: "Stacked" }], onChange: (v) => setP("variant", "Changed an experience layout")(String(v)) },
      ] });
    } else if (T === "skills") {
      G.push({ title: "Skill group", fields: [
        { kind: "text", label: "Group title", value: p.title ?? "", onChange: setP("title") },
        { kind: "area", label: "Skills", value: p.itemsText ?? (p.items ?? []).join("\n"), rows: 5, onChange: (v) => mut((m) => { m.props.itemsText = v; m.props.items = v.split("\n").map((x) => x.trim()).filter(Boolean); }, "Edited skills", `p${id}items`), hint: "One skill per line." },
        { kind: "seg", label: "Display", value: p.variant ?? "chips", options: [{ value: "chips", label: "Chips" }, { value: "list", label: "List" }, { value: "inline", label: "Inline" }], onChange: (v) => setP("variant", "Changed a skills display")(String(v)) },
      ] });
    } else if (T === "social") {
      G.push({ title: "Links", fields: [
        { kind: "links", items: p.links ?? [], onChange: (items) => mut((m) => { m.props.links = items; }, "Edited social links", `links${id}`) },
        { kind: "seg", label: "Display", value: p.variant ?? "text", options: [{ value: "text", label: "Text" }, { value: "pills", label: "Pills" }, { value: "list", label: "List" }], onChange: (v) => setP("variant", "Changed a social links display")(String(v)) },
      ] });
    } else if (T === "contact") {
      G.push({ title: "Contact", fields: [
        { kind: "text", label: "Heading", value: p.heading ?? "", onChange: setP("heading") },
        { kind: "area", label: "Message", value: p.text ?? "", rows: 3, placeholder: "Optional", onChange: setP("text") },
        { kind: "text", label: "Email", value: p.email ?? "", onChange: setP("email") },
        { kind: "text", label: "Location", value: p.location ?? "", placeholder: "Optional", onChange: setP("location") },
        { kind: "text", label: "Availability", value: p.availability ?? "", placeholder: "e.g. Open to new projects", onChange: setP("availability") },
        { kind: "text", label: "Button label", value: p.button ?? "", placeholder: "Leave empty to hide the button", onChange: setP("button") },
        { kind: "seg", label: "Layout", value: p.variant ?? "card", options: [{ value: "card", label: "Card" }, { value: "split", label: "Split" }, { value: "plain", label: "Plain" }], onChange: (v) => setP("variant", "Changed a contact layout")(String(v)) },
      ] });
    } else {
      G.push({ title: COMPONENTS[T].label, fields: [{ kind: "note", text: T === "spacer" ? "Set its height in Layout. On phones it shrinks automatically." : "Set its colour in Style and its thickness in Layout." }] });
    }
    return G;
  }

  if (tab === "layout") {
    const size: Field[] = [];
    if (T !== "section" && T !== "spacer") {
      const w = g("width");
      size.push({ kind: "seg", label: "Width", value: typeof w === "number" ? "fixed" : str(w, "fill"), options: [{ value: "fill", label: "Fill" }, { value: "hug", label: "Fit content" }, { value: "fixed", label: "Fixed" }], onChange: (v) => setS("width")(v === "fixed" ? (typeof w === "number" ? w : 320) : String(v)), ...O("width") });
      if (typeof w === "number") size.push(range("Fixed width", "width", 80, 1200, 4));
    }
    if (T === "section") size.push(range("Content width", "maxW", 480, 1440, 20));
    else if (["container", "stack", "column", "heading", "text"].includes(T)) size.push(range("Max width", "maxW", 0, 1200, 20, (v) => (v ? `${v}px` : "None")));
    if (loc.parent?.type === "grid") {
      const pc = num(styleValue(loc.parent, "cols", "desktop", t), 3);
      size.push({ kind: "step", label: "Column span", value: Math.min(num(g("span"), 1), pc), min: 1, max: pc, onChange: setS("span"), ...O("span") });
    }
    if (size.length) G.push({ title: "Size", fields: size });
    if (box) {
      const A: Field[] = [];
      if (T === "grid") A.push({ kind: "step", label: "Columns", value: num(g("cols"), 3), min: 1, max: 6, onChange: setS("cols"), ...O("cols") });
      else A.push(seg("Direction", "dir", [["column", "Vertical"], ["row", "Horizontal"]]));
      A.push(seg("Align", "align", [["start", "Start"], ["center", "Center"], ["end", "End"], ["stretch", "Stretch"]]));
      if (T !== "grid") A.push(seg("Distribute", "justify", [["start", "Start"], ["center", "Center"], ["end", "End"], ["between", "Spread"]]));
      A.push(range("Gap", "gap", 0, 160, 2));
      if (T === "stack") A.push({ kind: "toggle", label: "Wrap onto new lines", on: g("wrap") !== false, onChange: (v) => setS("wrap")(v) });
      G.push({ title: T === "grid" ? "Grid" : "Arrangement", fields: A });
    }
    if (textish || pro) G.push({ title: "Alignment", fields: [seg("Text align", "ta", [["left", "Left"], ["center", "Center"], ["right", "Right"]])] });
    const S: Field[] = [];
    if (T === "spacer") S.push(range("Height", "height", 8, 320, 4));
    if (T === "divider") S.push(range("Thickness", "thick", 1, 8));
    if (box || T === "button" || (T === "project" && (p.variant === "outline" || !p.variant || p.variant === "card"))) {
      S.push(range("Padding · top & bottom", "padY", 0, T === "section" ? 240 : 120, 2), range("Padding · sides", "padX", 0, T === "section" ? 160 : 96, 2));
    }
    S.push(range("Space above", "mt", 0, 160, 2), range("Space below", "mb", 0, 160, 2));
    G.push({ title: "Spacing", fields: S });
    if (T === "section") G.push({ title: "Position", fields: [
      { kind: "seg", label: "When scrolling", value: g("sticky") === true ? "sticky" : "flow", options: [{ value: "flow", label: "Scrolls away" }, { value: "sticky", label: "Sticks to top" }], onChange: (v) => setS("sticky")(v === "sticky"), ...O("sticky") },
      { kind: "note", text: "Sticky works best on a slim header section." },
    ] });
    return G;
  }

  if (tab === "style") {
    if (T !== "spacer") {
      const cf: Field[] = [];
      if (T === "divider") cf.push(colorField("Line colour", str(g("bg"), "line"), t, setS("bg"), { list: [["line", "Line"], ["text", "Text"], ["muted", "Muted"], ["accent", "Accent"]], ...O("bg") }));
      else {
        cf.push(colorField(T === "button" ? "Button fill" : "Background", str(g("bg")), t, setS("bg"), O("bg")));
        if (T !== "image") cf.push(colorField("Text colour", str(g("color")), t, setS("color"), { none: "Inherited", ...O("color") }));
      }
      if (T === "button" || pro || box) cf.push(colorField("Accent", str(g("accent")), t, setS("accent"), { list: [["", "Page accent"], ["text", "Text"], ["muted", "Muted"]], none: "Page accent", ...O("accent") }));
      G.push({ title: "Colour", fields: cf });
    }
    if (textish || pro) {
      const ty: Field[] = [{ kind: "font", label: "Font", value: str(g("font"), "body"), options: [{ value: "head", label: "Page heading font", family: FONT_STACK[t.fontHead] }, { value: "body", label: "Page body font", family: FONT_STACK[t.fontBody] }, ...FONT_OPTS], onChange: (v) => setS("font")(v), ...O("font") }];
      if (pro) ty.push(range("Scale", "size", 10, 28, 1, (v) => `${Math.round((v / 16) * 100)}%`));
      else ty.push(
        range("Size", "size", 10, 180),
        range("Weight", "weight", 300, 800, 100, (v) => `${WN[v] ?? v} · ${v}`),
        range("Line height", "lh", 0.8, 2.2, 0.02, (v) => v.toFixed(2)),
        range("Letter spacing", "ls", -0.08, 0.2, 0.005, (v) => `${v.toFixed(3)}em`),
        seg("Case", "case", [["none", "Aa  As typed"], ["upper", "AA  Uppercase"]]),
      );
      G.push({ title: "Typography", fields: ty });
    }
    const bd: Field[] = [range("Border", "border", 0, 8)];
    if (num(g("border"))) bd.push(colorField("Border colour", str(g("borderColor"), "line"), t, setS("borderColor"), { list: [["line", "Line"], ["text", "Text"], ["muted", "Muted"], ["accent", "Accent"]] }));
    if (!["heading", "text", "divider", "spacer"].includes(T)) bd.push(range("Corner radius", "radius", 0, 64, 1, (v) => (v >= 64 ? "Pill" : `${v}px`)));
    G.push({ title: "Border & corners", fields: bd });
    G.push({ title: "Effects", fields: [seg("Shadow", "shadow", [["none", "None"], ["soft", "Soft"], ["lift", "Lifted"], ["hard", "Hard"]]), range("Opacity", "opacity", 10, 100, 1, (v) => `${v}%`)] });
    return G;
  }

  G.push({ title: "Editing for", fields: [vpSeg(api), { kind: "note", tone: "info", text: vp === "desktop" ? "Desktop is the base design. Tablet and phone inherit it unless you override a value there." : vp === "tablet" ? "Layout and style changes now apply to tablet and phone. Desktop stays as it is." : "Layout and style changes now apply to phones only." }] });
  G.push({ title: "Visibility", fields: (["desktop", "tablet", "mobile"] as Viewport[]).map((d) => ({ kind: "toggle" as const, label: `Show on ${VIEWPORT_LABEL[d].toLowerCase()}`, on: !n.hide[d], onChange: (v: boolean) => mut((m) => { m.hide[d] = !v; }, `${v ? "Showed" : "Hid"} ${nodeName(n)} on ${VIEWPORT_LABEL[d].toLowerCase()}`, `h${id}${d}`) })) });
  const setBase = (k: string, v: StyleValue | null, lab: string) => mut((m) => { if (v === null) delete m.style[k]; else m.style[k] = v; }, lab, `b${id}${k}`);
  const setResp = (d: "tablet" | "mobile", k: string, v: StyleValue | null) => mut((m) => { if (v === null) delete m.resp[d][k]; else m.resp[d][k] = v; }, `Adjusted the ${VIEWPORT_LABEL[d].toLowerCase()} layout`, `r${id}${d}${k}`);
  const au: Field[] = [];
  if (T === "stack") au.push({ kind: "toggle", label: "Stack vertically on phones", on: n.style.autoStack !== false, hint: "Rows become columns below 640px.", onChange: (v) => setBase("autoStack", v ? null : false, "Changed responsive behaviour") });
  if (T === "grid") {
    const tc = n.resp.tablet.cols, mc = n.resp.mobile.cols, b0 = num(n.style.cols, 3);
    au.push({ kind: "step", label: "Columns on tablet", value: typeof tc === "number" ? tc : Math.min(b0, 2), min: 1, max: 6, display: typeof tc === "number" ? String(tc) : `${Math.min(b0, 2)} · auto`, onChange: (v) => setResp("tablet", "cols", v) });
    au.push({ kind: "step", label: "Columns on phone", value: typeof mc === "number" ? mc : 1, min: 1, max: 4, display: typeof mc === "number" ? String(mc) : "1 · auto", onChange: (v) => setResp("mobile", "cols", v) });
  }
  if (textish) au.push({ kind: "toggle", label: "Scale large text down", on: n.style.autoType !== false, hint: "Big sizes shrink on tablet and phone unless you set them.", onChange: (v) => setBase("autoType", v ? null : false, "Changed responsive behaviour") });
  if (T === "section") au.push({ kind: "toggle", label: "Tighter padding on phones", on: n.style.autoPad !== false, onChange: (v) => setBase("autoPad", v ? null : false, "Changed responsive behaviour") });
  if (au.length) G.push({ title: "Automatic adjustments", fields: au });
  const items: { vp: string; label: string; value: string; reset: () => void }[] = [];
  (["tablet", "mobile"] as const).forEach((d) => Object.entries(n.resp[d]).forEach(([k, v]) => items.push({ vp: VIEWPORT_LABEL[d], label: PROPN[k] ?? k, value: fmtVal(v), reset: () => setResp(d, k, null) })));
  G.push({ title: "Overrides on this element", fields: [{ kind: "overrides", items, empty: "None yet. Switch to Tablet or Phone above, then change any Layout or Style value: it applies only there." }] });
  return G;
}
