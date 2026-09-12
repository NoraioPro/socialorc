/**
 * Throwaway: prove the application's own Prisma client talks to Supabase.
 * Uses the real src/lib/prisma.ts (so the adapter selection is exercised), does a
 * create/read/delete round trip, and verifies the newly-added tables exist.
 * Cleans up after itself.
 *
 * Wrapped in main() rather than top-level await: the repo's tsconfig compiles to
 * CommonJS, where module-scope await is a transform error.
 */
import prisma from "../src/lib/prisma";

async function main() {
  const email = `smoke+${Date.now()}@example.test`;

  // Remove anything a previous run may have left behind.
  await prisma.user.deleteMany({ where: { email: { startsWith: "smoke+" } } });

  const created = await prisma.user.create({
    data: {
      email,
      name: "Supabase Smoke",
      role: "EDITOR",
      timezone: "Europe/Oslo",
    },
    select: { id: true, email: true, role: true },
  });
  console.log("CREATE ok  :", created.email, "role=" + created.role);

  const found = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  console.log("READ   ok  :", found?.id === created.id);

  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log("TABLES     :", tables.length);

  const expected = ["BrandBrain", "Brain", "FeedComment", "FeedReaction"];
  const names = tables.map((t) => t.table_name);
  const missing = expected.filter((t) => !names.includes(t));
  console.log(
    "1_expand   :",
    missing.length === 0 ? "all 4 new tables present" : "MISSING " + missing.join(","),
  );

  await prisma.user.delete({ where: { id: created.id } });
  console.log("DELETE ok  : row cleaned up");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("SMOKE FAILED:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
