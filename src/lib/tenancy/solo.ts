import prisma from "@/lib/prisma";

/**
 * Whether the user is the only member of their (oldest) workspace.
 *
 * Someone who signed up on their own, with no team, owns everything in their
 * private workspace, so they hold every permission there whatever `User.role`
 * says. That role is global and older accounts may carry a lower one (they could
 * not even connect a social account). The rule stops applying the moment a
 * second member joins, after which each person's stored role governs again.
 */
export async function isSoleWorkspaceMember(userId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { workspace: { select: { _count: { select: { members: true } } } } },
  });
  return membership?.workspace._count.members === 1;
}
