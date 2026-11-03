/**
 * Document validation (P1).
 *
 * `parseDocument()` is the only gate a portfolio document passes through: the
 * API uses it before every write, publish uses it again before snapshotting, the
 * template seeder uses it, and the editor uses it on the client. Nothing renders
 * an unparsed tree.
 *
 * Guarantees:
 *  - deterministic: issues come back in document order (pages → nodes → keys),
 *    so the same input always yields the same list;
 *  - total: every problem found is reported, not just the first;
 *  - closed: unknown types, props, style keys and token references are refused,
 *    which is also what makes a cycle unrepresentable (ids must be unique).
 */
import { REGISTRY, childAllowed, isNodeType } from "./registry";
import { validateStyleSet } from "./style";
import { readToken, splitTokenPath } from "./tokens";
import {
  LIMITS,
  PORTFOLIO_SCHEMA_VERSION,
  type ParseResult,
  type PortfolioDocument,
  type PortfolioNode,
  type PortfolioPage,
  type TokenTable,
  type ValidationIssue,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Validate the token table itself: families, primitive values, no junk keys. */
function validateTokens(input: unknown, path: string, issues: ValidationIssue[]): TokenTable | null {
  if (!isObject(input)) {
    issues.push({ path, code: "tokens_not_object", message: "tokens must be an object." });
    return null;
  }
  const families = ["color", "font", "space", "radius", "shadow", "gradient"] as const;
  const out: TokenTable = { color: {}, font: {}, space: {}, radius: {}, shadow: {}, gradient: {} };

  for (const key of Object.keys(input)) {
    if (!(families as readonly string[]).includes(key)) {
      issues.push({ path: `${path}.${key}`, code: "tokens_unknown_family", message: `"${key}" is not a token family.` });
    }
  }

  for (const family of families) {
    const bucket = input[family];
    if (bucket === undefined) continue;
    if (!isObject(bucket)) {
      issues.push({ path: `${path}.${family}`, code: "tokens_family_not_object", message: `${family} must be an object.` });
      continue;
    }
    for (const [name, value] of Object.entries(bucket)) {
      if (!/^[a-z0-9-]{1,40}$/.test(name)) {
        issues.push({
          path: `${path}.${family}.${name}`,
          code: "token_name_invalid",
          message: "Token names are lowercase letters, digits and dashes.",
        });
        continue;
      }
      if (family === "space" || family === "radius") {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          issues.push({
            path: `${path}.${family}.${name}`,
            code: "token_value_invalid",
            message: `${family} tokens must be non-negative numbers.`,
          });
          continue;
        }
        (out[family] as Record<string, number>)[name] = value;
      } else {
        if (typeof value !== "string" || value.length === 0 || value.length > 300) {
          issues.push({
            path: `${path}.${family}.${name}`,
            code: "token_value_invalid",
            message: `${family} tokens must be non-empty strings.`,
          });
          continue;
        }
        (out[family] as Record<string, string>)[name] = value;
      }
    }
  }
  return out;
}

/** Resolve the effective token table: explicit override wins, document fills gaps. */
function effectiveTokens(documentTokens: TokenTable, override?: TokenTable): TokenTable {
  if (!override) return documentTokens;
  const merged: TokenTable = { color: {}, font: {}, space: {}, radius: {}, shadow: {}, gradient: {} };
  for (const family of ["color", "font", "space", "radius", "shadow", "gradient"] as const) {
    Object.assign(merged[family] as Record<string, string | number>, documentTokens[family], override[family]);
  }
  return merged;
}

function validateResponsive(
  input: unknown,
  path: string,
  tokens: TokenTable,
  issues: ValidationIssue[],
): void {
  if (input === undefined) return;
  if (!isObject(input)) {
    issues.push({ path, code: "responsive_not_object", message: "responsive must be an object." });
    return;
  }
  for (const key of Object.keys(input)) {
    if (key !== "tablet" && key !== "mobile") {
      issues.push({
        path: `${path}.${key}`,
        code: "responsive_unknown_breakpoint",
        message: 'Only "tablet" and "mobile" overrides exist.',
      });
    }
  }
  for (const breakpoint of ["tablet", "mobile"] as const) {
    const value = input[breakpoint];
    if (value === undefined) continue;
    issues.push(...validateStyleSet(value, tokens, `${path}.${breakpoint}`));
  }
}

