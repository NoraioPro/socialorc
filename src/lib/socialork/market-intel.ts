import { PostStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildBrandContextPrompt } from "@/types/brand-brain";
import { loadBrandContext } from "@/lib/brand-context";
import { chatText } from "@/lib/ai";
import { resolveAiConfigForUser } from "@/lib/ai-config";
import { getSetting, setSetting } from "./settings";

export interface Competitor { id: string; name: string; handle: string; note: string }
const KEY = "competitors";
export const listCompetitors = async (w: string) => (await getSetting<Competitor[]>(w, KEY)) ?? [];
export async function addCompetitor(w: string, c: Omit<Competitor, "id">) {
  const list = await listCompetitors(w);
  if (list.length >= 25) throw new Error("Up to 25 competitors");
  await setSetting(w, KEY, [...list, { id: Math.random().toString(36).slice(2, 10), name: c.name.slice(0, 80), handle: c.handle.slice(0, 80), note: c.note.slice(0, 400) }]);
}
export async function removeCompetitor(w: string, id: string) {
  await setSetting(w, KEY, (await listCompetitors(w)).filter((c) => c.id !== id));
}

/** The workspace's own measured facts: what we actually published, by channel. */
export async function ownFacts(workspaceId: string) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [byPlatform, recent, statuses] = await Promise.all([
    prisma.post.groupBy({ by: ["platform"], where: { workspaceId, status: PostStatus.PUBLISHED, publishedAt: { gte: since } }, _count: { _all: true } }),
    prisma.post.findMany({ where: { workspaceId, status: PostStatus.PUBLISHED }, orderBy: { publishedAt: "desc" }, take: 8, select: { title: true, platform: true, content: true } }),
    prisma.post.groupBy({ by: ["status"], where: { workspaceId }, _count: { _all: true } }),
  ]);
  return {
    published30: byPlatform.map((r) => ({ platform: r.platform as string, count: r._count._all })).sort((a, b) => b.count - a.count),
    recent: recent.map((p) => ({ title: p.title ?? "Untitled", platform: p.platform as string, excerpt: p.content.slice(0, 160) })),
    statuses: Object.fromEntries(statuses.map((s) => [s.status, s._count._all])) as Record<string, number>,
  };
}

const SYSTEM = `You are the market analyst inside a social media management tool.
Answer ONLY from the context given (the workspace's own post counts, recent posts, brand profile and the competitor watchlist the user typed in).
You have no live market data: never state engagement rates, follower counts, benchmarks or statistics about competitors or the niche, and never invent them.
If a question needs data you do not have, say what is missing and what the user could track. Give concrete, ranked suggestions as short bullet points. Be brief.`;

export async function askAnalyst(workspaceId: string, userId: string, question: string): Promise<string> {
  const cfg = await resolveAiConfigForUser(userId);
  const [facts, comps, brand] = await Promise.all([ownFacts(workspaceId), listCompetitors(workspaceId), loadBrandContext(workspaceId)]);
  const ctx = [
    brand ? buildBrandContextPrompt(brand) : "Brand profile: not filled in.",
    `Posts published in the last 30 days by channel: ${facts.published30.map((p) => `${p.platform}=${p.count}`).join(", ") || "none"}.`,
    `Post counts by status: ${JSON.stringify(facts.statuses)}.`,
    `Recent published posts:\n${facts.recent.map((p) => `- [${p.platform}] ${p.title}: ${p.excerpt}`).join("\n") || "none"}`,
    `Competitor watchlist (typed in by the user, unmeasured):\n${comps.map((c) => `- ${c.name} ${c.handle}: ${c.note}`).join("\n") || "empty"}`,
  ].join("\n\n");
  return chatText(cfg, SYSTEM, `${ctx}\n\nQuestion: ${question.slice(0, 1000)}`);
}
