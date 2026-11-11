/**
 * Workspace automations.
 *
 * Small rules that take the next step for the team. Three guarantees:
 *  - A rule never skips a human decision: nothing is approved, and nothing is
 *    published, by an automation. Auto-scheduling only acts on posts a person
 *    already approved; recycling creates a DRAFT.
 *  - Every run is written to the audit trail (AUTOMATION_RUN) so the page shows
 *    real runs and real "clicks saved" numbers, not invented ones.
 *  - Each rule is off until someone switches it on, per workspace.
 */
import { PostStatus } from "@prisma/client";
import { blockingMediaProblems } from "@/lib/social/platform-rules";
import prisma from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { mintReviewToken, reviewPath } from "@/lib/review-link";
import { requeueJobData } from "@/lib/jobs/pending-publish";
import { retryGuardWhere, scheduleGuardWhere } from "@/lib/posts/transitions";
import { getSetting, setSetting } from "./settings";

export type RuleKey =
  | "autoSchedule"
  | "reviewLink"
  | "reviewLinksAll"
  | "needsImage"
  | "suggestedReplies"
  | "recycleTop"
  | "retryFailed"
  | "remindReviewers"
  | "flagAlt";

export interface RuleDef {
  key: RuleKey;
  name: string;
  when: string;
  then: string;
  saves: string;
  /** Clicks a person would have spent on one run, for the "clicks saved" stat. */
  clicks: number;
  /** "auto" rules fire from the app on their own once on; "manual" ones run on demand. */
  trigger: "approve" | "submit" | "setting" | "manual";
  /** Label for the Run now button; absent when there is nothing to run. */
  runLabel?: string;
}

export const RULES: RuleDef[] = [
  { key: "autoSchedule", name: "Schedule approved posts", when: "A post is approved", then: "Put it in the next free slot (09:00, 13:00 or 18:00 UTC)", saves: "Scheduling each post by hand", clicks: 3, trigger: "approve" },
  { key: "reviewLink", name: "Prepare the client's review link", when: "A post is submitted for review", then: "Create its private review link and log it", saves: "Copying a link for each post", clicks: 2, trigger: "submit" },
  { key: "reviewLinksAll", name: "Review links for the whole queue", when: "You press Run now", then: "Create a review link for every post waiting for approval", saves: "Opening each post to copy its link", clicks: 2, trigger: "manual", runLabel: "Run now" },
  { key: "needsImage", name: "Flag posts that need an image", when: "A post for Instagram, TikTok or YouTube has no media", then: "Log it so nobody finds out at publish time", saves: "Checking every post for media", clicks: 2, trigger: "submit", runLabel: "Check now" },
  { key: "suggestedReplies", name: "Suggested replies in Inbox", when: "A comment or mention comes in", then: "Offer a short reply to edit and send", saves: "Writing every reply from scratch", clicks: 4, trigger: "setting" },
  { key: "recycleTop", name: "Reuse the best published post", when: "You press Run now", then: "Copy your most recent published post into a new draft", saves: "Finding and copying an old post", clicks: 4, trigger: "manual", runLabel: "Run now" },
  { key: "retryFailed", name: "Retry failed publishes", when: "A post failed to publish (approved posts only)", then: "Queue it again for the next 15 minutes, up to 3 times", saves: "Checking Publishing by hand", clicks: 3, trigger: "manual", runLabel: "Run now" },
  { key: "remindReviewers", name: "Remind reviewers", when: "A post has waited more than a day", then: "Log a reminder and list what is waiting", saves: "Chasing people in chat", clicks: 2, trigger: "manual", runLabel: "Run now" },
  { key: "flagAlt", name: "Flag missing alt text", when: "A file has no alt text", then: "List the files that need it", saves: "Finding gaps before publishing", clicks: 2, trigger: "manual", runLabel: "Check now" },
];

export const RULE_KEYS = RULES.map((r) => r.key);
const SETTING_KEY = "automations";
type State = Partial<Record<RuleKey, boolean>>;

