/**
 * Blank canvas + handle rules (P2).
 *
 * A brand-new portfolio must already be a *valid* document: `parseDocument()`
 * rejects a page with no sections, so the empty document is PAGE → one empty
 * SECTION. That is the smallest thing a user can start editing from.
 */
import { DEFAULT_TOKENS } from "./tokens";
import {
  PORTFOLIO_SCHEMA_VERSION,
  type PortfolioDocument,
  type PortfolioNode,
} from "./types";

let seed = 0;
const id = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(seed += 1).toString(36)}`;

/** Handles that would collide with routes or reserved words. */
export const RESERVED_HANDLES = new Set([
  "api",
  "p",
  "admin",
  "settings",
  "login",
  "signin",
  "register",
  "onboarding",
  "socialork",
  "review",
  "connect",
  "privacy",
  "terms",
  "data-deletion",
  "about",
  "characters",
  "dashboard",
  "help",
  "support",
]);

export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Why a handle is unacceptable, or null when it is fine. */
export function handleProblem(handle: unknown): string | null {
  if (typeof handle !== "string") return "A handle is required.";
  if (!HANDLE_PATTERN.test(handle)) {
    return "Handles are 3–40 characters: lowercase letters, digits and dashes, and cannot start or end with a dash.";
  }
  if (RESERVED_HANDLES.has(handle)) return `"${handle}" is reserved.`;
  return null;
}

const emptySection = (): PortfolioNode => ({
  id: id("section"),
  type: "SECTION",
  props: { fullBleed: true },
  style: {},
  children: [],
});

/** A valid, empty document: PAGE root with one sibling SECTION. */
export function blankDocument(options?: { title?: string; handle?: string }): PortfolioDocument {
  const pageId = id("page");
  const root: PortfolioNode = {
    id: id("root"),
    type: "PAGE",
    props: {},
    style: {},
    children: [emptySection()],
  };
  return {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    tokens: DEFAULT_TOKENS,
    pages: [
      {
        id: pageId,
        slug: options?.handle ?? "home",
        title: options?.title ?? "Home",
        isHome: true,
        seo: {},
        settings: {},
        root,
      },
    ],
    meta: { locale: "en", createdAt: new Date().toISOString() },
  };
}

/** Suggested handle from a display name: "Alex Morgan" → "alex-morgan". */
export function suggestHandle(name: string | null | undefined, fallback = "portfolio"): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  const candidate = base.length >= 3 ? base : fallback;
  return HANDLE_PATTERN.test(candidate) ? candidate : fallback;
}
