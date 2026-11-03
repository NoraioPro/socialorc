/**
 * Style validation (P1).
 *
 * A document's style values are typed and bounded here — one table, one order,
 * so validation output is deterministic regardless of the key order a client
 * happens to send. Raw CSS, unknown keys and out-of-range numbers are refused
 * with an exact path.
 */
import { FONT_ALLOWLIST, splitTokenPath, readToken } from "./tokens";
import type { StyleKey, TokenFamily, TokenTable, ValidationIssue } from "./types";

type Rule =
  | { kind: "enum"; values: readonly (string | number)[] }
  | { kind: "number"; min: number; max: number; token?: TokenFamily }
  | { kind: "boolean" }
  | { kind: "color"; allowGradient?: boolean }
  | { kind: "fontFamily" }
  | { kind: "shadow" };

/**
 * The complete, ordered rule table. A key that is not here cannot appear in a
 * document — that is what makes "unsupported properties are rejected" true.
 */
export const STYLE_RULES: Record<StyleKey, Rule> = {
  display: { kind: "enum", values: ["block", "flex", "grid", "none"] },
  direction: { kind: "enum", values: ["row", "column"] },
  wrap: { kind: "boolean" },
  align: { kind: "enum", values: ["start", "center", "end", "stretch"] },
  justify: { kind: "enum", values: ["start", "center", "end", "between", "around"] },
  gap: { kind: "number", min: 0, max: 240, token: "space" },
  rowGap: { kind: "number", min: 0, max: 240, token: "space" },
  columnGap: { kind: "number", min: 0, max: 240, token: "space" },
  paddingX: { kind: "number", min: 0, max: 240, token: "space" },
  paddingY: { kind: "number", min: 0, max: 240, token: "space" },
  marginX: { kind: "number", min: 0, max: 240, token: "space" },
  marginY: { kind: "number", min: 0, max: 240, token: "space" },
  width: { kind: "number", min: 0, max: 1600, token: "space" },
  maxWidth: { kind: "number", min: 0, max: 1600, token: "space" },
  height: { kind: "number", min: 0, max: 2000, token: "space" },
  minHeight: { kind: "number", min: 0, max: 2000, token: "space" },
  minColumnWidth: { kind: "number", min: 120, max: 600, token: "space" },
  columns: { kind: "number", min: 1, max: 12 },
  span: { kind: "number", min: 1, max: 12 },
  order: { kind: "number", min: -999, max: 999 },
  background: { kind: "color", allowGradient: true },
  color: { kind: "color" },
  fontFamily: { kind: "fontFamily" },
  fontSize: { kind: "number", min: 10, max: 160, token: "space" },
  fontWeight: { kind: "enum", values: [400, 500, 600, 700, 800] },
  lineHeight: { kind: "number", min: 0.9, max: 2.2 },
  letterSpacing: { kind: "number", min: -0.05, max: 0.3 },
  textAlign: { kind: "enum", values: ["left", "center", "right"] },
  borderWidth: { kind: "number", min: 0, max: 24, token: "space" },
  borderColor: { kind: "color" },
  radius: { kind: "number", min: 0, max: 999, token: "radius" },
  shadow: { kind: "shadow" },
  opacity: { kind: "number", min: 0, max: 1 },
  objectFit: { kind: "enum", values: ["cover", "contain", "none"] },
  focalX: { kind: "number", min: 0, max: 100 },
  focalY: { kind: "number", min: 0, max: 100 },
};

const STYLE_KEYS = Object.keys(STYLE_RULES) as StyleKey[];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/;

function isColorLiteral(value: unknown): boolean {
  return typeof value === "string" && (HEX.test(value) || RGBA.test(value));
}

/**
 * CSS lengths in a shadow are commonly written `0 8px 24px rgba(...)` (a unitless
 * zero is legal), so accept unitless zero as well as px values.
 */
/**
 * A shadow is a comma-separated list of layers, each: optional `inset`, 2–4
 * lengths (a unitless `0` is legal) and a colour. Splitting respects the commas
 * inside `rgba(...)`.
 */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

const SHADOW_LAYER = /^(?:inset\s+)?(?:-?\d+(?:\.\d+)?(?:px)?\s+){2,4}(?:rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})$/;

function isShadowLiteral(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value === "none") return true;
  const layers = splitTopLevel(value);
  return layers.length > 0 && layers.every((layer) => SHADOW_LAYER.test(layer));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Is this a well-formed style value shape (`{ref}` or `{value}`)? */
