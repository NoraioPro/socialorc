import prisma from "@/lib/prisma";
import { parsePortfolioDoc, readPortfolioDoc } from "./schema";
import type { PortfolioDoc } from "./types";

/**
 * Server-side rules for portfolios: addresses, versions, publishing checks and
 * the shape returned to the editor. Routes stay thin and call into here.
 */

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const RESERVED = new Set([
  "admin", "api", "app", "auth", "dashboard", "help", "login", "logout", "new", "p", "portfolio", "portfolios",
  "register", "settings", "signup", "socialork", "socialorc", "support", "www", "about", "edit", "preview",
]);
export const REDIRECT_DAYS = 30;
const AUTOSAVE_EVERY_MS = 10 * 60 * 1000;
const KEEP_AUTOSAVES = 30;

export type HandleStatus = "ok" | "invalid" | "reserved" | "taken";

export function normaliseHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
}

export async function handleStatus(handle: string, ownPortfolioId?: string): Promise<HandleStatus> {
  if (!HANDLE_RE.test(handle)) return "invalid";
  if (RESERVED.has(handle)) return "reserved";
  const [owner, redirect] = await Promise.all([
    prisma.portfolio.findUnique({ where: { handle }, select: { id: true } }),
    prisma.portfolioRedirect.findUnique({ where: { oldHandle: handle }, select: { portfolioId: true, expiresAt: true } }),
  ]);
  if (owner && owner.id !== ownPortfolioId) return "taken";
  if (redirect && redirect.expiresAt > new Date() && redirect.portfolioId !== ownPortfolioId) return "taken";
  return "ok";
}

export function handleMessage(status: HandleStatus): string {
  switch (status) {
    case "ok": return "Available";
    case "invalid": return "Use 3–40 lowercase letters, numbers or hyphens, not starting or ending with a hyphen.";
    case "reserved": return "That address is reserved. Try another.";
    case "taken": return "That address is taken. Try another.";
  }
}

export async function suggestHandles(base: string): Promise<string[]> {
  const root = normaliseHandle(base).replace(/^-+|-+$/g, "").slice(0, 30) || "me";
  const candidates = [root, `${root}-studio`, `${root}-work`, `${root}-${new Date().getFullYear()}`];
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= 3) break;
    if ((await handleStatus(c)) === "ok") out.push(c);
  }
  return out;
}

export interface PortfolioDTO {
  id: string;
  handle: string;
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  doc: PortfolioDoc;
  revision: number;
  publishedAt: string | null;
  searchIndexing: boolean;
  hasUnpublishedChanges: boolean;
  templateId: string | null;
  updatedAt: string;
}

type PortfolioRow = NonNullable<Awaited<ReturnType<typeof prisma.portfolio.findUnique>>>;

export async function toDTO(p: PortfolioRow): Promise<PortfolioDTO> {
  let published: string | null = null;
  if (p.publishedVersionId) {
    const v = await prisma.portfolioVersion.findUnique({ where: { id: p.publishedVersionId }, select: { doc: true } });
    published = v?.doc ?? null;
  }
  return {
    id: p.id,
    handle: p.handle,
    status: (["DRAFT", "PUBLISHED", "UNPUBLISHED"].includes(p.status) ? p.status : "DRAFT") as PortfolioDTO["status"],
    doc: readPortfolioDoc(p.draftDoc),
    revision: p.draftRevision,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    searchIndexing: p.searchIndexing,
    hasUnpublishedChanges: p.status === "PUBLISHED" && published !== null && published !== p.draftDoc,
    templateId: p.templateId,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serialise(doc: PortfolioDoc): string {
  return JSON.stringify(doc);
}

/** Keep an autosave version at most every 10 minutes, and only the newest 30. */
export async function maybeAutosaveVersion(portfolioId: string, previousDraft: string, userId: string): Promise<void> {
  const last = await prisma.portfolioVersion.findFirst({ where: { portfolioId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, doc: true } });
  if (last && (Date.now() - last.createdAt.getTime() < AUTOSAVE_EVERY_MS || last.doc === previousDraft)) return;
  await prisma.portfolioVersion.create({ data: { portfolioId, kind: "AUTOSAVE", doc: previousDraft, createdById: userId } });
  const old = await prisma.portfolioVersion.findMany({ where: { portfolioId, kind: "AUTOSAVE" }, orderBy: { createdAt: "desc" }, skip: KEEP_AUTOSAVES, select: { id: true } });
  if (old.length) await prisma.portfolioVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export { publishChecks, type PublishCheck } from "./checks";

export function parseOrError(input: unknown): { ok: true; doc: PortfolioDoc } | { ok: false; error: string } {
  return parsePortfolioDoc(input);
}
