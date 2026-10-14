/**
 * The tenancy backfill (20261014120000_enforce_workspace_tenancy) merges an
 * invitee's auto-created personal workspace into the inviter's. Everything the
 * personal workspace owns has to move with them, or their AI keys, platform
 * credentials, brand profile, knowledge base, conversations and agents stay
 * behind in a workspace nobody can reach — and on a unique (workspaceId, ...)
 * key the team's own row must win.
 *
 * The behavioural test builds a real sqlite database with `prisma migrate
 * deploy` up to the migration before this one, seeds it, runs the migration,
 * runs its backfill half a second time (idempotency), and checks every row.
 * The same scenario was run against Postgres by hand (see the commit).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/** The slice of better-sqlite3 this test uses (the package ships no types). */
interface SqliteDb {
  pragma(source: string): unknown;
  exec(sql: string): void;
  prepare(sql: string): { all(...params: unknown[]): unknown[]; get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
  close(): void;
}
const Database = createRequire(__filename)("better-sqlite3") as new (file: string) => SqliteDb;

const ROOT = path.resolve(__dirname, "..", "..");
const TENANCY = "20261014120000_enforce_workspace_tenancy";
const SQLITE_SQL = readFileSync(path.join(ROOT, "prisma/migrations", TENANCY, "migration.sql"), "utf8");
const PG_SQL = readFileSync(path.join(ROOT, "prisma/migrations-postgres", TENANCY, "migration.sql"), "utf8");

function backfillOf(sql: string): string {
  const start = sql.indexOf("-- Tenancy backfill");
  assert.ok(start > 0, "backfill marker missing");
  return sql.slice(sql.lastIndexOf("\n-- ---", start));
}

describe("tenancy backfill: static", () => {
  it("is the same SQL in both dialects", () => {
    assert.equal(backfillOf(SQLITE_SQL), backfillOf(PG_SQL));
  });

  it("moves every workspace-keyed table, or says where else it is handled", () => {
    const schema = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
    const keyed = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+workspaceId\s+String/m.test(body))
      .map(([, name]) => name);
    const handledElsewhere = new Set([
      "WorkspaceMember", // moved last in step 3, with the role remapped
      "BrandBrain", // stamped per workspace in step 5
      "ScheduledJob", // follows its post in step 6
      "Invitation", // stamped from the inviter in step 7
    ]);
    const section = backfillOf(SQLITE_SQL);
    const step3 = section.slice(section.indexOf("-- 3."), section.indexOf("-- 4."));
    for (const model of keyed) {
      if (handledElsewhere.has(model)) continue;
      assert.ok(step3.includes(`UPDATE "${model}"`), `${model} is not moved with the invitee`);
    }
  });
});

