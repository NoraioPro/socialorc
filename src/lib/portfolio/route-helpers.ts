import { NextResponse } from "next/server";
import { portfolioEnabled } from "@/lib/features";
import prisma from "@/lib/prisma";
import type { UserGuard } from "@/lib/tenancy/guard";

/**
 * Every portfolio route calls `portfolioCaller(await requirePermission(...))`:
 * the signed-in user and their role (no workspace needed: a portfolio belongs to
 * a person), then the feature flag. Queries key on the caller's `userId`, so a
 * caller can only ever reach their own portfolio.
 */
export function portfolioCaller(tenant: UserGuard): { ok: true; userId: string } | { ok: false; response: NextResponse } {
  if (!portfolioEnabled()) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!tenant.ok) return { ok: false, response: NextResponse.json({ error: tenant.error }, { status: tenant.status }) };
  return { ok: true, userId: tenant.userId };
}

export async function ownPortfolio(userId: string) {
  return prisma.portfolio.findUnique({ where: { userId } });
}

export const notFound = () => NextResponse.json({ error: "You don’t have a portfolio yet." }, { status: 404 });
export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
