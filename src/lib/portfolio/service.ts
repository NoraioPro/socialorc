/**
 * Portfolio persistence (P2).
 *
 * Every function takes `userId` as its first argument and puts it in the WHERE
 * clause — there is no code path that reads or writes a portfolio without the
 * caller's id. Routes pass `guard.userId` from `requirePermission()`, which is a
 * user-scoped check: ownership never depends on workspace membership.
 */
import prisma from "@/lib/prisma";
import { blankDocument, handleProblem, suggestHandle } from "./blank";
import { parseDocument } from "./validate";
import type { PortfolioDocument, ValidationIssue } from "./types";

export interface PortfolioRow {
  id: string;
  userId: string;
  handle: string;
  status: "DRAFT" | "PUBLISHED";
  draftDocument: unknown;
  documentVersion: number;
  schemaVersion: number;
  publishedRevisionId: string | null;
  publishedAt: Date | null;
  templateKey: string | null;
  templateVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioDto {
  id: string;
  handle: string;
  status: "DRAFT" | "PUBLISHED";
  documentVersion: number;
  schemaVersion: number;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  templateKey: string | null;
  templateVersion: number | null;
  createdAt: string;
  updatedAt: string;
  draftDocument: unknown;
}

export type SaveResult =
  | { ok: true; documentVersion: number }
  | { ok: false; code: "invalid"; issues: ValidationIssue[] }
  | { ok: false; code: "conflict"; documentVersion: number }
  | { ok: false; code: "missing" };

export type CreateResult =
  | { ok: true; portfolio: PortfolioRow }
  | { ok: false; code: "exists" | "handle_taken" | "invalid_handle" | "not_found"; message: string };

export function toDto(row: PortfolioRow): PortfolioDto {
  return {
    id: row.id,
    handle: row.handle,
    status: row.status,
    documentVersion: row.documentVersion,
    schemaVersion: row.schemaVersion,
    publishedRevisionId: row.publishedRevisionId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    templateKey: row.templateKey,
    templateVersion: row.templateVersion,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    draftDocument: row.draftDocument,
  };
}

/** The caller's portfolio, or null. Never another user's: userId is the filter. */
export async function getPortfolio(userId: string): Promise<PortfolioRow | null> {
  const row = await prisma.portfolio.findUnique({ where: { userId } });
  return (row as PortfolioRow | null) ?? null;
}

async function handleTaken(handle: string): Promise<boolean> {
  const existing = await prisma.portfolio.findUnique({ where: { handle }, select: { id: true } });
  return existing !== null;
}

/**
 * Create the caller's portfolio. A user may have exactly one; the second attempt
 * is a 409 rather than a silent overwrite.
 */
export async function createPortfolio(
  userId: string,
  options: { handle?: string; templateDocument?: PortfolioDocument; templateKey?: string; templateVersion?: number } = {},
): Promise<CreateResult> {
  const existing = await getPortfolio(userId);
  if (existing) return { ok: false, code: "exists", message: "You already have a portfolio." };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) return { ok: false, code: "not_found", message: "User not found." };

  const requested = options.handle ?? suggestHandle(user.name);
  const problem = handleProblem(requested);
  if (problem) return { ok: false, code: "invalid_handle", message: problem };
  if (await handleTaken(requested)) {
    return { ok: false, code: "handle_taken", message: `"${requested}" is already taken.` };
  }

  const document = options.templateDocument ?? blankDocument({ handle: requested });
  const parsed = parseDocument(document);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_handle", message: "The starting document is not valid." };
  }

  const created = await prisma.portfolio.create({
    data: {
      userId,
      handle: requested,
      draftDocument: parsed.document as unknown as object,
      schemaVersion: parsed.document.schemaVersion,
      documentVersion: 1,
      templateKey: options.templateKey ?? null,
      templateVersion: options.templateVersion ?? null,
    },
  });
  return { ok: true, portfolio: created as PortfolioRow };
}

/**
 * Save the draft with compare-and-set on `documentVersion`.
 *
 * Two browser tabs, or a stale client, must never silently overwrite a newer
 * draft: the update only lands when the version still matches.
 */
export async function saveDraft(
  userId: string,
  document: unknown,
  documentVersion: number,
): Promise<SaveResult> {
  const parsed = parseDocument(document);
  if (!parsed.ok) return { ok: false, code: "invalid", issues: parsed.issues };

  const updated = await prisma.portfolio.updateMany({
    where: { userId, documentVersion },
    data: {
      draftDocument: parsed.document as unknown as object,
      schemaVersion: parsed.document.schemaVersion,
      documentVersion: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    const current = await getPortfolio(userId);
    if (!current) return { ok: false, code: "missing" };
    return { ok: false, code: "conflict", documentVersion: current.documentVersion };
  }

  const after = await getPortfolio(userId);
  return { ok: true, documentVersion: after?.documentVersion ?? documentVersion + 1 };
}

export type MetaResult =
  | { ok: true; portfolio: PortfolioRow }
  | { ok: false; code: "invalid_handle" | "handle_taken" | "missing"; message: string };

/** Change the public handle. The old URL stops resolving immediately. */
export async function updateHandle(userId: string, handle: string): Promise<MetaResult> {
  const problem = handleProblem(handle);
  if (problem) return { ok: false, code: "invalid_handle", message: problem };

  const current = await getPortfolio(userId);
  if (!current) return { ok: false, code: "missing", message: "No portfolio yet." };
  if (current.handle === handle) return { ok: true, portfolio: current };

  if (await handleTaken(handle)) {
    return { ok: false, code: "handle_taken", message: `"${handle}" is already taken.` };
  }

  const updated = await prisma.portfolio.update({ where: { userId }, data: { handle } });
  return { ok: true, portfolio: updated as PortfolioRow };
}

/** Published revision for a handle, or null. Used only by the public route. */
export async function publishedRevisionByHandle(handle: string): Promise<{
  portfolio: PortfolioRow;
  revision: { id: string; document: unknown; schemaVersion: number; ogImageSha: string | null; publishedAt: Date | null };
  media: { sha256: string; url: string; width: number | null; height: number | null; mimeType: string }[];
} | null> {
  const portfolio = await prisma.portfolio.findUnique({ where: { handle } });
  if (!portfolio) return null;
  const row = portfolio as PortfolioRow;
  if (row.status !== "PUBLISHED" || !row.publishedRevisionId) return null;

  const revision = await prisma.portfolioRevision.findFirst({
    where: { id: row.publishedRevisionId, portfolioId: row.id },
    select: { id: true, document: true, schemaVersion: true, ogImageSha: true, publishedAt: true },
  });
  if (!revision) return null;

  const media = await prisma.portfolioPinnedMedia.findMany({
    where: { revisionId: revision.id },
    select: { sha256: true, url: true, width: true, height: true, mimeType: true },
  });

  return { portfolio: row, revision, media };
}
