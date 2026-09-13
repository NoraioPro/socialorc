import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdapterStatus, isMockAdapterAllowed } from "@/lib/adapters";
import { platformReadiness, summarizeHealth } from "@/lib/health";
import { isMockAIAllowed, isOpenAIAvailable } from "@/lib/ai";
import { mediaStorage } from "@/lib/media-storage";

/**
 * Deployment health check.
 *
 * Answers the two questions an operator asks after a deploy: is the database
 * there and migrated, and which connectors can actually publish. Reports
 * booleans and variable NAMES only — never a credential value.
 */
export async function GET() {
  const startedAt = Date.now();

  let databaseReachable = false;
  let appliedMigrations: number | null = null;
  let pendingJobs: number | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReachable = true;

    try {
      const rows = await prisma.$queryRaw<{ count: bigint | number }[]>`SELECT COUNT(*) AS count FROM _prisma_migrations`;
      appliedMigrations = Number(rows[0]?.count ?? 0);
    } catch {
      // Table missing on a database that was created before migrations existed.
      appliedMigrations = 0;
    }

    pendingJobs = await prisma.scheduledJob.count({ where: { status: "PENDING" } });
  } catch (error) {
    console.error("Health check: database unreachable:", error instanceof Error ? error.message : error);
  }

  const readiness = platformReadiness(getAdapterStatus());
  const report = summarizeHealth({
    databaseReachable,
    appliedMigrations,
    pendingJobs,
    platforms: readiness,
  });

  return NextResponse.json(
    {
      ...report,
      /** Per-connector detail: configured?, and which variable NAMES are missing. */
      connectors: readiness,
      appVersion: process.env.npm_package_version ?? "unknown",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
      environment: process.env.NODE_ENV ?? "unknown",
      /**
       * Deployment capabilities, so the UI and an operator can tell a real
       * integration apart from a development stand-in. A mock adapter or mock AI
       * must never be mistaken for a working connector.
       */
      capabilities: {
        /** Can a mock adapter stand in for a platform here? False in production. */
        mockAdaptersAllowed: isMockAdapterAllowed(),
        /** Would AI return synthetic text here? False in production. */
        mockAIAllowed: isMockAIAllowed(),
        /** Is a real AI provider key present? */
        aiConfigured: isOpenAIAvailable(),
        /** Where uploads can live: blob | dev-base64 | unconfigured. */
        mediaStorage: mediaStorage(),
      },
      responseMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    },
    { status: report.status === "error" ? 503 : 200 },
  );
}

export const dynamic = "force-dynamic";
