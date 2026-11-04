/**
 * Component registry (P1).
 *
 * One place that defines what a node type is: its props schema, its defaults,
 * and which children it accepts. The editor's insert menu, the inspector, the
 * validator and (later) the renderer all read this table, so a new component is
 * one entry here rather than a change in five files.
 *
 * PAGE is the system root: it is created with a page and can never be inserted,
 * duplicated or deleted by a user.
 */
import { z } from "zod";
import { FONT_ALLOWLIST } from "./tokens";
import type { ComponentType, NodeType } from "./types";

const href = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || /^(https:\/\/|mailto:)/.test(value), {
    message: "Links must start with https:// or mailto:",
  });

const hexOrRgba = z
  .string()
  .regex(/^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\([\d\s,.]+\))$/, "Expected a hex or rgba colour");

const gradientLiteral = z
  .string()
  .regex(/^(linear|radial)-gradient\(/, "Expected a gradient value");

const tokenRef = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/, "Expected a token reference such as color.brand");

const backgroundSrc = z
  .string()
  .max(500)
  .refine((value) => value === "" || /^(\/|https:\/\/)/.test(value), {
    message: "Background images are site paths (/portfolio/x.png) or https URLs",
  });

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");

export const SECTION_PROPS = z
  .object({
    fullBleed: z.boolean().default(true),
    /** Optional cover image behind the section (overlaid with the page colour). */
    backgroundSrc: backgroundSrc.optional(),
    minHeightPx: z.number().int().min(0).max(2000).optional(),
    anchor: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/, "Anchors are lowercase letters, digits and dashes")
      .optional(),
  })
  .strict();

export const CONTAINER_PROPS = z
  .object({
    maxWidthPx: z.number().int().min(320).max(1600).default(1080),
    align: z.enum(["left", "center", "right"]).default("center"),
  })
  .strict();

export const STACK_PROPS = z
  .object({
    direction: z.enum(["row", "column"]).default("column"),
    wrap: z.boolean().default(false),
    gapPx: z.number().int().min(0).max(240).default(16),
    align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    justify: z.enum(["start", "center", "end", "between", "around"]).default("start"),
  })
  .strict();

export const GRID_PROPS = z
  .object({
    columns: z.number().int().min(1).max(12).default(12),
    minColumnPx: z.number().int().min(120).max(600).default(240),
    rowGapPx: z.number().int().min(0).max(240).default(24),
    columnGapPx: z.number().int().min(0).max(240).default(24),
  })
  .strict();

export const COLUMN_PROPS = z
  .object({
    span: z.number().int().min(1).max(12).default(12),
    order: z.number().int().min(-999).max(999).default(0),
    alignV: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
  })
  .strict();

export const SPACER_PROPS = z
  .object({
    heightPx: z.number().int().min(0).max(240).default(32),
    hideOn: z.array(z.enum(["tablet", "mobile"])).max(2).default([]),
  })
  .strict();

export const DIVIDER_PROPS = z
  .object({
    thicknessPx: z.number().int().min(1).max(8).default(1),
    colorToken: tokenRef.default("color.border-subtle"),
    widthPct: z.number().int().min(1).max(100).default(100),
    variant: z.enum(["solid", "dashed"]).default("solid"),
  })
  .strict();

export const HEADING_PROPS = z
  .object({
    text: z.string().max(200).default(""),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(2),
    /** display = the oversized hero treatment (tight tracking, balanced lines) */
    variant: z.enum(["default", "display"]).default("default"),
  })
  .strict();

export const TEXT_PROPS = z
  .object({
    text: z.string().max(4000).default(""),
    /** Render the text as Markdown (bold, italic, code, links, lists, quotes). */
    markdown: z.boolean().default(false),
  })
  .strict();

export const BUTTON_PROPS = z
  .object({
    label: z.string().max(60).default(""),
    href: href.default(""),
    variant: z.enum(["primary", "secondary", "ghost"]).default("primary"),
    target: z.enum(["self", "blank"]).default("self"),
  })
  .strict();

const imageSrc = z
  .string()
  .max(500)
  .refine((value) => value === "" || /^(\/|https:\/\/)/.test(value), {
    message: "Image sources are site paths (/portfolio/x.png) or https URLs",
  });

export const IMAGE_PROPS = z
  .object({
    assetId: z.string().max(64).default(""),
    src: imageSrc.optional(),
    alt: z.string().max(200).optional(),
    caption: z.string().max(200).optional(),
    aspect: z.enum(["auto", "1:1", "4:3", "16:9"]).default("auto"),
    background: z.union([hexOrRgba, gradientLiteral, tokenRef]).optional(),
  })
  .strict();