describe("tenancy backfill: on a seeded sqlite database", () => {
  it("merges the personal workspace into the team, keeping the team's row on conflicts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tenancy-backfill-"));
    try {
      const migrations = path.join(dir, "migrations");
      mkdirSync(migrations);
      cpSync(path.join(ROOT, "prisma/migrations/migration_lock.toml"), path.join(migrations, "migration_lock.toml"));
      const all = readdirSync(path.join(ROOT, "prisma/migrations")).filter((d) => /^\d/.test(d)).sort();
      for (const d of all.filter((d) => d < TENANCY)) {
        cpSync(path.join(ROOT, "prisma/migrations", d), path.join(migrations, d), { recursive: true });
      }
      const config = path.join(dir, "prisma.config.ts");
      writeFileSync(
        config,
        `export default { schema: ${JSON.stringify(path.join(ROOT, "prisma/schema.prisma"))}, ` +
          `migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`,
      );
      const file = path.join(dir, "t.db");
      const deploy = spawnSync("npx", ["prisma", "migrate", "deploy", "--config", config], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: `file:${file}` },
        encoding: "utf8",
      });
      assert.equal(deploy.status, 0, `${deploy.stdout}\n${deploy.stderr}`);

      const db = new Database(file);
      db.pragma("foreign_keys = OFF");
      let n = 0;
      const insert = (table: string, values: Record<string, unknown>) => {
        const row: Record<string, unknown> = { ...values };
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as {
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
        }[];
        for (const c of cols) {
          if (c.name in row || !c.notnull || c.dflt_value !== null) continue;
          const t = c.type.toUpperCase();
          row[c.name] = /BOOL|INT|REAL|DECIMAL/.test(t) ? 0 : /DATE/.test(t) ? new Date().toISOString() : /JSON/.test(t) ? "{}" : `dummy${++n}`;
        }
        const names = Object.keys(row);
        db.prepare(
          `INSERT INTO "${table}" (${names.map((x) => `"${x}"`).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        ).run(...names.map((k) => row[k] as string | number));
      };

      const I = "userinviter", V = "userinviteea", V2 = "userinviteeb";
      for (const [id, role] of [[I, "ADMIN"], [V, "EDITOR"], [V2, "MANAGER"]]) insert("User", { id, email: `${id}@x.test`, role });
      const T = "wsteam", P = "wspersonala", P2 = "wspersonalb";
      insert("Workspace", { id: T, name: "Team", slug: "team" });
      insert("Workspace", { id: P, name: "A", slug: `ws-${V}` });
      insert("Workspace", { id: P2, name: "B", slug: `ws-${V2}` });
      insert("WorkspaceMember", { id: "m1", workspaceId: T, userId: I, role: "OWNER", createdAt: "1970-01-01T00:00:00.000Z" });
      insert("WorkspaceMember", { id: "m2", workspaceId: P, userId: V, role: "OWNER" });
      insert("WorkspaceMember", { id: "m3", workspaceId: P2, userId: V2, role: "OWNER" });
      insert("Invitation", { id: "inv1", email: "a@x", tokenHash: "h1", invitedBy: I, acceptedBy: V });
      insert("Invitation", { id: "inv2", email: "b@x", tokenHash: "h2", invitedBy: I, acceptedBy: V2 });

      insert("AiCredential", { id: "ai_team_text", workspaceId: T, kind: "text" });
      insert("BrandProfile", { id: "bp_team", workspaceId: T });
      insert("AiAgent", { id: "ag_team_a", workspaceId: T, slug: "a" });

      insert("BrainSource", { id: "src_a", workspaceId: P });
      insert("BrainChunk", { id: "chunk_a", workspaceId: P, sourceId: "src_a" });
      insert("BrainMemory", { id: "mem_a", workspaceId: P });
      insert("BrainInsight", { id: "ins_a", workspaceId: P });
      insert("Conversation", { id: "conv_a", workspaceId: P, userId: V });
      insert("AiCredential", { id: "ai_a_text", workspaceId: P, kind: "text" });
      insert("AiCredential", { id: "ai_a_image", workspaceId: P, kind: "image" });
      insert("WorkspacePlatformCredential", { id: "wpc_a_x", workspaceId: P, platform: "TWITTER" });
      insert("BrandProfile", { id: "bp_a", workspaceId: P });
      insert("AiAgent", { id: "ag_a_a", workspaceId: P, slug: "a" });
      insert("AiAgent", { id: "ag_a_b", workspaceId: P, slug: "b" });

      insert("AiCredential", { id: "ai_b_image", workspaceId: P2, kind: "image" });
      insert("WorkspacePlatformCredential", { id: "wpc_b_x", workspaceId: P2, platform: "TWITTER" });
      insert("WorkspacePlatformCredential", { id: "wpc_b_y", workspaceId: P2, platform: "LINKEDIN" });
      insert("AiAgent", { id: "ag_b_b", workspaceId: P2, slug: "b" });
      db.pragma("foreign_keys = ON");

      const tables = ["AiCredential", "WorkspacePlatformCredential", "BrandProfile", "AiAgent", "BrainSource",
        "BrainChunk", "BrainMemory", "BrainInsight", "Conversation", "WorkspaceMember"];
      const snapshot = () =>
        JSON.stringify(tables.map((t) => db.prepare(`SELECT "id", "workspaceId" FROM "${t}" ORDER BY "id"`).all()));

      db.exec(SQLITE_SQL);
      const first = snapshot();
      db.exec(backfillOf(SQLITE_SQL));
      assert.equal(snapshot(), first, "the backfill is not idempotent");

      const ws = (table: string, id: string) =>
        (db.prepare(`SELECT "workspaceId" AS w FROM "${table}" WHERE "id" = ?`).get(id) as { w: string } | undefined)?.w;
      const expected: [string, string, string][] = [
        ["BrainSource", "src_a", T], ["BrainChunk", "chunk_a", T], ["BrainMemory", "mem_a", T],
        ["BrainInsight", "ins_a", T], ["Conversation", "conv_a", T],
        // The team's key wins; the invitee's stays behind, untouched.
        ["AiCredential", "ai_team_text", T], ["AiCredential", "ai_a_text", P],
        // Two invitees bringing the same key: the first by id moves.
        ["AiCredential", "ai_a_image", T], ["AiCredential", "ai_b_image", P2],
        ["WorkspacePlatformCredential", "wpc_a_x", T], ["WorkspacePlatformCredential", "wpc_b_x", P2],
        ["WorkspacePlatformCredential", "wpc_b_y", T],
        ["BrandProfile", "bp_team", T], ["BrandProfile", "bp_a", P],
        ["AiAgent", "ag_team_a", T], ["AiAgent", "ag_a_a", P], ["AiAgent", "ag_a_b", T], ["AiAgent", "ag_b_b", P2],
        ["WorkspaceMember", "m2", T], ["WorkspaceMember", "m3", T],
      ];
      for (const [table, id, want] of expected) assert.equal(ws(table, id), want, `${table}.${id}`);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