function validateProps(
  type: keyof typeof REGISTRY,
  props: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  const spec = REGISTRY[type];
  const result = spec.schema.safeParse(props);
  if (result.success) return;
  for (const issue of result.error.issues) {
    const where = issue.path.length ? `${path}.props.${issue.path.join(".")}` : `${path}.props`;
    issues.push({ path: where, code: `props_${issue.code}`, message: issue.message });
  }
}

interface WalkState {
  tokens: TokenTable;
  ids: Set<string>;
  issues: ValidationIssue[];
  nodeCount: number;
  pageCount: number;
}

function validateNode(input: unknown, path: string, depth: number, state: WalkState): void {
  if (!isObject(input)) {
    state.issues.push({ path, code: "node_not_object", message: "A node must be an object." });
    return;
  }

  state.nodeCount += 1;
  if (state.nodeCount > LIMITS.maxNodesPerDocument) {
    state.issues.push({
      path,
      code: "too_many_nodes",
      message: `The document exceeds ${LIMITS.maxNodesPerDocument} nodes.`,
    });
    return;
  }
  if (depth > LIMITS.maxDepth) {
    state.issues.push({ path, code: "too_deep", message: `Nesting deeper than ${LIMITS.maxDepth} is not allowed.` });
    return;
  }

  const id = input.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    state.issues.push({ path: `${path}.id`, code: "node_id_invalid", message: "Node ids are 1–64 URL-safe characters." });
  } else if (state.ids.has(id)) {
    state.issues.push({
      path: `${path}.id`,
      code: "node_id_duplicate",
      message: `Node id "${id}" appears more than once; ids must be unique (this also rules out cycles).`,
    });
  } else {
    state.ids.add(id);
  }

  const type = input.type;
  if (!isNodeType(type)) {
    state.issues.push({
      path: `${path}.type`,
      code: "node_type_unknown",
      message: `"${String(type)}" is not a registered component type.`,
    });
    return;
  }

  validateProps(type, input.props, path, state.issues);
  state.issues.push(...validateStyleSet(input.style ?? {}, state.tokens, `${path}.style`));
  validateResponsive(input.responsive, `${path}.responsive`, state.tokens, state.issues);

  if (input.position !== undefined) {
    const position = input.position;
    if (!isObject(position) || position.mode !== "FLOW" || Object.keys(position).length !== 1) {
      state.issues.push({
        path: `${path}.position`,
        code: "position_not_allowed",
        message: 'Only { mode: "FLOW" } is supported; absolute positioning is not part of this schema.',
      });
    }
  }

  if (input.mediaSha !== undefined) {
    if (type !== "IMAGE") {
      state.issues.push({
        path: `${path}.mediaSha`,
        code: "media_sha_misplaced",
        message: "mediaSha is only valid on IMAGE nodes in a published revision.",
      });
    } else if (typeof input.mediaSha !== "string" || !SHA256.test(input.mediaSha)) {
      state.issues.push({
        path: `${path}.mediaSha`,
        code: "media_sha_invalid",
        message: "mediaSha must be a 64-character hex digest.",
      });
    }
  }

  const spec = REGISTRY[type];
  const children = input.children;
  if (children !== undefined) {
    if (!Array.isArray(children)) {
      state.issues.push({ path: `${path}.children`, code: "children_not_array", message: "children must be an array." });
      return;
    }
    if (!spec.allowsChildren && children.length > 0) {
      state.issues.push({
        path: `${path}.children`,
        code: "children_not_allowed",
        message: `${type} is a leaf component and cannot contain children.`,
      });
      return;
    }
    children.forEach((child, index) => {
      const childPath = `${path}.children[${index}]`;
      if (isObject(child) && isNodeType(child.type) && !childAllowed(type, child.type)) {
        state.issues.push({
          path: `${childPath}.type`,
          code: "child_type_not_allowed",
          message: `${child.type} cannot be placed inside ${type}. Allowed: ${spec.allowedChildren.join(", ") || "none"}.`,
        });
      }
      validateNode(child, childPath, depth + 1, state);
    });
    return;
  }

  if (spec.allowsChildren && type !== "PAGE" && type !== "SECTION") {
    // Empty containers are legitimate while drafting; nothing to report.
    return;
  }
}