export async function getRuleState(workspaceId: string): Promise<Record<RuleKey, boolean>> {
  const raw = (await getSetting<State>(workspaceId, SETTING_KEY)) ?? {};
  return Object.fromEntries(RULE_KEYS.map((k) => [k, raw[k] === true])) as Record<RuleKey, boolean>;
}

export async function isRuleOn(workspaceId: string, key: RuleKey): Promise<boolean> {
  return (await getRuleState(workspaceId))[key];
}

export async function setRule(ctx: Actor, key: RuleKey, on: boolean): Promise<void> {
  const state = await getRuleState(ctx.workspaceId);
  state[key] = on;
  await setSetting(ctx.workspaceId, SETTING_KEY, state);
  await recordAudit({
    workspaceId: ctx.workspaceId, actorId: ctx.userId, actorLabel: ctx.label, action: "AUTOMATION_TOGGLED",
    subjectType: "WORKSPACE", detail: { rule: key, on },
  });
}

export interface Actor {
  workspaceId: string;
  userId: string;
  label: string | null;
}

export interface RunResult {
  ok: boolean;
  count: number;
  message: string;
  links?: { title: string; path: string }[];
}

async function log(ctx: Actor, key: RuleKey, r: RunResult, trigger: string) {
  await recordAudit({
    workspaceId: ctx.workspaceId, actorId: ctx.userId || null, actorLabel: ctx.label ?? "Automation",
    action: "AUTOMATION_RUN", subjectType: "WORKSPACE",
    detail: { rule: key, count: r.count, message: r.message, trigger, links: r.links },
  });
}

const SLOT_HOURS = [9, 13, 18];

/** Next UTC slot (09/13/18) in the future that no scheduled post already holds. */
export async function nextFreeSlot(workspaceId: string, now = new Date()): Promise<Date> {
  const taken = await prisma.post.findMany({
    where: { workspaceId, status: PostStatus.SCHEDULED, scheduledFor: { gt: now } },
    select: { scheduledFor: true },
  });
  const used = new Set(taken.map((p) => Math.floor(p.scheduledFor!.getTime() / 3600_000)));
  for (let d = 0; d < 60; d++) {
    for (const h of SLOT_HOURS) {
      const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + d, h));
      if (slot.getTime() <= now.getTime() + 30 * 60_000) continue;
      if (!used.has(Math.floor(slot.getTime() / 3600_000))) return slot;
    }
  }
  return new Date(now.getTime() + 24 * 3600_000);
}

/** Called right after a person approves a post. Never throws. */
export async function onApproved(ctx: Actor, postId: string): Promise<RunResult | null> {
  try {
    if (!(await isRuleOn(ctx.workspaceId, "autoSchedule"))) return null;
    const post = await prisma.post.findFirst({ where: { id: postId, workspaceId: ctx.workspaceId }, select: { title: true, socialAccountId: true, platform: true, mediaAssets: { select: { mediaAsset: { select: { mimeType: true, filename: true } } } } } });
    if (post) {
      const issues = blockingMediaProblems(post.platform, post.mediaAssets.map((m) => ({ mimeType: m.mediaAsset.mimeType, filename: m.mediaAsset.filename })));
      if (issues.length) {
        const r = { ok: false, count: 0, message: `“${post.title ?? "Post"}” was left approved but not scheduled: ${issues.join(" ")}` };
        await log(ctx, "autoSchedule", r, "approve");
        return r;
      }
    }
    if (!post?.socialAccountId) {
      const r = { ok: false, count: 0, message: `“${post?.title ?? "Post"}” has no connected account, so it was left approved but not scheduled.` };
      await log(ctx, "autoSchedule", r, "approve");
      return r;
    }
    const at = await nextFreeSlot(ctx.workspaceId);
    const done = await prisma.$transaction(async (tx) => {
      const claim = await tx.post.updateMany({ where: scheduleGuardWhere(postId, ctx.workspaceId), data: { status: PostStatus.SCHEDULED, scheduledFor: at } });
      if (claim.count === 0) return false;
      const jobData = requeueJobData(at);
      await tx.scheduledJob.upsert({ where: { postId }, create: { workspaceId: ctx.workspaceId, postId, ...jobData }, update: jobData });
      return true;
    });
    if (!done) return null;
    const r = { ok: true, count: 1, message: `Scheduled “${post.title ?? "Post"}” for ${at.toISOString().slice(0, 16).replace("T", " ")} UTC.` };
    await log(ctx, "autoSchedule", r, "approve");
    return r;
  } catch (e) {
    console.error("automation.onApproved", e);
    return null;
  }
}

