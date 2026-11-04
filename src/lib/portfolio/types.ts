/**
 * The portfolio document: a small tree of components plus a page theme.
 *
 * One document drives every surface: the editor canvas, the draft preview,
 * template thumbnails and the public page at /p/<handle>. It is stored as JSON
 * text and validated with `parsePortfolioDoc` (schema.ts) at every boundary.
 */

export type Viewport = "desktop" | "tablet" | "mobile";
export const VIEWPORTS: Viewport[] = ["desktop", "tablet", "mobile"];
export const VIEWPORT_WIDTH: Record<Viewport, number> = { desktop: 1280, tablet: 834, mobile: 390 };
export const VIEWPORT_LABEL: Record<Viewport, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Phone" };
/** Breakpoints of the public page; the editor frames sit inside them. */
export const TABLET_MAX = 1023;
export const MOBILE_MAX = 639;

export const NODE_TYPES = [
  "section", "container", "stack", "grid", "column", "spacer", "divider",
  "heading", "text", "button", "image",
  "project", "experience", "skills", "social", "contact",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type FontKey = "hanken" | "geist" | "plex" | "geistmono";
export const FONT_KEYS: FontKey[] = ["hanken", "geist", "plex", "geistmono"];

export type StyleValue = string | number | boolean;
/** Abstract, designer-facing style keys (see resolve.ts for the full list). */
export type StyleMap = Record<string, StyleValue>;

export interface SocialLink { label: string; url: string }

/** Every content field a component can carry; each type uses a subset. */
export interface NodeProps {
  label?: string;
  anchor?: string;
  text?: string;
  level?: number;
  href?: string;
  variant?: string;
  newTab?: boolean;
  src?: string | null;
  alt?: string;
  ratio?: string;
  shape?: string;
  title?: string;
  role?: string;
  year?: string;
  summary?: string;
  tags?: string[];
  tagsText?: string;
  img?: string | null;
  linkLabel?: string;
  company?: string;
  period?: string;
  location?: string;
  desc?: string;
  items?: string[];
  itemsText?: string;
  links?: SocialLink[];
  heading?: string;
  email?: string;
  availability?: string;
  button?: string;
}

export interface PNode {
  id: string;
  type: NodeType;
  /** Optional name shown in the layers panel. */
  name: string;
  props: NodeProps;
  /** Desktop (base) style. */
  style: StyleMap;
  /** Overrides: tablet applies to tablet and phone, mobile to phone only. */
  resp: { tablet: StyleMap; mobile: StyleMap };
  hide: Partial<Record<Viewport, boolean>>;
  kids: PNode[];
}

export interface Theme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  line: string;
  fontHead: FontKey;
  fontBody: FontKey;
  headWeight: number;
  headLs: number;
  radius: number;
  space: number;
  maxW: number;
}

export interface PortfolioDoc {
  schemaVersion: 1;
  owner: { name: string; initials: string };
  seo: { title: string; desc: string };
  theme: Theme;
  root: PNode[];
}
