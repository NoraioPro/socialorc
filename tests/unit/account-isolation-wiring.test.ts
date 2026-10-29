import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Source-level pins for the account-isolation checks that the live suites
 * (tests/e2e/tenancy.e2e.mjs, durability.mjs case E) exercise behaviourally.
 * They fail fast if a guard is deleted, without needing a server.
 */

const publishNow = fs.readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");
const cron = fs.readFileSync("src/app/api/cron/publish/route.ts", "utf8");
const patch = fs.readFileSync("src/app/api/posts/[id]/route.ts", "utf8");

describe("publish-now", () => {
  it("picks its fallback account deterministically and only inside the caller's workspace", () => {
    const at = publishNow.indexOf("let account = post.socialAccount");
    const fallback = publishNow.slice(at, at + 700);
    assert.match(fallback, /workspaceId: guard\.workspaceId, platform: post\.platform, isActive: true/);
    assert.match(fallback, /orderBy: \[\{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
  });

  it("refuses an account from another workspace before decrypting any token", () => {
    const check = publishNow.indexOf("account.workspaceId !== guard.workspaceId");
    assert.ok(check > 0);
    assert.ok(check < publishNow.indexOf("decryptTokens("), "ownership check must precede decryption");
    assert.match(publishNow.slice(check, check + 200), /status: 404/);
  });
});

describe("the worker", () => {
  it("refuses a post whose account belongs to another workspace, before any adapter or token", () => {
    const check = cron.indexOf("post.socialAccount.workspaceId !== post.workspaceId");
    assert.ok(check > 0);
    assert.ok(check < cron.indexOf("resolvePublishAdapter("), "must refuse before choosing an adapter");
    assert.ok(check < cron.indexOf("decryptTokens("), "must refuse before decrypting");
    assert.match(cron, /Account ownership mismatch/);
  });

  it("has no fallback account when a post is unlinked", () => {
    assert.match(cron, /No social account linked/);
    assert.equal(/socialAccount\.findFirst/.test(cron), false);
  });
});

describe("editing a post", () => {
  it("only relinks to an account found inside the caller's workspace", () => {
    assert.match(patch, /findWorkspaceSocialAccount\(guard\.workspaceId,/);
  });
});
