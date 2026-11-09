import prisma from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenancy/guard";

const LABEL: Record<string, string> = {
  APPROVED: "Approved", REJECTED: "Sent back", SUBMITTED: "Submitted for review", SCHEDULED: "Scheduled",
  PUBLISHED: "Published", PUBLISH_FAILED: "Publish failed", ROLE_CHANGED: "Role changed", SELF_APPROVED_SOLO: "Self-approved (solo)",
};
export type RunRow = { id: string; action: string; label: string; actor: string; at: Date; ok: boolean };

/** Real workspace activity from the audit trail; used as the "Recent runs" list. */
export async function getRecentRuns(tenant: TenantContext, take = 8): Promise<RunRow[]> {
  const rows = await prisma.auditEvent.findMany({
    where: { workspaceId: tenant.workspaceId },
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, action: true, actorLabel: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id, action: r.action, label: LABEL[r.action] ?? r.action.toLowerCase().replace(/_/g, " "),
    actor: r.actorLabel ?? "System", at: r.createdAt, ok: r.action !== "PUBLISH_FAILED" && r.action !== "REJECTED",
  }));
}
