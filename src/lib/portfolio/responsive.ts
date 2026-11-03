/**
 * Responsive style resolution (P1).
 *
 * One deterministic rule, used by the canvas, the preview and the public page:
 *
 *   literal > mobile override > tablet override > desktop base
 *
 * Overrides are sparse — a breakpoint only stores what differs — so resolution
 * is a shallow merge of the levels that apply, then token references are
 * replaced by their literal. Nothing here reads the DOM or a media query: the
 * caller decides which breakpoint it is rendering.
 */
import { resolveStyleValue } from "./tokens";
import type { StyleKey, StyleSet, TokenTable } from "./types";
import type { PortfolioNode, ResponsiveOverrides } from "./types";

export type Viewport = "desktop" | "tablet" | "mobile";

const STYLE_KEYS: readonly StyleKey[] = [
  "display",
  "direction",
  "wrap",
  "align",
  "justify",
  "gap",
  "rowGap",
  "columnGap",
  "paddingX",
  "paddingY",
  "marginX",
  "marginY",
  "width",
  "maxWidth",
  "height",
  "minHeight",
  "minColumnWidth",
  "columns",
  "span",
  "order",
  "background",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "borderWidth",
  "borderColor",
  "radius",
  "shadow",
  "opacity",
  "objectFit",
  "focalX",
  "focalY",
];

/** Which override layers apply at a viewport, widest first. */
export function layersFor(overrides: ResponsiveOverrides | undefined, viewport: Viewport): Partial<StyleSet>[] {
  const layers: Partial<StyleSet>[] = [];
  if (!overrides) return layers;
  if (viewport === "mobile" && overrides.tablet) layers.push(overrides.tablet);
  if (viewport === "mobile" && overrides.mobile) layers.push(overrides.mobile);
  if (viewport === "tablet" && overrides.tablet) layers.push(overrides.tablet);
  return layers;
}

/**
 * Merge the applicable layers over the base style. Later layers win, per
 * property — a mobile override of `gap` does not reset a tablet `paddingY`.
 */
export function mergeStyle(node: Pick<PortfolioNode, "style" | "responsive">, viewport: Viewport): StyleSet {
  const merged: StyleSet = { ...(node.style ?? {}) };
  for (const layer of layersFor(node.responsive, viewport)) {
    for (const key of STYLE_KEYS) {
      const value = layer[key];
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return merged;
}

/** Merge, then replace token references with their literal values. */
export function resolveStyle(
  node: Pick<PortfolioNode, "style" | "responsive">,
  tokens: TokenTable,
  viewport: Viewport,
): Partial<Record<StyleKey, unknown>> {
  const merged = mergeStyle(node, viewport);
  const resolved: Partial<Record<StyleKey, unknown>> = {};
  for (const key of STYLE_KEYS) {
    const raw = merged[key];
    if (raw === undefined) continue;
    const value = resolveStyleValue(tokens, raw as never);
    if (value !== undefined) resolved[key] = value;
  }
  return resolved;
}

/** True when a property is set at this viewport but not at the base (inspector badge). */
export function isOverridden(node: Pick<PortfolioNode, "style" | "responsive">, viewport: Viewport, key: StyleKey): boolean {
  if (viewport === "desktop") return false;
  const own = viewport === "tablet" ? node.responsive?.tablet?.[key] : node.responsive?.mobile?.[key];
  return own !== undefined;
}