function validatePage(input: unknown, index: number, state: WalkState): void {
  const path = `pages[${index}]`;
  if (!isObject(input)) {
    state.issues.push({ path, code: "page_not_object", message: "A page must be an object." });
    return;
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    state.issues.push({ path: `${path}.id`, code: "page_id_invalid", message: "A page needs an id." });
  }
  if (typeof input.slug !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(input.slug)) {
    state.issues.push({
      path: `${path}.slug`,
      code: "page_slug_invalid",
      message: "A page slug is lowercase letters, digits and dashes (1–40).",
    });
  }
  if (typeof input.title !== "string" || input.title.length === 0 || input.title.length > 120) {
    state.issues.push({ path: `${path}.title`, code: "page_title_invalid", message: "A page title is 1–120 characters." });
  }
  if (typeof input.isHome !== "boolean") {
    state.issues.push({ path: `${path}.isHome`, code: "page_home_invalid", message: "isHome must be boolean." });
  }

  if (input.seo !== undefined) {
    if (!isObject(input.seo)) {
      state.issues.push({ path: `${path}.seo`, code: "page_seo_invalid", message: "seo must be an object." });
    } else {
      for (const [key, value] of Object.entries(input.seo)) {
        if (!["title", "description", "ogImageSha"].includes(key)) {
          state.issues.push({
            path: `${path}.seo.${key}`,
            code: "page_seo_unknown",
            message: `"${key}" is not a supported SEO field.`,
          });
          continue;
        }
        if (value === undefined) continue;
        if (typeof value !== "string") {
          state.issues.push({ path: `${path}.seo.${key}`, code: "page_seo_value", message: `${key} must be a string.` });
          continue;
        }
        if (key === "ogImageSha" && !SHA256.test(value)) {
          state.issues.push({
            path: `${path}.seo.ogImageSha`,
            code: "page_og_sha_invalid",
            message: "ogImageSha must be a 64-character hex digest.",
          });
        }
        if (key === "title" && value.length > 120) {
          state.issues.push({ path: `${path}.seo.title`, code: "page_seo_too_long", message: "SEO titles are ≤120 characters." });
        }
        if (key === "description" && value.length > 300) {
          state.issues.push({
            path: `${path}.seo.description`,
            code: "page_seo_too_long",
            message: "SEO descriptions are ≤300 characters.",
          });
        }
      }
    }
  }

  if (input.settings !== undefined) {
    if (!isObject(input.settings)) {
      state.issues.push({ path: `${path}.settings`, code: "page_settings_invalid", message: "settings must be an object." });
    } else {
      for (const [key, value] of Object.entries(input.settings)) {
        if (!["maxWidth", "background", "paddingY"].includes(key)) {
          state.issues.push({
            path: `${path}.settings.${key}`,
            code: "page_settings_unknown",
            message: `"${key}" is not a supported page setting.`,
          });
          continue;
        }
        if (key === "maxWidth" || key === "paddingY") {
          if (typeof value !== "number" || value < 0 || value > 2000) {
            state.issues.push({
              path: `${path}.settings.${key}`,
              code: "page_settings_bounds",
              message: `${key} must be a number between 0 and 2000.`,
            });
          }
        }
        if (key === "background" && !isObject(value)) {
          state.issues.push({
            path: `${path}.settings.background`,
            code: "page_settings_background",
            message: "background must be a style value.",
          });
        }
      }
    }
  }

  const root = input.root;
  if (!isObject(root)) {
    state.issues.push({ path: `${path}.root`, code: "page_root_missing", message: "A page needs a PAGE root." });
    return;
  }
  if (root.type !== "PAGE") {
    state.issues.push({
      path: `${path}.root.type`,
      code: "page_root_wrong_type",
      message: 'The page root must be { type: "PAGE" }.',
    });
    return;
  }
  const children = root.children;
  if (!Array.isArray(children) || children.length === 0) {
    state.issues.push({
      path: `${path}.root.children`,
      code: "page_root_empty",
      message: "A page needs at least one SECTION.",
    });
  }
  const before = state.nodeCount;
  validateNode(root, `${path}.root`, 1, state);
  if (state.nodeCount - before > LIMITS.maxNodesPerPage) {
    state.issues.push({
      path: `${path}.root`,
      code: "too_many_nodes_in_page",
      message: `A page may hold at most ${LIMITS.maxNodesPerPage} nodes.`,
    });
  }
}

/**
 * Parse and validate a portfolio document.
 *
 * @param input   unknown JSON (from the API, a template or the editor)
 * @param options.tokens optional token table override (e.g. the workspace theme)
 */
