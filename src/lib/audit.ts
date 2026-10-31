/**
 * The audit trail.
 *
 * Every decision that changes what the product does is appended here — never
 * updated, never deleted. The row carries who acted, from which address, on what,
 * and a small detail payload, so "who approved this and when" is a single query.
 *
 * Writes are best-effort: a failure to record must never fail the action the user
 * asked for, but it is logged loudly so it can be repaired.
 */
import type { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";

export type AuditAction =
  | "APPROVED"
  | "REJECTED"
  | "SUBMITTED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "PUBLISH_FAILED"
  | "ROLE_CHANGED"
  | "MEMBER_REMOVED"
  | "SELF_APPROVED_SOLO"
  | "REVIEW_LINK_APPROVED"
  | "REVIEW_LINK_CHANGES";

export interface AuditInput {
  workspaceId: string;
  actorId?: string | null;
  actorLabel?: string | null;
  action: AuditAction;
  subjectType: "POST" | "MEMBER" | "ACCOUNT" | "WORKSPACE";
  subjectId?: string | null;
  detail?: Record<string, unknown>;
  ip?: string | null;
  platform?: Platform | null;
}

/** Best-effort client address from proxy headers; null when absent. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId ?? null,
        detail: (input.detail ?? undefined) as never,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    // Never fail the user's action because the trail could not be written, but
    // never swallow it silently either.
    console.error("audit.write_failed", { action: input.action, subjectId: input.subjectId, error });
  }
}

export interface AuditRow {
  id: string;
  action: string;
  actorLabel: string | null;
  actorId: string | null;
  subjectType: string;
  subjectId: string | null;
  ip: string | null;
  createdAt: Date;
  detail: unknown;
}

export async function recentAudit(workspaceId: string, take = 60): Promise<AuditRow[]> {
  return prisma.auditEvent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, action: true, actorLabel: true, actorId: true,
      subjectType: true, subjectId: true, ip: true, createdAt: true, detail: true,
    },
  });
}
