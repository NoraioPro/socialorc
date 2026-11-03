/**
 * Design tokens for the portfolio builder (P1).
 *
 * Tokens are the shared vocabulary a document styles itself with. Defaults below
 * are *seeds*: every value is user-editable, and a node may always carry a
 * literal instead of a reference.
 *
 * Families follow the app's own palette (src/app/socialork.css) so a portfolio
 * looks native by default without being locked to it.
 */
import type { TokenFamily, TokenPath, TokenTable, StyleValue } from "./types";

/** The only font families a document may reference: build-time next/font imports. */
export const FONT_ALLOWLIST = ["hanken-grotesk", "ibm-plex-mono", "geist", "geist-mono"] as const;
export type FontId = (typeof FONT_ALLOWLIST)[number];

export const DEFAULT_TOKENS: TokenTable = {
  color: {
    "surface-base": "#131317",
    "surface-raised": "#1b1b21",
    "surface-sunken": "#0b0b0e",
    "text-strong": "#ededf1",
    "text-muted": "#a6a6b0",
    "border-subtle": "rgba(255,255,255,0.13)",
    brand: "#48ed85",
    "brand-contrast": "#003917",
    success: "#48ed85",
    warning: "#f2b84b",
    danger: "#ff6b6b",
  },
  font: {
    display: "hanken-grotesk",
    text: "hanken-grotesk",
    mono: "ibm-plex-mono",
  },
  space: {
    "0": 0,
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48,
    "16": 64,
    "20": 80,
    "24": 96,
  },
  radius: { none: 0, sm: 6, md: 10, lg: 16, xl: 24, full: 999 },
  shadow: {
    none: "none",
    sm: "0 1px 2px rgba(0,0,0,0.35)",
    md: "0 8px 24px rgba(0,0,0,0.45)",
    lg: "0 20px 60px rgba(0,0,0,0.55)",
  },
  gradient: {
    "brand-glow": "linear-gradient(135deg, #48ed85 0%, #0f6b4a 100%)",
    "surface-fade": "linear-gradient(180deg, #131317 0%, #0b0b0e 100%)",
  },
};

const FAMILY_VALUES: Record<TokenFamily, "string" | "number"> = {
  color: "string",
  font: "string",
  space: "number",
  radius: "number",
  shadow: "string",
  gradient: "string",
};

/** Split `color.brand` into family + name, or return null when malformed. */
export function splitTokenPath(path: TokenPath): { family: TokenFamily; name: string } | null {
  if (typeof path !== "string") return null;
  const dot = path.indexOf(".");
  if (dot <= 0 || dot === path.length - 1) return null;
  const family = path.slice(0, dot) as TokenFamily;
  const name = path.slice(dot + 1);
  if (!(family in FAMILY_VALUES)) return null;
  if (name.includes(".")) return null;
  return { family, name };
}

/** The token's literal value, or undefined when the reference does not resolve. */
export function readToken(tokens: TokenTable, path: TokenPath): string | number | undefined {
  const split = splitTokenPath(path);
  if (!split) return undefined;
  const bucket = tokens[split.family] as Record<string, string | number>;
  return Object.prototype.hasOwnProperty.call(bucket, split.name) ? bucket[split.name] : undefined;
}

export function tokenExists(tokens: TokenTable, path: TokenPath): boolean {
  return readToken(tokens, path) !== undefined;
}

/** Family a style property must reference, so `color.brand` cannot style a gap. */
export function familyMatches(family: TokenFamily, value: string | number): boolean {
  return FAMILY_VALUES[family] === typeof value;
}

/** Resolve one style value to a literal, following the token table. */
export function resolveStyleValue<T>(tokens: TokenTable, value: StyleValue<T> | undefined): T | undefined {
  if (!value) return undefined;
  if ("value" in value) return value.value;
  const resolved = readToken(tokens, value.ref);
  return resolved === undefined ? undefined : (resolved as unknown as T);
}
