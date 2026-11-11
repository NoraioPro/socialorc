import prisma from "@/lib/prisma";

/** Small per-workspace JSON settings (automation toggles, setup progress, language). */
export async function getSetting<T>(workspaceId: string, key: string): Promise<T | null> {
  const row = await prisma.workspaceSetting.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
  return (row?.value as T) ?? null;
}

export async function setSetting(workspaceId: string, key: string, value: unknown): Promise<void> {
  await prisma.workspaceSetting.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, value: value as never },
    update: { value: value as never },
  });
}
