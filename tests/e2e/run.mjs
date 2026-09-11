/**
 * SocialOrc E2E runner (M0.2).
 *
 * Prepares an isolated throwaway SQLite DB, boots `npx next dev` on its own port with
 * MOCK_SOCIAL_ADAPTERS="true" (so no real platform is ever touched), runs the publish
 * chain from publish.e2e.mjs, then tears the server down and exits with the test status.
 *
 *   npm run test:e2e                 # full run: fresh DB + own server on port 3123
 *   E2E_PORT=3200 npm run test:e2e   # different port
 *   E2E_BASE_URL=http://localhost:3000 E2E_CRON_SECRET=... node tests/e2e/run.mjs
 *                                    # skip boot, test an already-running server
 *
 * Never uses real credentials: the test user, secrets and DB are generated per run and
 * the test DB is discarded. The approval gate is asserted, never bypassed.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

import { runPublishE2E } from "./publish.e2e.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const TMP = path.join(HERE, ".tmp");

const PORT = Number(process.env.E2E_PORT || 3123);
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;
const CRON_SECRET = process.env.E2E_CRON_SECRET || `e2e-cron-${Date.now()}`;
const DB_FILE = process.env.E2E_DB_FILE || path.join("tests", "e2e", ".tmp", "e2e.db");
const READY_TIMEOUT_MS = Number(process.env.E2E_READY_TIMEOUT_MS || 240_000);
const isWindows = process.platform === "win32";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nodeBinDir = path.dirname(process.execPath);

function serverEnv() {
  return {
    ...process.env,
    PATH: `${nodeBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
    DATABASE_URL: `file:./${DB_FILE.split(path.sep).join("/")}`,
    NODE_OPTIONS: "--dns-result-order=ipv4first",
    NODE_ENV: "development",
    NEXTAUTH_URL: BASE_URL,
    NEXTAUTH_SECRET: `e2e-only-secret-${Date.now()}`,
    TOKEN_ENCRYPTION_KEY: `e2e-only-encryption-key-${Date.now()}`,
    CRON_SECRET,
    MOCK_SOCIAL_ADAPTERS: "true",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
  };
}

function prepareDatabase(env) {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  console.log(`Preparing throwaway database at ${DB_FILE}`);
  const push = spawnSync("npx prisma db push", {
    cwd: ROOT,
    env,
    shell: true,
    encoding: "utf8",
  });
  if (push.status !== 0) {
    console.error(push.stdout ?? "");
    console.error(push.stderr ?? "");
    throw new Error(`prisma db push failed with exit code ${push.status}`);
  }
  const dbPath = path.isAbsolute(DB_FILE) ? DB_FILE : path.join(ROOT, DB_FILE);
  if (!fs.existsSync(dbPath)) throw new Error(`expected test database at ${dbPath}, it was not created`);
  console.log(`Database schema pushed (${fs.statSync(dbPath).size} bytes)`);
}

async function waitForServer(server, getLog) {
  const started = Date.now();
  while (Date.now() - started < READY_TIMEOUT_MS) {
    if (server.exitCode !== null) {
      const log = getLog();
      if (/Another next dev server is already running/i.test(log)) {
        const pid = /PID:\s+(\d+)/.exec(log)?.[1];
        throw new Error(
          `Next 16 refuses a second \`next dev\` for the same directory. An existing dev server is ` +
            `already serving ${ROOT}${pid ? ` (PID ${pid})` : ""}.\n` +
            `This harness boots its own isolated server + database, so stop it first:\n` +
            `  ${isWindows ? `taskkill /PID ${pid ?? "<pid>"} /T /F` : `kill ${pid ?? "<pid>"}`}\n` +
            `then re-run \`npm run test:e2e\` (and restart your dev server afterwards).`,
        );
      }
      throw new Error(`dev server exited early with code ${server.exitCode}`);
    }
    try {
      const res = await fetch(`${BASE_URL}/api/auth/csrf`);
      if (res.ok) return Date.now() - started;
    } catch {
      /* not up yet */
    }
    await sleep(1_000);
  }
  throw new Error(`dev server not ready after ${READY_TIMEOUT_MS} ms`);
}

function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
}

async function main() {
  const externalServer = Boolean(process.env.E2E_BASE_URL);
  const env = serverEnv();
  let server = null;
  let logTail = [];

  if (!externalServer) prepareDatabase(env);

  if (!externalServer) {
    console.log(`Starting \`npx next dev -p ${PORT}\` from ${ROOT} (MOCK_SOCIAL_ADAPTERS="true")`);
    server = spawn(`npx next dev -p ${PORT}`, {
      cwd: ROOT,
      env,
      shell: true,
      detached: !isWindows,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk) => {
      const text = chunk.toString();
      logTail.push(text);
      if (logTail.length > 200) logTail = logTail.slice(-200);
      if (process.env.E2E_VERBOSE) process.stdout.write(text);
    };
    server.stdout.on("data", capture);
    server.stderr.on("data", capture);
    server.on("error", (err) => console.error("server spawn error:", err.message));

    try {
      const ms = await waitForServer(server, () => logTail.join(""));
      console.log(`Server ready after ${(ms / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`\n${err.message}`);
      console.error("--- server log tail ---\n" + logTail.join("").split("\n").slice(-40).join("\n"));
      stopServer(server);
      process.exit(1);
    }
  } else {
    console.log(`Using already-running server at ${BASE_URL}`);
  }

  let ok = false;
  try {
    const result = await runPublishE2E({ baseUrl: BASE_URL, cronSecret: CRON_SECRET });
    ok = result.ok;
    if (!ok) {
      console.log("\nFailed checks:");
      for (const r of result.results.filter((x) => !x.ok)) {
        console.log(`  - ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
      }
      console.log("--- server log tail ---\n" + logTail.join("").split("\n").slice(-30).join("\n"));
    }
  } catch (err) {
    console.error(`\nE2E run threw: ${err.stack ?? err.message}`);
    console.error("--- server log tail ---\n" + logTail.join("").split("\n").slice(-30).join("\n"));
    ok = false;
  } finally {
    stopServer(server);
  }

  console.log(ok ? "\nE2E RESULT: PASS (mock adapter only, approval gate asserted)" : "\nE2E RESULT: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err.stack ?? err.message);
  process.exit(1);
});
