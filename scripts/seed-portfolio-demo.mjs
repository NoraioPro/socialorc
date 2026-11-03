/**
 * Local demo seed: one verified account with a workspace so the Portfolio screen
 * is reachable. Safe to re-run (upsert by email). Never run against production.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Prisma 7 needs an explicit driver adapter; pick it from the URL scheme the same
// way src/lib/prisma.ts does.
const connectionString = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const adapter = /^postgres(ql)?:\/\//i.test(connectionString)
  ? new PrismaPg({ connectionString })
  : new PrismaBetterSqlite3({ url: connectionString });
const prisma = new PrismaClient({ adapter });
const EMAIL = "demo@socialork.test";
const PASSWORD = "Portfolio123!";

async function main() {
  const password = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password, name: "Demo Designer", onboardedAt: new Date(), role: "ADMIN" },
    create: {
      email: EMAIL,
      name: "Demo Designer",
      password,
      role: "ADMIN",
      onboardedAt: new Date(),
      timezone: "Europe/Oslo",
      headline: "Product designer",
    },
  });

  const existing = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (!existing) {
    const workspace = await prisma.workspace.create({
      data: {
        name: "Demo workspace",
        slug: `demo-${user.id.slice(0, 6)}`,
        members: { create: { userId: user.id, role: "ADMIN" } },
      },
    });
    console.log("workspace created:", workspace.id);
  }

  console.log("user:", user.email, "id:", user.id);
  console.log("password:", PASSWORD);
}

main()
  .catch((error) => {
    console.error("seed failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