export const PROJECT_CARD_PROPS = z
  .object({
    title: z.string().max(120).default(""),
    summary: z.string().max(400).default(""),
    year: z.string().max(16).default(""),
    tags: z.array(z.string().max(24)).max(6).default([]),
    coverAssetId: z.string().max(64).optional(),
    coverSrc: imageSrc.optional(),
    href: href.optional(),
    featured: z.boolean().default(false),
    /** default = media on top · wide = media beside copy · overlay = copy on the image */
    variant: z.enum(["default", "wide", "overlay"]).default("default"),
  })
  .strict();

export const EXPERIENCE_ITEM_PROPS = z
  .object({
    title: z.string().max(120).default(""),
    org: z.string().max(120).default(""),
    start: month,
    end: month.optional(),
    current: z.boolean().default(false),
    bullets: z.array(z.string().max(240)).max(8).default([]),
    /** timeline = rail + dates · card = bordered block */
    variant: z.enum(["timeline", "card"]).default("timeline"),
  })
  .strict()
  .refine((value) => value.current || value.end !== undefined, {
    message: "An experience item needs an end date unless it is current",
    path: ["end"],
  });

export const SKILL_GROUP_PROPS = z
  .object({
    title: z.string().max(80).default(""),
    items: z.array(z.string().max(40)).max(24).default([]),
    variant: z.enum(["chips", "list", "matrix"]).default("chips"),
  })
  .strict();