function readStyleValue(input: unknown): { ref: string } | { value: unknown } | null {
  if (!isObject(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 1) return null;
  if (keys[0] === "ref" && typeof input.ref === "string") return { ref: input.ref };
  if (keys[0] === "value") return { value: input.value };
  return null;
}

/**
 * Validate one style object. Issues are emitted in STYLE_RULES order, then
 * unknown keys in input order, so two identical documents always produce the
 * same list.
 */
export function validateStyleSet(
  style: unknown,
  tokens: TokenTable,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(style)) {
    return [{ path, code: "style_not_object", message: "Style must be an object." }];
  }

  const present = new Set(Object.keys(style));
  for (const key of STYLE_KEYS) {
    if (!present.has(key)) continue;
    const rule = STYLE_RULES[key];
    const at = `${path}.${key}`;
    const parsed = readStyleValue(style[key]);
    if (!parsed) {
      issues.push({
        path: at,
        code: "style_value_shape",
        message: `${key} must be { ref: "family.name" } or { value: ... }.`,
      });
      continue;
    }

    if ("ref" in parsed) {
      const split = splitTokenPath(parsed.ref);
      if (!split) {
        issues.push({ path: at, code: "token_path_malformed", message: `"${parsed.ref}" is not family.name.` });
        continue;
      }
      const resolved = readToken(tokens, parsed.ref);
      if (resolved === undefined) {
        issues.push({
          path: at,
          code: "token_missing",
          message: `Token "${parsed.ref}" does not exist in this document.`,
        });
        continue;
      }
      const expected = rule.kind === "number" ? rule.token : rule.kind === "color" ? "color" : rule.kind === "fontFamily" ? "font" : rule.kind === "shadow" ? "shadow" : undefined;
      if (expected === undefined) {
        issues.push({ path: at, code: "token_not_allowed", message: `${key} does not accept a token reference.` });
        continue;
      }
      const gradientOk = rule.kind === "color" && rule.allowGradient && split.family === "gradient";
      if (split.family !== expected && !gradientOk) {
        issues.push({
          path: at,
          code: "token_family_mismatch",
          message: `${key} expects a ${expected} token, got ${split.family}.`,
        });
      }
      continue;
    }

    const value = parsed.value;
    switch (rule.kind) {
      case "enum": {
        if (!rule.values.includes(value as string | number)) {
          issues.push({
            path: at,
            code: "style_enum",
            message: `${key} must be one of: ${rule.values.join(", ")}.`,
          });
        }
        break;
      }
      case "boolean": {
        if (typeof value !== "boolean") {
          issues.push({ path: at, code: "style_boolean", message: `${key} must be true or false.` });
        }
        break;
      }
      case "number": {
        if (typeof value !== "number" || Number.isNaN(value)) {
          issues.push({ path: at, code: "style_number", message: `${key} must be a number.` });
          break;
        }
        if (value < rule.min || value > rule.max) {
          issues.push({
            path: at,
            code: "style_out_of_bounds",
            message: `${key} must be between ${rule.min} and ${rule.max}.`,
          });
        }
        break;
      }
      case "color": {
        const gradientAllowed = rule.allowGradient && typeof value === "string" && /^(linear|radial)-gradient\(/.test(value);
        if (!isColorLiteral(value) && !gradientAllowed) {
          issues.push({
            path: at,
            code: "style_color",
            message: `${key} must be a hex/rgba colour${rule.allowGradient ? " or a gradient" : ""}.`,
          });
        }
        break;
      }
      case "fontFamily": {
        if (typeof value !== "string" || !(FONT_ALLOWLIST as readonly string[]).includes(value)) {
          issues.push({
            path: at,
            code: "style_font_family",
            message: `fontFamily must be one of: ${FONT_ALLOWLIST.join(", ")}.`,
          });
        }
        break;
      }
      case "shadow": {
        if (!isShadowLiteral(value)) {
          issues.push({ path: at, code: "style_shadow", message: `${key} is not a shadow value.` });
        }
        break;
      }
    }
  }

  for (const key of Object.keys(style)) {
    if (!(key in STYLE_RULES)) {
      issues.push({
        path: `${path}.${key}`,
        code: "style_unknown_key",
        message: `"${key}" is not a supported style property.`,
      });
    }
  }

  return issues;
}
