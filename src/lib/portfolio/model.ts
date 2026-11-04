import type { NodeType, PNode, PortfolioDoc, StyleMap, Viewport } from "./types";

/** The approved component library (PRD §5.2). Nothing outside this list. */
export const COMPONENTS: Record<NodeType, { label: string; group: "Layout" | "Content" | "Professional"; desc: string }> = {
  section: { label: "Section", group: "Layout", desc: "A full-width band of the page. Everything else lives inside one." },
  container: { label: "Container", group: "Layout", desc: "Groups content with its own width, padding and background." },
  stack: { label: "Stack", group: "Layout", desc: "Lines items up in a row or column with even gaps." },
  grid: { label: "Grid", group: "Layout", desc: "Equal columns that reflow on smaller screens." },
  column: { label: "Column", group: "Layout", desc: "A vertical group, usually inside a Stack or Grid." },
  spacer: { label: "Spacer", group: "Layout", desc: "Adds empty vertical space." },
  divider: { label: "Divider", group: "Layout", desc: "A thin line that separates content." },
  heading: { label: "Heading", group: "Content", desc: "A title, from page headline to section label." },
  text: { label: "Text", group: "Content", desc: "Paragraphs written in Markdown: bold, links, lists, quotes." },
  button: { label: "Button", group: "Content", desc: "A link styled as a button, an outline or plain text." },
  image: { label: "Image", group: "Content", desc: "A photo or artwork with alt text and cropping." },
  project: { label: "Project Card", group: "Professional", desc: "A project or case study: cover, role, year and link." },
  experience: { label: "Experience Item", group: "Professional", desc: "One role: title, company, dates and what changed." },
  skills: { label: "Skill Group", group: "Professional", desc: "A titled set of skills as chips, a list, or inline." },
  social: { label: "Social Links", group: "Professional", desc: "Links to your profiles and work elsewhere." },
  contact: { label: "Contact Block", group: "Professional", desc: "How to reach you: email, location, availability." },
};

export const BOX_TYPES: ReadonlySet<NodeType> = new Set<NodeType>(["section", "container", "stack", "grid", "column"]);
export const isBox = (t: NodeType) => BOX_TYPES.has(t);

/** Whether `childType` may sit inside `parentType` (`null` = page level). */
export function canHold(parentType: NodeType | null, childType: NodeType): boolean {
  if (childType === "section") return parentType === null;
  if (parentType === null) return false;
  return isBox(parentType);
}

let counter = 0;
/** Short unique id, valid as a CSS class fragment. */
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return "n" + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6) + counter.toString(36);
}

export function makeNode(type: NodeType, props: PNode["props"] = {}, style: StyleMap = {}, kids: PNode[] = [], id = newId()): PNode {
  return { id, type, name: "", props, style, resp: { tablet: {}, mobile: {} }, hide: {}, kids };
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function walk(list: PNode[], fn: (n: PNode, arr: PNode[], i: number, parent: PNode | null, depth: number) => boolean | void, parent: PNode | null = null, depth = 0): boolean {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (fn(n, list, i, parent, depth) === false) return false;
    if (n.kids.length && walk(n.kids, fn, n, depth + 1) === false) return false;
  }
  return true;
}

export interface Located { n: PNode; arr: PNode[]; i: number; parent: PNode | null; depth: number }
export function locate(doc: PortfolioDoc, id: string | null | undefined): Located | null {
  if (!id) return null;
  let found: Located | null = null;
  walk(doc.root, (n, arr, i, parent, depth) => {
    if (n.id === id) { found = { n, arr, i, parent, depth }; return false; }
  });
  return found;
}

export function pathTo(doc: PortfolioDoc, id: string): PNode[] {
  const rec = (list: PNode[], acc: PNode[]): PNode[] | null => {
    for (const n of list) {
      if (n.id === id) return [...acc, n];
      const r = rec(n.kids, [...acc, n]);
      if (r) return r;
    }
    return null;
  };
  return rec(doc.root, []) ?? [];
}

export function countDescendants(n: PNode): number {
  let c = 0;
  walk(n.kids, () => { c++; });
  return c;
}
export function countNodes(doc: PortfolioDoc): number {
  let c = 0;
  walk(doc.root, () => { c++; });
  return c;
}

/** Fresh ids for a copied subtree. */
export function reid(n: PNode): PNode {
  n.id = newId();
  n.kids.forEach(reid);
  return n;
}

export function countH1(doc: PortfolioDoc): number {
  let c = 0;
  walk(doc.root, (n) => { if (n.type === "heading" && n.props.level === 1 && !n.hide.desktop) c++; });
  return c;
}