export const SOCIAL_LINKS_PROPS = z
  .object({
    links: z
      .array(
        z
          .object({
            platform: z.enum(["linkedin", "x", "instagram", "github", "dribbble", "behance", "youtube", "email"]),
            url: z.string().max(300).regex(/^(https:\/\/|mailto:)/, "Links must start with https:// or mailto:"),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();

export const CONTACT_BLOCK_PROPS = z
  .object({
    email: z.string().max(160).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Expected an email address"),
    ctaLabel: z.string().max(40).default("Get in touch"),
    note: z.string().max(240).optional(),
    variant: z.enum(["inline", "card"]).default("inline"),
  })
  .strict();

/** PAGE is the system root: no props, so nothing can be smuggled through it. */
export const PAGE_PROPS = z.object({}).strict();

export type ComponentCategory = "layout" | "content" | "media" | "portfolio" | "system";

export interface ComponentSpec {
  type: NodeType;
  category: ComponentCategory;
  schema: z.ZodTypeAny;
  defaults: Record<string, unknown>;
  allowsChildren: boolean;
  /** Empty array on a leaf; undefined on PAGE means "SECTION only" (see below). */
  allowedChildren: readonly NodeType[];
}

const LEAF: readonly NodeType[] = [];
const CONTENT_PARENTS: readonly NodeType[] = [
  "CONTAINER",
  "STACK",
  "GRID",
  "HEADING",
  "TEXT",
  "BUTTON",
  "IMAGE",
  "PROJECT_CARD",
  "EXPERIENCE_ITEM",
  "SKILL_GROUP",
  "SOCIAL_LINKS",
  "CONTACT_BLOCK",
  "DIVIDER",
  "SPACER",
];
const COLUMN_CHILDREN: readonly NodeType[] = [
  "CONTAINER",
  "STACK",
  "HEADING",
  "TEXT",
  "BUTTON",
  "IMAGE",
  "PROJECT_CARD",
  "EXPERIENCE_ITEM",
  "SKILL_GROUP",
  "SOCIAL_LINKS",
  "CONTACT_BLOCK",
  "DIVIDER",
  "SPACER",
];

/**
 * The authoritative parent → children matrix
 * (docs/portfolio/FINAL-ARCHITECTURE.md §3.1).
 */
export const REGISTRY: Record<NodeType, ComponentSpec> = {
  PAGE: {
    type: "PAGE",
    category: "system",
    schema: PAGE_PROPS,
    defaults: {},
    allowsChildren: true,
    allowedChildren: ["SECTION"],
  },
  SECTION: {
    type: "SECTION",
    category: "layout",
    schema: SECTION_PROPS,
    defaults: { fullBleed: true },
    allowsChildren: true,
    allowedChildren: ["CONTAINER", "STACK"],
  },
  CONTAINER: {
    type: "CONTAINER",
    category: "layout",
    schema: CONTAINER_PROPS,
    defaults: { maxWidthPx: 1080, align: "center" },
    allowsChildren: true,
    allowedChildren: CONTENT_PARENTS,
  },
  STACK: {
    type: "STACK",
    category: "layout",
    schema: STACK_PROPS,
    defaults: { direction: "column", wrap: false, gapPx: 16, align: "stretch", justify: "start" },
    allowsChildren: true,
    allowedChildren: CONTENT_PARENTS,
  },
  GRID: {
    type: "GRID",
    category: "layout",
    schema: GRID_PROPS,
    defaults: { columns: 12, minColumnPx: 240, rowGapPx: 24, columnGapPx: 24 },
    allowsChildren: true,
    allowedChildren: ["COLUMN"],
  },
  COLUMN: {
    type: "COLUMN",
    category: "layout",
    schema: COLUMN_PROPS,
    defaults: { span: 12, order: 0, alignV: "stretch" },
    allowsChildren: true,
    allowedChildren: COLUMN_CHILDREN,
  },
  SPACER: {
    type: "SPACER",
    category: "layout",
    schema: SPACER_PROPS,
    defaults: { heightPx: 32, hideOn: [] },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  DIVIDER: {
    type: "DIVIDER",
    category: "layout",
    schema: DIVIDER_PROPS,
    defaults: { thicknessPx: 1, colorToken: "color.border-subtle", widthPct: 100, variant: "solid" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  HEADING: {
    type: "HEADING",
    category: "content",
    schema: HEADING_PROPS,
    defaults: { text: "", level: 2 },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  TEXT: {
    type: "TEXT",
    category: "content",
    schema: TEXT_PROPS,
    defaults: { text: "" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  BUTTON: {
    type: "BUTTON",
    category: "content",
    schema: BUTTON_PROPS,
    defaults: { label: "", href: "", variant: "primary", target: "self" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  IMAGE: {
    type: "IMAGE",
    category: "media",
    schema: IMAGE_PROPS,
    defaults: { assetId: "", aspect: "auto" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  PROJECT_CARD: {
    type: "PROJECT_CARD",
    category: "portfolio",
    schema: PROJECT_CARD_PROPS,
    defaults: { title: "", summary: "", year: "", tags: [], featured: false },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  EXPERIENCE_ITEM: {
    type: "EXPERIENCE_ITEM",
    category: "portfolio",
    schema: EXPERIENCE_ITEM_PROPS,
    defaults: { title: "", org: "", start: "2020-01", current: true, bullets: [] },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  SKILL_GROUP: {
    type: "SKILL_GROUP",
    category: "portfolio",
    schema: SKILL_GROUP_PROPS,
    defaults: { title: "", items: [], variant: "chips" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  SOCIAL_LINKS: {
    type: "SOCIAL_LINKS",
    category: "portfolio",
    schema: SOCIAL_LINKS_PROPS,
    defaults: { links: [] },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
  CONTACT_BLOCK: {
    type: "CONTACT_BLOCK",
    category: "portfolio",
    schema: CONTACT_BLOCK_PROPS,
    defaults: { email: "you@example.com", ctaLabel: "Get in touch" },
    allowsChildren: false,
    allowedChildren: LEAF,
  },
};

/** The sixteen types a user can insert. PAGE is deliberately excluded. */
export const USER_INSERTABLE_TYPES: readonly ComponentType[] = [
  "SECTION",
  "CONTAINER",
  "STACK",
  "GRID",
  "COLUMN",
  "SPACER",
  "DIVIDER",
  "HEADING",
  "TEXT",
  "BUTTON",
  "IMAGE",
  "PROJECT_CARD",
  "EXPERIENCE_ITEM",
  "SKILL_GROUP",
  "SOCIAL_LINKS",
  "CONTACT_BLOCK",
];

export const ALL_NODE_TYPES: readonly NodeType[] = ["PAGE", ...USER_INSERTABLE_TYPES];

export function isNodeType(value: unknown): value is NodeType {
  return typeof value === "string" && (ALL_NODE_TYPES as readonly string[]).includes(value);
}

export function isUserInsertable(value: unknown): value is ComponentType {
  return typeof value === "string" && (USER_INSERTABLE_TYPES as readonly string[]).includes(value);
}

/** True when `child` may sit inside `parent`, per the matrix above. */
export function childAllowed(parent: NodeType, child: NodeType): boolean {
  return REGISTRY[parent].allowedChildren.includes(child);
}

/** Default props for a new node of this type (validated by the caller). */
export function defaultProps(type: NodeType): Record<string, unknown> {
  return { ...REGISTRY[type].defaults };
}

export const FONT_IDS = FONT_ALLOWLIST;