export function parseDocument(input: unknown, options?: { tokens?: TokenTable }): ParseResult {
  const issues: ValidationIssue[] = [];

  if (!isObject(input)) {
    return { ok: false, issues: [{ path: "", code: "document_not_object", message: "A document must be an object." }] };
  }

  for (const key of Object.keys(input)) {
    if (!["schemaVersion", "tokens", "pages", "meta"].includes(key)) {
      issues.push({ path: key, code: "document_unknown_key", message: `"${key}" is not part of a portfolio document.` });
    }
  }

  if (input.schemaVersion !== PORTFOLIO_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      code: "schema_version_unsupported",
      message: `Unsupported schemaVersion: ${String(input.schemaVersion)}. Expected ${PORTFOLIO_SCHEMA_VERSION}.`,
    });
  }

  const documentTokens = validateTokens(input.tokens, "tokens", issues);
  const tokens = documentTokens ? effectiveTokens(documentTokens, options?.tokens) : { color: {}, font: {}, space: {}, radius: {}, shadow: {}, gradient: {} };

  if (!Array.isArray(input.pages)) {
    issues.push({ path: "pages", code: "pages_not_array", message: "pages must be an array." });
  } else {
    if (input.pages.length === 0) {
      issues.push({ path: "pages", code: "pages_empty", message: "A portfolio needs at least one page." });
    }
    if (input.pages.length > LIMITS.maxPages) {
      issues.push({
        path: "pages",
        code: "too_many_pages",
        message: `A portfolio may hold at most ${LIMITS.maxPages} pages.`,
      });
    }
    const homeCount = input.pages.filter((page) => isObject(page) && page.isHome === true).length;
    if (homeCount > 1) {
      issues.push({ path: "pages", code: "pages_multiple_home", message: "Only one page can be the home page." });
    }
  }

  if (input.meta !== undefined) {
    if (!isObject(input.meta)) {
      issues.push({ path: "meta", code: "meta_invalid", message: "meta must be an object." });
    } else {
      for (const key of Object.keys(input.meta)) {
        if (!["locale", "createdAt", "templateKey", "templateVersion"].includes(key)) {
          issues.push({ path: `meta.${key}`, code: "meta_unknown_key", message: `"${key}" is not a meta field.` });
        }
      }
      if (input.meta.locale !== undefined && input.meta.locale !== "en") {
        issues.push({ path: "meta.locale", code: "meta_locale", message: 'Only "en" is supported in this schema.' });
      }
    }
  }

  if (Array.isArray(input.pages)) {
    const state: WalkState = { tokens, ids: new Set<string>(), issues, nodeCount: 0, pageCount: 0 };
    input.pages.forEach((page, index) => {
      state.pageCount += 1;
      if (state.pageCount > LIMITS.maxPages) return;
      validatePage(page, index, state);
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: input as unknown as PortfolioDocument };
}

/** Count nodes in a validated document (used by caps and by the editor HUD). */
export function countNodes(document: PortfolioDocument): number {
  let total = 0;
  const walk = (node: PortfolioNode): void => {
    total += 1;
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => walk(page.root));
  return total;
}

/** Find a node by id anywhere in the document, or null. */
export function findNode(document: PortfolioDocument, id: string): PortfolioNode | null {
  let found: PortfolioNode | null = null;
  const walk = (node: PortfolioNode): void => {
    if (found) return;
    if (node.id === id) {
      found = node;
      return;
    }
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => walk(page.root));
  return found;
}

/** Every token path referenced anywhere in the document (for token-delete checks). */
export function referencedTokens(document: PortfolioDocument): Set<string> {
  const refs = new Set<string>();
  const collectStyle = (style: unknown): void => {
    if (!isObject(style)) return;
    for (const value of Object.values(style)) {
      if (isObject(value) && typeof value.ref === "string" && splitTokenPath(value.ref) && readToken(document.tokens, value.ref) !== undefined) {
        refs.add(value.ref);
      }
    }
  };
  const walk = (node: PortfolioNode): void => {
    collectStyle(node.style);
    collectStyle(node.responsive?.tablet);
    collectStyle(node.responsive?.mobile);
    node.children?.forEach(walk);
  };
  document.pages.forEach((page) => {
    collectStyle(page.settings.background);
    walk(page.root);
  });
  return refs;
}

export type { PortfolioPage };