const MEDIA_PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE"];

/** Called right after a post is submitted for review. Never throws. */
export async function onSubmitted(ctx: Actor, postId: string): Promise<void> {
  try {
    const state = await getRuleState(ctx.workspaceId);
    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId: ctx.workspaceId },
      select: { title: true, platform: true, _count: { select: { mediaAssets: true } } },
    });
    if (!post) return;
    if (state.reviewLink) {
      const path = reviewPath(mintReviewToken(postId));
      await log(ctx, "reviewLink", { ok: true, count: 1, message: `Review link ready for “${post.title ?? "Post"}”.`, links: [{ title: post.title ?? "Post", path }] }, "submit");
    }
    if (state.needsImage && MEDIA_PLATFORMS.includes(post.platform) && post._count.mediaAssets === 0) {
      await log(ctx, "needsImage", { ok: false, count: 1, message: `“${post.title ?? "Post"}” is for ${post.platform.toLowerCase()} but has no image or video yet.` }, "submit");
    }
  } catch (e) {
    console.error("automation.onSubmitted", e);
  }
}

export async function runRule(ctx: Actor, key: RuleKey): Promise<RunResult> {
  const r = await exec(ctx, key);
  await log(ctx, key, r, "manual");
  return r;
}

async function exec(ctx: Actor, key: RuleKey): Promise<RunResult> {
  const wid = ctx.workspaceId;
  switch (key) {
    case "reviewLinksAll": {
      const posts = await prisma.post.findMany({ where: { workspaceId: wid, status: PostStatus.PENDING_APPROVAL }, select: { id: true, title: true }, take: 50 });
      if (!posts.length) return { ok: true, count: 0, message: "Nothing is waiting for approval." };
      const links = posts.map((p) => ({ title: p.title ?? "Untitled", path: reviewPath(mintReviewToken(p.id)) }));
      return { ok: true, count: posts.length, message: `Created ${posts.length} review link${posts.length === 1 ? "" : "s"}.`, links };
    }
    case "needsImage": {
      const posts = await prisma.post.findMany({
        where: { workspaceId: wid, platform: { in: MEDIA_PLATFORMS as never[] }, status: { in: [PostStatus.DRAFT, PostStatus.PENDING_APPROVAL, PostStatus.APPROVED, PostStatus.SCHEDULED] }, mediaAssets: { none: {} } },
        select: { title: true, platform: true }, take: 50,
      });
      return { ok: posts.length === 0, count: posts.length, message: posts.length ? `${posts.length} post${posts.length === 1 ? " needs" : "s need"} media: ${posts.slice(0, 3).map((p) => p.title ?? "Untitled").join(", ")}${posts.length > 3 ? "…" : ""}` : "Every post for an image channel has media." };
    }
    case "recycleTop": {
      const top = await prisma.post.findFirst({ where: { workspaceId: wid, status: PostStatus.PUBLISHED }, orderBy: { publishedAt: "desc" }, include: { mediaAssets: true } });
      if (!top) return { ok: false, count: 0, message: "No published post yet to reuse." };
      const copy = await prisma.post.create({
        data: {
          userId: ctx.userId, workspaceId: wid, title: `${top.title ?? "Post"} (reused)`, content: top.content, platform: top.platform,
          socialAccountId: top.socialAccountId, brainId: top.brainId, status: PostStatus.DRAFT,
          mediaAssets: { create: top.mediaAssets.map((m, i) => ({ mediaAssetId: m.mediaAssetId, order: i })) },
        },
      });
      return { ok: true, count: 1, message: `Copied “${top.title ?? "Post"}” into a new draft. It still needs review.`, links: [{ title: copy.title ?? "Draft", path: `/socialork/create?post=${copy.id}` }] };
    }
    case "retryFailed": {
      const failed = await prisma.post.findMany({ where: { workspaceId: wid, status: PostStatus.FAILED, approvedAt: { not: null }, retryCount: { lt: 3 }, socialAccountId: { not: null } }, select: { id: true, retryCount: true }, take: 25 });
      let n = 0;
      for (const f of failed) {
        const at = new Date(Date.now() + 15 * 60_000);
        const ok = await prisma.$transaction(async (tx) => {
          const claim = await tx.post.updateMany({ where: retryGuardWhere(f.id, wid), data: { status: PostStatus.SCHEDULED, scheduledFor: at, errorMessage: null, retryCount: f.retryCount + 1, lastRetryAt: new Date() } });
          if (!claim.count) return false;
          const jd = requeueJobData(at);
          await tx.scheduledJob.upsert({ where: { postId: f.id }, create: { workspaceId: wid, postId: f.id, ...jd }, update: jd });
          return true;
        });
        if (ok) n++;
      }
      return { ok: true, count: n, message: n ? `Queued ${n} failed post${n === 1 ? "" : "s"} again.` : "Nothing to retry (posts that failed 3 times need a look by hand)." };
    }
    case "remindReviewers": {
      const cutoff = new Date(Date.now() - 24 * 3600_000);
      const waiting = await prisma.post.findMany({ where: { workspaceId: wid, status: PostStatus.PENDING_APPROVAL, updatedAt: { lt: cutoff } }, select: { id: true, title: true }, take: 50 });
      return { ok: true, count: waiting.length, message: waiting.length ? `${waiting.length} post${waiting.length === 1 ? " has" : "s have"} waited over a day: ${waiting.slice(0, 3).map((p) => p.title ?? "Untitled").join(", ")}${waiting.length > 3 ? "…" : ""}. Reviewers see them first in Approvals.` : "Nothing has waited more than a day." };
    }
    case "flagAlt": {
      const files = await prisma.mediaAsset.findMany({ where: { workspaceId: wid, mimeType: { startsWith: "image/" }, OR: [{ altText: null }, { altText: "" }] }, select: { filename: true }, take: 50 });
      return { ok: files.length === 0, count: files.length, message: files.length ? `${files.length} image${files.length === 1 ? " has" : "s have"} no alt text: ${files.slice(0, 3).map((f) => f.filename).join(", ")}${files.length > 3 ? "…" : ""}. Add it in Media.` : "Every image has alt text." };
    }
    default:
      return { ok: false, count: 0, message: "This rule runs on its own; there is nothing to run by hand." };
  }
}

/** Clicks-saved and run counts, from the audit trail. */
export async function getAutomationStats(workspaceId: string) {
  const rows = await prisma.auditEvent.findMany({ where: { workspaceId, action: "AUTOMATION_RUN" }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, createdAt: true, detail: true } });
  const weights = Object.fromEntries(RULES.map((r) => [r.key, r.clicks]));
  let clicks = 0;
  const perRule: Record<string, number> = {};
  const runs = rows.map((r) => {
    const d = (r.detail ?? {}) as { rule?: string; count?: number; message?: string; links?: { title: string; path: string }[]; trigger?: string };
    const ok = d.rule ? (weights[d.rule] ?? 0) * Math.max(d.count ?? 0, 0) : 0;
    clicks += ok;
    if (d.rule) perRule[d.rule] = (perRule[d.rule] ?? 0) + 1;
    return { id: r.id, at: r.createdAt, rule: d.rule ?? "", message: d.message ?? "", links: d.links ?? [], trigger: d.trigger ?? "" };
  });
  return { clicks, total: rows.length, perRule, runs: runs.slice(0, 15) };
}
