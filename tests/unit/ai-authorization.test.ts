import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { can } from "../../src/lib/roles";
import { isMockAdapterAllowed } from "../../src/lib/adapters";
import { isMockAIAllowed } from "../../src/lib/ai";

/**
 * Regression tests for AI-budget authorization.
 *
 * Every route that can trigger a PAID provider call used to accept any valid
 * session, so an arbitrary account created through the then-open public signup
 * form could spend the production AI budget. These tests pin two things:
 *
 *   1. the permission the AI routes now require is not granted to the read-only
 *      role, and
 *   2. each AI-spending route really does enforce it, so deleting a guard in a
 *      future refactor fails the suite instead of silently reopening the hole.
 */

const AI_PERMISSION = "posts:create";

/** Routes that can cause a provider call and therefore must be gated. */
const AI_ROUTES = [
  "src/app/api/ai-studio/route.ts",
  "src/app/api/posts/generate/route.ts",
  "src/app/api/posts/[id]/cascade/route.ts",
];

function readRoute(relative: string): string {
  return readFileSync(path.resolve(process.cwd(), relative), "utf8");
}

test("the read-only role cannot spend the AI budget", () => {
  // CLIENT is the least privilege role and may only look, never generate.
  assert.equal(can("CLIENT", AI_PERMISSION), false);
});

test("roles that write content may still use AI", () => {
  assert.equal(can("ADMIN", AI_PERMISSION), true);
  assert.equal(can("MANAGER", AI_PERMISSION), true);
  assert.equal(can("EDITOR", AI_PERMISSION), true);
});

test("every AI-spending route enforces the permission, not just a session", () => {
  for (const route of AI_ROUTES) {
    const source = readRoute(route);
    assert.match(
      source,
      /requirePermission\(\s*"posts:create"\s*\)/,
      `${route} must call requirePermission("posts:create") before any paid call`,
    );
    assert.ok(
      !/const authz = await requirePermission/.test(source) ||
        source.includes("authz.ok"),
      `${route} must check the result of requirePermission`,
    );
  }
});

test("the AI routes reject an unauthorized role with 403", () => {
  for (const route of AI_ROUTES) {
    const source = readRoute(route);
    assert.match(
      source,
      /status:\s*authz\.status/,
      `${route} must propagate the 401/403 status from requirePermission`,
    );
  }
});

test("the health route is not gated, because it only reads a flag", () => {
  // /api/health reports availability; it never calls the provider, so requiring
  // a session there would break monitoring without protecting the budget.
  const source = readRoute("src/app/api/health/route.ts");
  assert.equal(/aiStudioGenerate|improveContent\(/.test(source), false);
});

test("production can never fall back to a mock adapter, even if the flag is on", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousFlag = env.MOCK_SOCIAL_ADAPTERS;
  env.NODE_ENV = "production";
  env.MOCK_SOCIAL_ADAPTERS = "true";
  try {
    assert.equal(isMockAdapterAllowed(), false);
    assert.equal(isMockAIAllowed(), false);
  } finally {
    env.NODE_ENV = previousNodeEnv;
    env.MOCK_SOCIAL_ADAPTERS = previousFlag;
  }
});

test("mocks remain available in development so local work still runs", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousFlag = env.MOCK_SOCIAL_ADAPTERS;
  env.NODE_ENV = "development";
  env.MOCK_SOCIAL_ADAPTERS = "true";
  try {
    assert.equal(isMockAdapterAllowed(), true);
    assert.equal(isMockAIAllowed(), true);
  } finally {
    env.NODE_ENV = previousNodeEnv;
    env.MOCK_SOCIAL_ADAPTERS = previousFlag;
  }
});
