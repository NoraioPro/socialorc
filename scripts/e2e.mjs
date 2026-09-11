#!/usr/bin/env node
/**
 * SocialOrc end-to-end harness (M0.2).
 *
 * Runs against a live server (dev or deployed) and needs NO external platform
 * credentials: it injects a Telegram account with an invalid token, so the real
 * adapter is exercised and fails deterministically.
 *
 * What it protects:
 *   SUITE A - the approval gate: DRAFT cannot be scheduled, APPROVED can, and a
 *             SCHEDULED post cannot be re-scheduled.
 *   SUITE B - the worker: failures retry with backoff (never hot-loop),
 *             exhausted jobs dead-letter with the platform error, and a post
 *             that already has platformPostId is deduped, never re-sent.
 *
 * Usage:  node scripts/e2e.mjs            (BASE from NEXTAUTH_URL or localhost)
 *         BASE=https://… node scripts/e2e.mjs
 * Exit code 0 = all assertions passed, 1 = a failure, 2 = server unreachable.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import CryptoJS from "crypto-js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, PostStatus, JobStatus, Platform } from "@prisma/client";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {
    /* .env optional when the vars come from the shell */
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const BASE = (process.env.BASE || env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = env.CRON_SECRET;
const EMAIL = env.DEV_EMAIL;
const PASSWORD = env.DEV_PASSWORD;
const ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY;
const DB_URL = env.DATABASE_URL || "file:./dev.db";

if (!CRON_SECRET || !EMAIL || !PASSWORD || !ENCRYPTION_KEY) {
  console.error("✗ Missing CRON_SECRET / DEV_EMAIL / DEV_PASSWORD / TOKEN_ENCRYPTION_KEY (checked .env and the shell)");
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DB_URL }) });

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── tiny cookie jar (Node fetch does not persist cookies for us) ─────────────
const jar = new Map();
function absorb(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const idx = pair.indexOf("=");
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function call(path, { method = "GET", body, headers = {}, auth = true, cron = false } = {}) {
  const h = { ...headers };
  if (auth && jar.size) h.Cookie = cookieHeader();
  if (cron) h.Authorization = `Bearer ${CRON_SECRET}`;
  if (body) h["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, json, text };
}

const postIdOf = (r) => r.json?.post?.id ?? r.json?.id;
const st = (r) => r.json?.post?.status ?? r.json?.status;

async function main() {
  console.log(`SocialOrc E2E → ${BASE}\n`);

  // ── preflight ─────────────────────────────────────────────────────────────
  let pre;
  try {
    pre = await fetch(`${BASE}/api/auth/csrf`);
  } catch (e) {
    console.error(`✗ server unreachable at ${BASE} (${e.message}). Start it:  NODE_OPTIONS=--dns-result-order=ipv4first npx next dev`);
    process.exit(2);
  }
  if (pre.status !== 200) {
    console.error(`✗ ${BASE}/api/auth/csrf returned ${pre.status}`);
    process.exit(2);
  }
  absorb(pre);
  const csrf = (await pre.json()).csrfToken;

  const login = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken: csrf, email: EMAIL, password: PASSWORD, json: "true" }),
    redirect: "manual",
  });
  absorb(login);
  const sessionCookie = [...jar.keys()].some((k) => k.includes("session-token"));
  check("login establishes a session", sessionCookie, `status ${login.status}`);
  if (!sessionCookie) {
    await cleanup();
    process.exit(1);
  }

  // ── fixture: a Telegram account whose token is invalid on purpose ──────────
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.error(`✗ no user ${EMAIL} in the database — register through the UI first`);
    await cleanup();
    process.exit(1);
  }
  const token = CryptoJS.AES.encrypt("123456:e2e-invalid-token", ENCRYPTION_KEY).toString();
  const account = await prisma.socialAccount.upsert({
    where: { platform_platformUserId: { platform: Platform.TELEGRAM, platformUserId: "e2e_fail_account" } },
    create: {
      userId: user.id,
      platform: Platform.TELEGRAM,
      platformUserId: "e2e_fail_account",
      platformUsername: "e2e_invalid_token",
      displayName: "E2E failing account",
      accessToken: token,
      isActive: true,
    },
    update: { accessToken: token, isActive: true, userId: user.id },
  });

  const stamp = new Date().toISOString().slice(11, 19);
  const created = [];
  const makePost = async (title) => {
    const r = await call("/api/posts", {
      method: "POST",
      body: { title, content: `E2E ${title} ${stamp}`, platform: "TELEGRAM", socialAccountId: account.id },
    });
    const id = postIdOf(r);
    if (id) created.push(id);
    return { r, id };
  };

  // ── SUITE A: the approval gate ────────────────────────────────────────────
  console.log("\nSUITE A — approval gate");
  const { r: draftRes, id: postA } = await makePost("gate");
  check("draft created as DRAFT", draftRes.status === 201 && st(draftRes) === "DRAFT", `status ${draftRes.status} ${st(draftRes)}`);

  const early = await call(`/api/posts/${postA}/schedule`, {
    method: "POST",
    body: { scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
  });
  check(
    "unapproved DRAFT cannot be scheduled (gate holds)",
    early.status === 400,
    `expected 400, got ${early.status}`,
  );

  const approved = await call(`/api/posts/${postA}/approve`, { method: "POST", body: { action: "approve" } });
  check("draft approves to APPROVED", approved.status === 200 && st(approved) === "APPROVED", `status ${approved.status} ${st(approved)}`);

  const armed = await call(`/api/posts/${postA}/schedule`, {
    method: "POST",
    body: { scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
  });
  check("APPROVED post schedules", armed.status === 200 && st(armed) === "SCHEDULED", `status ${armed.status} ${st(armed)}`);

  const again = await call(`/api/posts/${postA}/schedule`, {
    method: "POST",
    body: { scheduledFor: new Date(Date.now() + 7_200_000).toISOString() },
  });
  check("SCHEDULED post cannot be re-scheduled", again.status === 400, `expected 400, got ${again.status}`);

  // ── SUITE B: worker retry / backoff / dead-letter / dedupe ────────────────
  console.log("\nSUITE B — worker durability");
  await call("/api/cron/publish", { auth: false, cron: true }); // drain anything already due

  const { id: postB } = await makePost("queue");
  await call(`/api/posts/${postB}/approve`, { method: "POST", body: { action: "approve" } });
  await call(`/api/posts/${postB}/schedule`, {
    method: "POST",
    body: { scheduledFor: new Date(Date.now() + 1500).toISOString() },
  });
  await new Promise((r) => setTimeout(r, 2000));

  const run1 = await call("/api/cron/publish", { auth: false, cron: true });
  check("failed publish is retried, not dead-lettered", run1.json?.retried === 1, JSON.stringify(run1.json));
  let job = await prisma.scheduledJob.findUnique({ where: { postId: postB } });
  check("retry is scheduled in the future (backoff)", !!job && job.status === JobStatus.PENDING && job.scheduledAt > new Date(), `status ${job?.status} at ${job?.scheduledAt?.toISOString()}`);
  check("attempt counter incremented", job?.attempts === 1, `attempts ${job?.attempts}`);

  const run2 = await call("/api/cron/publish", { auth: false, cron: true });
  check("immediate re-run does nothing (backoff holds)", run2.json?.processed === 0, JSON.stringify(run2.json));

  const forceDue = async () => {
    await prisma.scheduledJob.update({
      where: { postId: postB },
      data: { scheduledAt: new Date(Date.now() - 1000) },
    });
  };

  await forceDue();
  const run3 = await call("/api/cron/publish", { auth: false, cron: true });
  check("second attempt is retried again", run3.json?.retried === 1, JSON.stringify(run3.json));
  job = await prisma.scheduledJob.findUnique({ where: { postId: postB } });
  check("backoff widened on later attempt", job?.attempts === 2 && job.scheduledAt > new Date(), `attempts ${job?.attempts}`);

  await forceDue();
  const run4 = await call("/api/cron/publish", { auth: false, cron: true });
  job = await prisma.scheduledJob.findUnique({ where: { postId: postB } });
  const postBRow = await prisma.post.findUnique({ where: { id: postB } });
  check("exhausted job dead-letters", run4.json?.failed === 1 && job?.status === JobStatus.FAILED, JSON.stringify(run4.json));
  check("post is marked FAILED with the platform error", postBRow?.status === PostStatus.FAILED && !!postBRow?.errorMessage, `${postBRow?.status} / ${postBRow?.errorMessage}`);
  check("dead-letter records the attempt count", /dead-lettered/i.test(job?.errorMessage ?? ""), job?.errorMessage ?? "");

  // dedupe: a post that already carries a platform id must never be re-sent
  const { id: postC } = await makePost("dedupe");
  await prisma.post.update({
    where: { id: postC },
    data: {
      status: PostStatus.PUBLISHED,
      publishedAt: new Date(),
      platformPostId: "e2e_already_sent",
      platformPostUrl: "https://example.invalid/e2e_already_sent",
    },
  });
  const due = new Date(Date.now() - 1000);
  await prisma.scheduledJob.upsert({
    where: { postId: postC },
    create: { postId: postC, status: JobStatus.PENDING, attempts: 0, scheduledAt: due },
    update: { status: JobStatus.PENDING, attempts: 0, scheduledAt: due, completedAt: null, errorMessage: null },
  });
  const run5 = await call("/api/cron/publish", { auth: false, cron: true });
  const postCRow = await prisma.post.findUnique({ where: { id: postC } });
  check("already-published post is deduped, not re-sent", run5.json?.deduped === 1 && run5.json?.published === 0, JSON.stringify(run5.json));
  check("deduped post keeps its original platform id", postCRow?.platformPostId === "e2e_already_sent", postCRow?.platformPostId ?? "null");

  await cleanup(created, account.id);

  console.log(`\n${failures.length ? "✗ FAILED" : "✓ PASSED"} — ${passed} assertions passed, ${failures.length} failed`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exit(failures.length ? 1 : 0);
}

async function cleanup(createdPosts = [], accountId = null) {
  try {
    if (createdPosts.length) {
      const posts = await prisma.post.findMany({
        where: { OR: [{ id: { in: createdPosts } }, { title: { startsWith: "E2E" } }, { content: { startsWith: "E2E" } }] },
        select: { id: true },
      });
      const ids = [...new Set([...createdPosts, ...posts.map((p) => p.id)])];
      await prisma.scheduledJob.deleteMany({ where: { postId: { in: ids } } });
      await prisma.post.deleteMany({ where: { id: { in: ids } } });
    }
    const acct = accountId
      ? { id: accountId }
      : { platformUserId: "e2e_fail_account" };
    const found = await prisma.socialAccount.findFirst({ where: acct, select: { id: true } });
    if (found) await prisma.socialAccount.deleteMany({ where: { id: found.id } });
  } catch (e) {
    console.warn(`  (cleanup warning: ${e.message})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(`\n✗ harness error: ${e.stack || e.message}`);
  await cleanup();
  process.exit(1);
});
