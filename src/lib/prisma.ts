import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { withTenantStamping } from "@/lib/tenancy/stamp";

/**
 * One client, two drivers.
 *
 * Prisma 7 requires an explicit driver adapter, and the sqlite adapter cannot
 * open a `postgres://` URL (nor the postgres adapter a `file:` one), so the
 * driver is chosen from the same DATABASE_URL scheme that prisma7.config.ts uses
 * to pick the schema — one fact, one decision, no way for the two to disagree.
 */
const connectionString = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres = /^postgres(ql)?:\/\//i.test(connectionString);

const adapter = isPostgres
  ? new PrismaPg({ connectionString })
  : new PrismaBetterSqlite3({ url: connectionString });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * The client is wrapped so that creates on the tenant models pick up their
 * workspace automatically (docs/SAAS-PLAN.md Phase 0.3). Doing it here rather
 * than at ~70 call sites is what stops the next new call site from being the one
 * that forgets — see src/lib/tenancy/stamp.ts.
 */
function createClient(): PrismaClient {
  return withTenantStamping(new PrismaClient({ adapter }));
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
