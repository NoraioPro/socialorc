#!/usr/bin/env node
/**
 * SocialOrc durability suite (failure paths of the publishing worker).
 *
 * Complements tests/e2e/run.mjs, which proves the happy path with mock adapters.
 * This one runs the REAL adapters and injects failures, so the retry policy is
 * exercised end to end rather than unit-tested only:
 *
 *   A. transient failure  -> retried with backoff, later dead-lettered
 *      (TELEGRAM_API_BASE points at a closed port, so the platform is unreachable)
 *   B. permanent failure  -> dead-lettered on the FIRST attempt
 *      (real API, account token is invalid -> 401 Unauthorized)
 *   C. already published  -> deduped, never re-sent
 *
 * No real platform is ever published to: case A cannot reach anything, case B
 * uses a deliberately invalid token, and the chat id is fake throughout.
 *
 *   npm run test:durability
 *   E2E_DURABILITY_PORT=3300 npm run test:durability
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import CryptoJS from "crypto-js";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const TMP = path.join(HERE, ".tmp");

const PORT = Number(process.env.E2E_DURABILITY_PORT || 3124);
const BASE_URL = `http://localhost:${PORT}`;
const DB_FILE = "tests/e2e/.tmp/durability.db";
const READY_TIMEOUT_MS = Number(process.env.E2E_READY_TIMEOUT_MS || 240_000);
const isWindows = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A port nothing listens on: guarantees ECONNREFUSED, a real transient failure.
const DEAD_API_BASE = process.env.E2E_DEAD_API_BASE || "http://127.0.0.1:9";
const REAL_API_BASE = "https://api.telegram.org";

const ENCRYPTION_KEY = `durability-key-${Date.now()}`;
const CRON_SECRET = `durability-cron-${Date.now()}`;

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failures.push(name);
    console.log(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const email = `durability-${Date.now()}@example.test`;
const password = crypto.randomBytes(12).toString("hex");

function serverEnv(extra = {}) {
  return {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
    DATABASE_URL: `file:./${DB_FILE.split(path.sep).join("/")}`,
    NODE_OPTIONS: "--dns-result-order=ipv4first",
    NODE_ENV: "development",
    NEXTAUTH_URL: BASE_URL,
    NEXTAUTH_SECRET: `durability-secret-${Date.now()}`,
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    CRON_SECRET,
    MOCK_SOCIAL_ADAPTERS: "false", // real adapters, that is the point
    TELEGRAM_BOT_TOKEN: "123456:durability-placeholder",
    TELEGRAM_CHAT_ID: "1",
    ...extra,
  };
}

function dbClient() {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:./${DB_FILE.split(path.sep).join("/")}` }),
  });
}

function prepareDatabase(env) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const push = spawnSync("npx prisma db push", { cwd: ROOT, env, shell: true, encoding: "utf8" });
  if (push.status !== 0) {
    console.error(push.stdout ?? "", push.stderr ?? "");
    throw new Error(`prisma db push failed (${push.status})`);
  }
}

async function withServer(extraEnv, fn) {
  const env = serverEnv(extraEnv);
  prepareDatabase(env);
  const server = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: ROOT, env, shell: true });
  let log = "";
  server.stdout?.on("data", (d) => (log += d.toString()));
  server.stderr?.on("data", (d) => (log += d.toString()));

  const started = Date.now();
  let ready = false;
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (server.exitCode !== null) {
      const pid = /PID:\s+(\d+)/.exec(log)?.[1];
      throw new Error(
        /Another next dev server is already running/i.test(log)
          ? `Next refuses a second dev server for ${ROOT}${pid ? ` (PID ${pid})` : ""}; stop it first (${isWindows ? `taskkill /PID ${pid} /T /F` : `kill ${pid}`}).`
          : `dev server exited early (${server.exitCode})\n${log.slice(-1500)}`,
      );
    }
    try {
      const res = await fetch(`${BASE_URL}/api/auth/csrf`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  if (!ready) throw new Error(`dev server not ready after ${READY_TIMEOUT_MS} ms`);

  try {
    return await fn();
  } finally {
    if (server.exitCode === null) {
      if (isWindows) spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill("SIGTERM");
    }
  }
}

// ── minimal authenticated client ─────────────────────────────────────────────
function client() {
  const jar = new Map();
  const absorb = (r) => {
    for (const raw of r.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  const cookies = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  async function call(pathname, { method = "GET", body, cron = false } = {}) {
    const headers = { Cookie: cookies() };
    if (cron) headers.Authorization = `Bearer ${CRON_SECRET}`;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers,
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
    return { status: res.status, json };
  }

  return { call, absorb, cookies };
}

async function ensureUser() {
  const c = client();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  c.absorb(csrfRes);
  const csrf = (await csrfRes.json()).csrfToken;
  await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Durability", email, password }),
  });
  const login = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: c.cookies() },
    body: new URLSearchParams({ csrfToken: csrf, email, password, json: "true" }),
    redirect: "manual",
  });
  c.absorb(login);
  return c;
}

async function injectPost(api, token, label) {
  const prisma = dbClient();
  const user = await prisma.user.findUnique({ where: { email } });
  const account = await prisma.socialAccount.upsert({
    where: { platform_platformUserId: { platform: "TELEGRAM", platformUserId: `durability_${label}` } },
    create: {
      userId: user.id,
      platform: "TELEGRAM",
      platformUserId: `durability_${label}`,
      platformUsername: `durability_${label}`,
      displayName: `Durability ${label}`,
      accessToken: CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString(),
      isActive: true,
    },
    update: {
      accessToken: CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString(),
      isActive: true,
      userId: user.id,
    },
  });
  await prisma.$disconnect();

  const created = await api.call("/api/posts", {
    method: "POST",
    body: {
      title: `durability ${label}`,
      content: `durability ${label} ${Date.now()}`,
      platform: "TELEGRAM",
      socialAccountId: account.id,
    },
  });
  const id = created.json?.post?.id ?? created.json?.id;
  await api.call(`/api/posts/${id}/approve`, { method: "POST", body: { action: "approve" } });
  await api.call(`/api/posts/${id}/schedule`, {
    method: "POST",
    body: { scheduledFor: new Date(Date.now() + 1500).toISOString() },
  });
  await sleep(2000);
  return id;
}

async function jobState(postId) {
  const prisma = dbClient();
  const job = await prisma.scheduledJob.findUnique({ where: { postId } });
  const post = await prisma.post.findUnique({ where: { id: postId } });
  await prisma.$disconnect();
  return { job, post };
}

async function run() {
  // ── CASE A: transient (platform unreachable) -> retry, backoff, dead-letter ──
  console.log(`\nCASE A — transient failure (api base ${DEAD_API_BASE})`);
  await withServer({ TELEGRAM_API_BASE: DEAD_API_BASE }, async () => {
    const api = await ensureUser();
    const postId = await injectPost(api, "123456:irrelevant", "transient");

    const run1 = await api.call("/api/cron/publish", { cron: true });
    check("transient failure is retried, not dead-lettered", run1.json?.retried === 1, JSON.stringify(run1.json));
    let { job, post } = await jobState(postId);
    check("retry is scheduled in the future (backoff)", job?.status === "PENDING" && job.scheduledAt > new Date(), `${job?.status} @ ${job?.scheduledAt?.toISOString()}`);
    check("post returns to SCHEDULED for the retry", post?.status === "SCHEDULED", post?.status);
    check("error is classified as retryable", /NETWORK/.test(job?.errorMessage ?? ""), job?.errorMessage ?? "");

    const run2 = await api.call("/api/cron/publish", { cron: true });
    check("immediate re-run does nothing (backoff holds)", run2.json?.processed === 0, JSON.stringify(run2.json));

    const forceDue = async () => {
      const p = dbClient();
      await p.scheduledJob.update({ where: { postId }, data: { scheduledAt: new Date(Date.now() - 1000) } });
      await p.$disconnect();
    };

    await forceDue();
    const run3 = await api.call("/api/cron/publish", { cron: true });
    check("second attempt retries again", run3.json?.retried === 1, JSON.stringify(run3.json));

    await forceDue();
    const run4 = await api.call("/api/cron/publish", { cron: true });
    const end = await jobState(postId);
    check("exhausted retryable failure dead-letters", run4.json?.failed === 1 && end.job?.status === "FAILED", JSON.stringify(run4.json));
    check("dead-letter is NOT counted as permanent", run4.json?.permanent === 0, `permanent=${run4.json?.permanent}`);
    check("dead-letter says how many attempts it took", /Dead-lettered after 3 attempts/.test(end.job?.errorMessage ?? ""), end.job?.errorMessage ?? "");
    check("post ends FAILED", end.post?.status === "FAILED", end.post?.status);
  });

  // ── CASE B: permanent (bad credentials) -> immediate dead-letter ─────────────
  console.log(`\nCASE B — permanent failure (real api base, invalid token)`);
  await withServer({ TELEGRAM_API_BASE: REAL_API_BASE }, async () => {
    const api = await ensureUser();
    const postId = await injectPost(api, "123456:durability-invalid-token", "permanent");

    const run1 = await api.call("/api/cron/publish", { cron: true });
    const { job, post } = await jobState(postId);
    check("permanent failure is NOT retried", run1.json?.retried === 0, JSON.stringify(run1.json));
    check("permanent failure is counted as such", run1.json?.permanent === 1, `permanent=${run1.json?.permanent}`);
    check("job dead-letters on the first attempt", job?.status === "FAILED" && job.attempts === 1, `${job?.status} attempts=${job?.attempts}`);
    check("error is classified as AUTH_INVALID", /AUTH_INVALID/.test(job?.errorMessage ?? ""), job?.errorMessage ?? "");
    check("operator gets an actionable reason", /reconnect the account/i.test(job?.errorMessage ?? ""), job?.errorMessage ?? "");
    check("post ends FAILED", post?.status === "FAILED", post?.status);

    const run2 = await api.call("/api/cron/publish", { cron: true });
    check("nothing is picked up again afterwards", run2.json?.processed === 0, JSON.stringify(run2.json));
  });

  // ── CASE C: idempotency ─────────────────────────────────────────────────────
  console.log(`\nCASE C — already-published post must never be re-sent`);
  await withServer({ TELEGRAM_API_BASE: DEAD_API_BASE }, async () => {
    const api = await ensureUser();
    const postId = await injectPost(api, "123456:irrelevant", "dedupe");

    const prisma = dbClient();
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        platformPostId: "durability_already_sent",
        platformPostUrl: "https://example.invalid/durability",
      },
    });
    await prisma.scheduledJob.update({
      where: { postId },
      data: { status: "PENDING", attempts: 0, scheduledAt: new Date(Date.now() - 1000), completedAt: null, errorMessage: null },
    });
    await prisma.$disconnect();

    const run = await api.call("/api/cron/publish", { cron: true });
    const { post } = await jobState(postId);
    check("already-published post is deduped", run.json?.deduped === 1 && run.json?.published === 0, JSON.stringify(run.json));
    check("original platform id is preserved", post?.platformPostId === "durability_already_sent", post?.platformPostId ?? "null");
  });

  console.log(`\n${failures.length ? "DURABILITY RESULT: FAIL" : "DURABILITY RESULT: PASS"} — ${passed} checks passed, ${failures.length} failed`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exit(failures.length ? 1 : 0);
}

run().catch((e) => {
  console.error(`\nDURABILITY RESULT: FAIL — harness error\n${e.stack || e.message}`);
  process.exit(1);
});
