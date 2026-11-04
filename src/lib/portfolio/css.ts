/**
 * Style → CSS (P3).
 *
 * The renderer never trusts a style string: values arrive as numbers/enums, are
 * bounded by the validator, and are turned into declarations here. Responsive
 * overrides become media queries keyed by the node id, which keeps the markup
 * free of duplicated elements and makes the fallback order explicit:
 * desktop base, then tablet, then mobile.
 */
import { resolveStyleValue } from "./tokens";
import type { StyleSet, TokenTable } from "./types";

/** Font ids resolve to the next/font CSS variables loaded by the public layout. */
const FONT_VARS: Record<string, string> = {
  "hanken-grotesk": "var(--font-hanken)",
  "ibm-plex-mono": "var(--font-plex-mono)",
  geist: "var(--font-geist-sans)",
  "geist-mono": "var(--font-geist-mono)",
  "source-serif": "var(--font-serif), Georgia, serif",
};

/** Turn one resolved style object into `prop: value;` pairs (deterministic order). */
export function declarations(style: Partial<Record<keyof StyleSet, unknown>>): string {
  const out: string[] = [];
  const push = (prop: string, value: string | null): void => {
    if (value !== null && value !== "") out.push(`${prop}:${value}`);
  };

  const s = style as Record<string, unknown>;
  if (typeof s.display === "string") push("display", s.display === "grid" || s.display === "flex" ? s.display : s.display);
  if (s.direction === "row" || s.direction === "column") push("flex-direction", String(s.direction));
  if (typeof s.wrap === "boolean") push("flex-wrap", s.wrap ? "wrap" : "nowrap");
  if (typeof s.align === "string") push("align-items", String(s.align));
  if (typeof s.justify === "string") push("justify-content", String(s.justify).replace("between", "space-between").replace("around", "space-around"));
  for (const key of ["gap", "rowGap", "columnGap", "paddingX", "paddingY", "marginX", "marginY"]) {
    const value = s[key];
    if (typeof value !== "number") continue;
    if (key === "paddingX") { push("padding-left", `${value}px`); push("padding-right", `${value}px`); }
    else if (key === "paddingY") { push("padding-top", `${value}px`); push("padding-bottom", `${value}px`); }
    else if (key === "marginX") { push("margin-left", `${value}px`); push("margin-right", `${value}px`); }
    else if (key === "marginY") { push("margin-top", `${value}px`); push("margin-bottom", `${value}px`); }
    else if (key === "rowGap") push("row-gap", `${value}px`);
    else if (key === "columnGap") push("column-gap", `${value}px`);
    else push("gap", `${value}px`);
  }
  for (const key of ["width", "maxWidth", "height", "minHeight", "minColumnWidth", "borderWidth", "radius"]) {
    const value = s[key];
    if (typeof value !== "number") continue;
    const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    push(prop, `${value}px`);
  }
  if (typeof s.background === "string") push("background", String(s.background));
  if (typeof s.color === "string") push("color", String(s.color));
  if (typeof s.fontFamily === "string") push("font-family", FONT_VARS[String(s.fontFamily)] ?? String(s.fontFamily));
  if (typeof s.fontSize === "number") push("font-size", `${s.fontSize}px`);
  if (typeof s.fontWeight === "number") push("font-weight", String(s.fontWeight));
  if (typeof s.lineHeight === "number") push("line-height", String(s.lineHeight));
  if (typeof s.letterSpacing === "number") push("letter-spacing", `${s.letterSpacing}em`);
  if (typeof s.textAlign === "string") push("text-align", String(s.textAlign));
  if (typeof s.borderColor === "string") push("border-color", String(s.borderColor));
  if (typeof s.shadow === "string") push("box-shadow", String(s.shadow));
  if (typeof s.opacity === "number") push("opacity", String(s.opacity));
  if (typeof s.objectFit === "string") push("object-fit", String(s.objectFit));
  if (typeof s.columns === "number") push("grid-template-columns", `repeat(${s.columns}, minmax(0, 1fr))`);
  if (typeof s.span === "number") push("grid-column", `span ${s.span}`);
  if (typeof s.order === "number") push("order", String(s.order));

  return out.join(";");
}

/** Resolve one node's style at one breakpoint into declarations. */
export function styleDeclarations(
  style: StyleSet | undefined,
  tokens: TokenTable,
  overrides?: Partial<StyleSet>,
): string {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    merged[key] = resolveStyleValue(tokens, value as never);
  }
  for (const [key, value] of Object.entries(overrides ?? {})) {
    const resolved = resolveStyleValue(tokens, value as never);
    if (resolved !== undefined) merged[key] = resolved;
  }
  return declarations(merged);
}

/** Tablet/mobile rules for every node that overrides a property. */
export function responsiveRules(
  nodes: { id: string; style: StyleSet; responsive?: { tablet?: Partial<StyleSet>; mobile?: Partial<StyleSet> } }[],
  tokens: TokenTable,
  breakpoints: { tablet: number; mobile: number } = { tablet: 1024, mobile: 720 },
): string {
  const rules: string[] = [];
  const tablet: string[] = [];
  const mobile: string[] = [];
  for (const node of nodes) {
    if (node.responsive?.tablet) {
      const decl = styleDeclarations(node.style, tokens, node.responsive.tablet);
      if (decl) tablet.push(`[data-pf-node="${node.id}"]{${decl}}`);
    }
    if (node.responsive?.mobile) {
      const decl = styleDeclarations(node.style, tokens, { ...(node.responsive.tablet ?? {}), ...node.responsive.mobile });
      if (decl) mobile.push(`[data-pf-node="${node.id}"]{${decl}}`);
    }
  }
  if (tablet.length) rules.push(`@media (max-width:${breakpoints.tablet}px){${tablet.join("")}}`);
  if (mobile.length) rules.push(`@media (max-width:${breakpoints.mobile}px){${mobile.join("")}}`);
  return rules.join("");
}