const trunc = (s: unknown, m = 34) => {
  const t = String(s ?? "").replace(/\s+/g, " ").replace(/[#*_`>[\]]/g, "").trim();
  return t.length > m ? t.slice(0, m - 1) + "…" : t || "Untitled";
};
export { trunc as truncate };

/** The label shown in the layers panel and breadcrumbs. */
export function nodeName(n: PNode): string {
  if (n.name) return n.name;
  const p = n.props;
  switch (n.type) {
    case "section": return p.label || "Section";
    case "heading": case "text": return trunc(p.text);
    case "button": return trunc(p.label);
    case "image": return p.alt ? trunc(p.alt) : "Image";
    case "project": return trunc(p.title);
    case "experience": return trunc((p.role || "Role") + (p.company ? " · " + p.company : ""));
    case "skills": return p.title || "Skills";
    case "social": return "Social links";
    case "contact": return p.heading ? trunc(p.heading) : "Contact";
    default: return COMPONENTS[n.type].label;
  }
}

export type DropPosition = "before" | "after" | "into";
export type DropCheck = { ok: true; msg: string } | { ok: false; msg: string };

/** Can `dragged` (an existing node id, or a new component type) land at `pos` of `overId`? */
export function checkDrop(doc: PortfolioDoc, dragged: { id?: string; type: NodeType }, overId: string, pos: DropPosition): DropCheck {
  const o = locate(doc, overId);
  if (!o) return { ok: false, msg: "" };
  if (dragged.id) {
    if (dragged.id === overId) return { ok: false, msg: "Can’t drop an element onto itself." };
    if (pathTo(doc, overId).some((x) => x.id === dragged.id)) return { ok: false, msg: "Can’t move an element inside itself." };
  }
  const parentType = pos === "into" ? o.n.type : o.parent ? o.parent.type : null;
  if (!canHold(parentType, dragged.type)) {
    const msg = dragged.type === "section"
      ? `Sections can only sit at page level${parentType ? `, not inside a ${COMPONENTS[parentType].label}` : ""}.`
      : parentType === null
        ? `${COMPONENTS[dragged.type].label} needs to go inside a section.`
        : `${COMPONENTS[parentType].label} can’t hold other components.`;
    return { ok: false, msg };
  }
  return { ok: true, msg: pos === "into" ? `Drop to place inside ${nodeName(o.n)}` : `Drop to place ${pos} ${nodeName(o.n)}` };
}

/* ---------- pure edits: each returns a new document ---------- */

export function moveSibling(doc: PortfolioDoc, id: string, delta: number): PortfolioDoc {
  const d = clone(doc);
  const l = locate(d, id);
  if (!l) return doc;
  const j = l.i + delta;
  if (j < 0 || j >= l.arr.length) return doc;
  const [x] = l.arr.splice(l.i, 1);
  l.arr.splice(j, 0, x);
  return d;
}

export function duplicateNode(doc: PortfolioDoc, id: string): { doc: PortfolioDoc; newId: string | null } {
  const d = clone(doc);
  const l = locate(d, id);
  if (!l) return { doc, newId: null };
  const copy = reid(clone(l.n));
  l.arr.splice(l.i + 1, 0, copy);
  return { doc: d, newId: copy.id };
}

export function removeNode(doc: PortfolioDoc, id: string): PortfolioDoc {
  const d = clone(doc);
  const l = locate(d, id);
  if (!l) return doc;
  l.arr.splice(l.i, 1);
  return d;
}

/**
 * Insert near the selection: inside it when it's a layout box, otherwise after
 * it. A section always goes to page level (after the selected top section).
 * A non-section with nothing selected gets its own new section.
 */
export function insertNode(doc: PortfolioDoc, node: PNode, selectedId: string | null, wrap: (kid: PNode) => PNode): { doc: PortfolioDoc; target: string } {
  const d = clone(doc);
  const sel = locate(d, selectedId);
  if (node.type === "section") {
    if (sel) {
      const top = pathTo(d, sel.n.id)[0];
      const i = d.root.findIndex((n) => n.id === top.id);
      d.root.splice(i + 1, 0, node);
      return { doc: d, target: "the page, after " + nodeName(top) };
    }
    d.root.push(node);
    return { doc: d, target: "the page" };
  }
  if (!sel) { d.root.push(wrap(node)); return { doc: d, target: "a new section" }; }
  if (isBox(sel.n.type)) { sel.n.kids.push(node); return { doc: d, target: nodeName(sel.n) }; }
  sel.arr.splice(sel.i + 1, 0, node);
  return { doc: d, target: sel.parent ? nodeName(sel.parent) : "the page" };
}

/** Move an existing node, or add a new one, relative to `overId`. Assumes checkDrop passed. */
export function dropNode(doc: PortfolioDoc, dragged: { id?: string; node?: PNode }, overId: string, pos: DropPosition): PortfolioDoc {
  const d = clone(doc);
  let n = dragged.node ?? null;
  if (!n && dragged.id) {
    const m = locate(d, dragged.id);
    if (!m) return doc;
    n = m.arr.splice(m.i, 1)[0];
  }
  const o = locate(d, overId);
  if (!n || !o) return doc;
  if (pos === "into") o.n.kids.push(n);
  else o.arr.splice(o.i + (pos === "after" ? 1 : 0), 0, n);
  return d;
}

export function updateNode(doc: PortfolioDoc, id: string, fn: (n: PNode) => void): PortfolioDoc {
  const d = clone(doc);
  const l = locate(d, id);
  if (!l) return doc;
  fn(l.n);
  return d;
}

/** Set (or clear with null) a style value for one viewport. */
export function setStyle(n: PNode, vp: Viewport, key: string, value: StyleMap[string] | null): void {
  const target = vp === "desktop" ? n.style : n.resp[vp];
  if (value === null || value === undefined) delete target[key];
  else target[key] = value;
}

export function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
