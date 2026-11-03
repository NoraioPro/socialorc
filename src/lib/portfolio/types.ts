/**
 * SocialOrk Professional Portfolio — document model (P1).
 *
 * Pure types and constants: no React, no Prisma, no network. The editor, the
 * preview and the public renderer all consume the same parsed document, so this
 * module is the single definition of what a portfolio document may contain.
 *
 * Architecture: docs/portfolio/FINAL-ARCHITECTURE.md §2.
 */

/** Schema version of the document envelope. A bump requires a migrate step. */
export const PORTFOLIO_SCHEMA_VERSION = 1 as const;

/** Hard caps enforced by parseDocument(). */
export const LIMITS = {
  maxNodesPerDocument: 4000,
  maxNodesPerPage: 2000,
  maxPages: 24,
  maxDepth: 12,
  maxTextLength: 4000,
  maxBullets: 8,
  maxTags: 6,
  maxSkillItems: 24,
  maxSocialLinks: 8,
} as const;

/** Families a token can belong to. A style property declares which one it reads. */
export type TokenFamily = "color" | "font" | "space" | "radius" | "shadow" | "gradient";

/**
 * A token reference is `family.name`, e.g. `color.brand` or `space.4`.
 * It is validated against the document's own token table, never against CSS.
 */
export type TokenPath = string;

export interface TokenTable {
  color: Record<string, string>;
  font: Record<string, string>;
  space: Record<string, number>;
  radius: Record<string, number>;
  shadow: Record<string, string>;
  gradient: Record<string, string>;
}

/**
 * Every design value is either a token reference or a validated literal.
 * A literal always wins over a token: editing a token never rewrites one.
 */
export type StyleValue<T> = { ref: TokenPath } | { value: T };

export type Breakpoint = "tablet" | "mobile";

/** Layout/typography properties a node may carry. Never a raw CSS string. */
export interface StyleSet {
  display?: StyleValue<"block" | "flex" | "grid" | "none">;
  direction?: StyleValue<"row" | "column">;
  wrap?: StyleValue<boolean>;
  align?: StyleValue<"start" | "center" | "end" | "stretch">;
  justify?: StyleValue<"start" | "center" | "end" | "between" | "around">;
  gap?: StyleValue<number>;
  rowGap?: StyleValue<number>;
  columnGap?: StyleValue<number>;
  paddingX?: StyleValue<number>;
  paddingY?: StyleValue<number>;
  marginX?: StyleValue<number>;
  marginY?: StyleValue<number>;
  width?: StyleValue<number>;
  maxWidth?: StyleValue<number>;
  height?: StyleValue<number>;
  minHeight?: StyleValue<number>;
  minColumnWidth?: StyleValue<number>;
  columns?: StyleValue<number>;
  span?: StyleValue<number>;
  order?: StyleValue<number>;
  background?: StyleValue<string>;
  color?: StyleValue<string>;
  fontFamily?: StyleValue<string>;
  fontSize?: StyleValue<number>;
  fontWeight?: StyleValue<400 | 500 | 600 | 700 | 800>;
  lineHeight?: StyleValue<number>;
  letterSpacing?: StyleValue<number>;
  textAlign?: StyleValue<"left" | "center" | "right">;
  borderWidth?: StyleValue<number>;
  borderColor?: StyleValue<string>;
  radius?: StyleValue<number>;
  shadow?: StyleValue<string>;
  opacity?: StyleValue<number>;
  objectFit?: StyleValue<"cover" | "contain" | "none">;
  focalX?: StyleValue<number>;
  focalY?: StyleValue<number>;
}

export type StyleKey = keyof StyleSet;

/** Responsive overrides hold only the properties that differ from the base. */
export interface ResponsiveOverrides {
  tablet?: Partial<StyleSet>;
  mobile?: Partial<StyleSet>;
}

/** Reserved slot: v1 is flow layout only. Absolute positioning is not exposed. */
export interface PositionValue {
  mode: "FLOW";
}

/** User-insertable component types. PAGE is the system root and is not in this union. */
export type ComponentType =
  | "SECTION"
  | "CONTAINER"
  | "STACK"
  | "GRID"
  | "COLUMN"
  | "SPACER"
  | "DIVIDER"
  | "HEADING"
  | "TEXT"
  | "BUTTON"
  | "IMAGE"
  | "PROJECT_CARD"
  | "EXPERIENCE_ITEM"
  | "SKILL_GROUP"
  | "SOCIAL_LINKS"
  | "CONTACT_BLOCK";

/** Every node type the document may contain, including the page root. */
export type NodeType = ComponentType | "PAGE";

export interface PortfolioNode {
  id: string;
  type: NodeType;
  props: Record<string, unknown>;
  style: StyleSet;
  responsive?: ResponsiveOverrides;
  position?: PositionValue;
  /** Set only in a published revision: the pinned media digest for IMAGE nodes. */
  mediaSha?: string;
  children?: PortfolioNode[];
}

export interface PageSettings {
  maxWidth?: number;
  background?: StyleValue<string>;
  paddingY?: number;
}

export interface PageSeo {
  title?: string;
  description?: string;
  /** Pinned media digest of the OG image in a published revision. */
  ogImageSha?: string;
}

export interface PortfolioPage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  seo: PageSeo;
  settings: PageSettings;
  root: PortfolioNode; // type: "PAGE"
}

export interface PortfolioDocumentMeta {
  locale: "en";
  createdAt: string;
  templateKey?: string;
  templateVersion?: number;
}

export interface PortfolioDocument {
  schemaVersion: typeof PORTFOLIO_SCHEMA_VERSION;
  tokens: TokenTable;
  pages: PortfolioPage[];
  meta: PortfolioDocumentMeta;
}

/** One deterministic validation problem, located by an exact path. */
export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export type ParseResult =
  | { ok: true; document: PortfolioDocument }
  | { ok: false; issues: ValidationIssue[] };

/** A resolved style value: token references already replaced by their literal. */
export type ResolvedStyle = Partial<{ [K in StyleKey]: unknown }>;
