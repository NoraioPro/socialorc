/**
 * Autopilot workflows: a saved recipe that makes the next piece of work.
 * Every post a workflow creates lands in PENDING_APPROVAL (or stays a draft) —
 * a workflow never approves, schedules or publishes anything.
 */
import { PostStatus, type Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { aiStudioGenerate, improveContent, AINotConfiguredError } from "@/lib/ai";
import { resolveAiConfigForUser } from "@/lib/ai-config";
import { loadBrandContext } from "@/lib/brand-context";
import { getSetting, setSetting } from "./settings";
import { runRule, type Actor } from "./automations";

export type RecipeKey = "daily-draft" | "repurpose" | "retry-failed" | "weekly-recap";
export interface Workflow { id: string; recipe: RecipeKey; name: string; platform: Platform; enabled: boolean; createdBy: string; lastRunAt?: string; lastResult?: string }

export const RECIPES: { key: RecipeKey; name: string; desc: string; flow: string; needsPlatform: boolean }[] = [
  { key: "daily-draft", name: "Daily draft", desc: "Writes a draft from your brand brain and sends it to review.", flow: "Brain -> Draft -> Review", needsPlatform: true },
  { key: "repurpose", name: "Repurpose a long post", desc: "Rewrites your latest published post for another channel and sends it to review.", flow: "Post -> Rewrite -> Review", needsPlatform: true },
  { key: "retry-failed", name: "Retry failed publishes", desc: "Queues approved posts that failed, up to three times.", flow: "Failed -> Retry -> Log", needsPlatform: false },
  { key: "weekly-recap", name: "Weekly recap", desc: "Counts the week's posts and approvals into a recap draft for the team.", flow: "Activity -> Summary -> Draft", needsPlatform: true },
];

const KEY = "autopilot";
export async function listWorkflows(workspaceId: string): Promise<Workflow[]> {
  return (await getSetting<Workflow[]>(workspaceId, KEY)) ?? [];
}
const save = (workspaceId: string, w: Workflow[]) => setSetting(workspaceId, KEY, w);

export async function createWorkflow(ctx: Actor, recipe: RecipeKey, platform: Platform): Promise<Workflow> {
  const def = RECIPES.find((r) => r.key === recipe)!;
  const list = await listWorkflows(ctx.workspaceId);
  const w: Workflow = { id: Math.random().toString(36).slice(2, 10), recipe, name: def.name, platform, enabled: false, createdBy: ctx.userId };
  await save(ctx.workspaceId, [...list, w]);
  return w;
}
export async function updateWorkflow(workspaceId: string, id: string, patch: Partial<Workflow>) {
  const list = await listWorkflows(workspaceId);
  await save(workspaceId, list.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}
export async function deleteWorkflow(workspaceId: string, id: string) {
  await save(workspaceId, (await listWorkflows(workspaceId)).filter((w) => w.id !== id));
}

async function account(workspaceId: string, platform: Platform) {
  return prisma.socialAccount.findFirst({ where: { workspaceId, platform, isActive: true }, select: { id: true } });
}

/** Runs one workflow; always logs. Posts it makes need a person's review. */
export async function runWorkflow(ctx: Actor, w: Workflow): Promise<{ ok: boolean; message: string; postId?: string }> {
  let out: { ok: boolean; message: string; postId?: string };
  try {
    out = await exec(ctx, w);
  } catch (e) {
    out = { ok: false, message: e instanceof AINotConfiguredError ? "AI is not set up. Add a key under Settings, then run again." : "The workflow could not finish. Nothing was changed." };
  }
  await updateWorkflow(ctx.workspaceId, w.id, { lastRunAt: new Date().toISOString(), lastResult: out.message });
  await recordAudit({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.label ?? "Autopilot", action: "AUTOMATION_RUN",
    subjectType: "WORKSPACE", detail: { rule: `autopilot:${w.recipe}`, count: out.ok ? 1 : 0, message: `${w.name}: ${out.message}`, trigger: "autopilot" },
  });
  return out;
}

async function exec(ctx: Actor, w: Workflow) {
  const wid = ctx.workspaceId;
  if (w.recipe === "retry-failed") {
    const r = await runRule(ctx, "retryFailed");
    return { ok: r.ok, message: r.message };
  }
  const aiConfig = await resolveAiConfigForUser(ctx.userId);
  const acc = await account(wid, w.platform);
  const make = async (title: string, content: string, status: PostStatus) =>
    prisma.post.create({ data: { userId: ctx.userId, workspaceId: wid, title, content, platform: w.platform, socialAccountId: acc?.id ?? null, status } });

  if (w.recipe === "daily-draft") {
    const brand = (await loadBrandContext(wid)) ?? undefined;
    const res = await aiStudioGenerate({ aiConfig, idea: "One useful, specific post for today that fits our brand and audience.", platforms: [w.platform], brandContext: brand });
    const v = res.variants[0];
    if (!v) return { ok: false, message: "The AI returned no draft." };
    const p = await make(`Daily draft${res.usedMock ? " (sample text)" : ""}`, v.content, PostStatus.PENDING_APPROVAL);
    return { ok: true, postId: p.id, message: res.usedMock ? "Drafted with sample text (no AI key yet) and sent to review." : "Drafted and sent to review." };
  }
  if (w.recipe === "repurpose") {
    const src = await prisma.post.findFirst({ where: { workspaceId: wid, status: PostStatus.PUBLISHED }, orderBy: { publishedAt: "desc" } });
    if (!src) return { ok: false, message: "No published post yet to repurpose." };
    const r = await improveContent(src.content, w.platform, `Rewrite this for ${w.platform.toLowerCase()} in its native style, shorter, keeping every fact unchanged.`, false, aiConfig);
    const p = await make(`${src.title ?? "Post"} (for ${w.platform.toLowerCase()})${r.isMock ? " (sample text)" : ""}`, r.content, PostStatus.PENDING_APPROVAL);
    return { ok: true, postId: p.id, message: `Rewrote “${src.title ?? "Post"}” and sent it to review.` };
  }
  // weekly-recap: real counts, no model needed.
  const since = new Date(Date.now() - 7 * 86400_000);
  const [pub, appr, fail, pend] = await Promise.all([
    prisma.post.count({ where: { workspaceId: wid, status: PostStatus.PUBLISHED, publishedAt: { gte: since } } }),
    prisma.auditEvent.count({ where: { workspaceId: wid, action: { in: ["APPROVED", "SELF_APPROVED_SOLO"] }, createdAt: { gte: since } } }),
    prisma.post.count({ where: { workspaceId: wid, status: PostStatus.FAILED } }),
    prisma.post.count({ where: { workspaceId: wid, status: PostStatus.PENDING_APPROVAL } }),
  ]);
  const text = `Week in review: ${pub} post${pub === 1 ? "" : "s"} published, ${appr} approved, ${pend} waiting for review, ${fail} failed.`;
  const p = await make("Weekly recap", text, PostStatus.DRAFT);
  return { ok: true, postId: p.id, message: `${text} Saved as a draft.` };
}

/** For the cron worker: run every enabled workflow whose last run is over 23h old. */
export async function runDueWorkflows(): Promise<number> {
  const rows = await prisma.workspaceSetting.findMany({ where: { key: KEY } });
  let n = 0;
  for (const row of rows) {
    const list = (row.value as unknown as Workflow[]) ?? [];
    for (const w of list.filter((x) => x.enabled)) {
      if (w.lastRunAt && Date.now() - Date.parse(w.lastRunAt) < 23 * 3600_000) continue;
      await runWorkflow({ workspaceId: row.workspaceId, userId: w.createdBy, label: "Autopilot" }, w);
      n++;
    }
  }
  return n;
}
