import { z } from "zod";
import { FONT_KEYS, NODE_TYPES, type PNode, type PortfolioDoc } from "./types";

/**
 * Validation for a portfolio document. Every write goes through
 * `parsePortfolioDoc`, so a malformed or oversized document never reaches the
 * database, and a stored one is re-checked before it is rendered.
 */

export const DOC_LIMITS = {
  maxBytes: 512 * 1024,
  maxNodes: 600,
  maxDepth: 12,
  maxText: 8000,
} as const;

const text = z.string().max(DOC_LIMITS.maxText);
const shortText = z.string().max(300);
const color = z.string().max(64).regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|oklch\([0-9.,\s%/]+\))$/);
const styleValue = z.union([z.string().max(120), z.number().finite(), z.boolean()]);
const styleMap = z.record(z.string().max(40), styleValue);

const propsSchema = z.object({
  label: shortText, anchor: z.string().max(60), text, level: z.number().int().min(1).max(3),
  href: z.string().max(500), variant: z.string().max(20), newTab: z.boolean(),
  src: z.string().max(2_000_000).nullable(), alt: shortText, ratio: z.string().max(10), shape: z.string().max(10),
  title: shortText, role: shortText, year: z.string().max(60), summary: text,
  tags: z.array(z.string().max(60)).max(20), tagsText: z.string().max(1200),
  img: z.string().max(2_000_000).nullable(), linkLabel: shortText,
  company: shortText, period: z.string().max(80), location: shortText, desc: text,
  items: z.array(z.string().max(120)).max(60), itemsText: z.string().max(7200),
  links: z.array(z.object({ label: z.string().max(80), url: z.string().max(500) })).max(20),
  heading: shortText, email: z.string().max(200), availability: shortText, button: z.string().max(80),
}).partial();

const nodeSchema: z.ZodType<PNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    type: z.enum(NODE_TYPES),
    name: z.string().max(80),
    props: propsSchema,
    style: styleMap,
    resp: z.object({ tablet: styleMap, mobile: styleMap }),
    hide: z.object({ desktop: z.boolean(), tablet: z.boolean(), mobile: z.boolean() }).partial(),
    kids: z.array(nodeSchema).max(200),
  }),
);

export const themeSchema = z.object({
  bg: color, surface: color, text: color, muted: color, accent: color, onAccent: color, line: color,
  fontHead: z.enum(FONT_KEYS as [string, ...string[]]), fontBody: z.enum(FONT_KEYS as [string, ...string[]]),
  headWeight: z.number().int().min(100).max(900),
  headLs: z.number().min(-0.2).max(0.3),
  radius: z.number().min(0).max(999),
  space: z.number().min(0.5).max(2),
  maxW: z.number().min(480).max(1600),
});

export const docSchema = z.object({
  schemaVersion: z.literal(1),
  owner: z.object({ name: z.string().max(80), initials: z.string().max(4) }),
  seo: z.object({ title: z.string().max(140), desc: z.string().max(300) }),
  theme: themeSchema,
  root: z.array(nodeSchema).max(80),
});

export type ParseResult = { ok: true; doc: PortfolioDoc } | { ok: false; error: string };

/** Structural limits zod can't express on a recursive type. */
function checkShape(doc: PortfolioDoc): string | null {
  let nodes = 0;
  const ids = new Set<string>();
  const visit = (list: PNode[], depth: number, parent: PNode | null): string | null => {
    if (depth > DOC_LIMITS.maxDepth) return "The page is nested too deeply.";
    for (const n of list) {
      nodes += 1;
      if (nodes > DOC_LIMITS.maxNodes) return `A page can hold up to ${DOC_LIMITS.maxNodes} elements.`;
      if (ids.has(n.id)) return "Two elements share the same id.";
      ids.add(n.id);
      if (parent === null && n.type !== "section") return "Every element must sit inside a section.";
      if (parent !== null && n.type === "section") return "Sections can only sit at page level.";
      const err = visit(n.kids, depth + 1, n);
      if (err) return err;
    }
    return null;
  };
  return visit(doc.root, 0, null);
}

/** Parse a document from JSON text or an object. Never throws. */
export function parsePortfolioDoc(input: unknown): ParseResult {
  let value = input;
  if (typeof input === "string") {
    if (input.length > DOC_LIMITS.maxBytes) return { ok: false, error: "This page is too large to save." };
    try { value = JSON.parse(input); } catch { return { ok: false, error: "The page data is not valid JSON." }; }
  } else if (JSON.stringify(input ?? null).length > DOC_LIMITS.maxBytes) {
    return { ok: false, error: "This page is too large to save." };
  }
  const parsed = docSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The page data is invalid at ${issue?.path.join(".") || "root"}: ${issue?.message ?? "unknown"}` };
  }
  const doc = parsed.data as PortfolioDoc;
  const shape = checkShape(doc);
  return shape ? { ok: false, error: shape } : { ok: true, doc };
}

/** Like parsePortfolioDoc, for stored rows we wrote ourselves: throws when corrupt. */
export function readPortfolioDoc(json: string): PortfolioDoc {
  const r = parsePortfolioDoc(json);
  if (!r.ok) throw new Error(`Stored portfolio document is invalid: ${r.error}`);
  return r.doc;
}
