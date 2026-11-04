import type { PNode, StyleValue, Theme, Viewport } from "./types";

/**
 * The style cascade. Desktop is the base design; tablet overrides apply to
 * tablet and phone; phone overrides apply to phone only. Anything not set falls
 * back to a per-component default.
 */

export function effectiveStyle(n: PNode, vp: Viewport): Record<string, StyleValue> {
  const s: Record<string, StyleValue> = { ...n.style };
  if (vp !== "desktop") Object.assign(s, n.resp.tablet);
  if (vp === "mobile") Object.assign(s, n.resp.mobile);
  return s;
}

/** Whether `key` is explicitly overridden at (or above, for phone) this viewport. */
export function overriddenAt(n: PNode, key: string, vp: Viewport): boolean {
  if (vp === "tablet") return key in n.resp.tablet;
  if (vp === "mobile") return key in n.resp.mobile || key in n.resp.tablet;
  return false;
}

export function defaultStyle(n: PNode, key: string, t: Theme): StyleValue | undefined {
  const T = n.type;
  const lv = n.props.level || 2;
  switch (key) {
    case "dir": return T === "stack" ? "row" : "column";
    case "gap": return ({ section: 28, container: 14, stack: 16, grid: 24, column: 12 } as Record<string, number>)[T] ?? 0;
    case "align": return T === "stack" ? "center" : "stretch";
    case "justify": return "start";
    case "padY": return T === "section" ? Math.round(88 * (t.space || 1)) : T === "button" ? 12 : 0;
    case "padX": return T === "section" ? 40 : T === "button" ? 20 : 0;
    case "cols": return 3;
    case "size": return T === "heading" ? ({ 1: 56, 2: 32, 3: 20 } as Record<number, number>)[lv] ?? 32 : T === "button" ? 15 : T === "text" ? 17 : 16;
    case "weight": return T === "heading" ? t.headWeight || 600 : T === "button" ? 600 : 400;
    case "lh": return T === "heading" ? 1.1 : 1.6;
    case "ls": return T === "heading" ? t.headLs ?? -0.02 : 0;
    case "radius": return ["image", "project", "button", "container", "contact"].includes(T) ? t.radius ?? 8 : 0;
    case "opacity": return 100;
    case "border": return 0;
    case "height": return 48;
    case "thick": return 1;
    case "maxW": return T === "section" ? t.maxW || 1120 : 0;
    case "width": return T === "button" ? "hug" : "fill";
    case "shadow": return "none";
    case "mt": case "mb": return 0;
    case "ta": return "left";
    case "font": return T === "heading" ? "head" : "body";
    case "case": return "none";
    case "wrap": return true;
    case "span": return 1;
    case "sticky": return false;
    default: return undefined;
  }
}

export function styleValue(n: PNode, key: string, vp: Viewport, t: Theme): StyleValue | undefined {
  const s = effectiveStyle(n, vp);
  return s[key] !== undefined ? s[key] : defaultStyle(n, key, t);
}

export const num = (v: StyleValue | undefined, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
export const str = (v: StyleValue | undefined, fallback = ""): string => (typeof v === "string" ? v : fallback);
