import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { HANDLE_PATTERN, RESERVED_HANDLES, blankDocument, handleProblem, suggestHandle } from "../../src/lib/portfolio/blank";
import { parseDocument } from "../../src/lib/portfolio/validate";
import { USER_INSERTABLE_TYPES } from "../../src/lib/portfolio/registry";

const API_ROOT = "src/app/api/portfolio";

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === "route.ts") out.push(path);
  }
  return out;
}

/**
 * Ownership is a property of the code, not of the scanner.
 *
 * The workspace scanner (`route-permissions.test.ts`) is satisfied by
 * `requirePermission(` alone, which says "this role may act" — not "this row is
 * theirs". These assertions are the second half: every portfolio route must also
 * pass the caller's id into a service function that filters by it.
 */
describe("portfolio routes — ownership", () => {
  const files = routeFiles(API_ROOT);

  it("finds the portfolio routes", () => {
    assert.ok(files.length >= 2, `expected at least 2 route files, found ${files.length}`);
  });

  for (const file of files) {
    it(`${file} requires a permission and passes the caller's id`, () => {
      const source = readFileSync(file, "utf8");
      assert.match(source, /requirePermission\(/, `${file} must call requirePermission()`);
      assert.match(
        source,
        /guard\.(userId|ok)/,
        `${file} must derive work from the resolved guard (guard.userId), never from the request body`,
      );
      assert.doesNotMatch(
        source,
        /body\.(userId|ownerId)/,
        `${file} must not accept a userId from the request body`,
      );
      assert.match(
        source,
        /from "@\/lib\/portfolio\/service"/,
        `${file} must go through the portfolio service so queries are userId-scoped`,
      );
    });
  }

  it("the service puts userId in every portfolio query", () => {
    const source = readFileSync("src/lib/portfolio/service.ts", "utf8");
    const queries = source.match(/prisma\.portfolio[A-Za-z]*\.(findUnique|findFirst|update|updateMany|create)\(/g) ?? [];
    assert.ok(queries.length >= 5, "expected the service to contain portfolio queries");
    const whereUser = source.match(/where: \{ userId[ ,}]/g) ?? [];
    assert.ok(whereUser.length >= 3, `expected userId-scoped where clauses, found ${whereUser.length}`);
    // A create is the one write that must carry the owner instead of filtering by it.
    assert.match(source, /create\(\{[\s\S]{0,40}data: \{[\s\S]{0,40}userId,/);
  });

  it("the public read path only returns PUBLISHED revisions", () => {
    const source = readFileSync("src/lib/portfolio/service.ts", "utf8");
    assert.match(source, /status !== "PUBLISHED"/);
    assert.match(source, /portfolioId: row\.id/);
  });
});

describe("portfolio handle rules", () => {
  it("accepts a normal handle and rejects the malformed ones", () => {
    assert.equal(handleProblem("alex-morgan"), null);
    assert.equal(handleProblem("ab1"), null);
    assert.ok(handleProblem("a1"), "handles are at least 3 characters");
    assert.ok(handleProblem("-alex"));
    assert.ok(handleProblem("alex-"));
    assert.ok(handleProblem("Alex"));
    assert.ok(handleProblem("al ex"));
    assert.ok(handleProblem(""));
    assert.ok(handleProblem(undefined));
    assert.ok(handleProblem("x".repeat(41)));
  });

  it("refuses handles that collide with routes", () => {
    for (const reserved of ["api", "p", "admin", "settings", "privacy"]) {
      assert.ok(RESERVED_HANDLES.has(reserved));
      assert.ok(handleProblem(reserved), `${reserved} must be rejected`);
    }
    assert.match("alex-morgan", HANDLE_PATTERN);
  });

  it("derives a usable handle from a display name", () => {
    assert.equal(suggestHandle("Alex Morgan"), "alex-morgan");
    assert.equal(suggestHandle("  Åsa  Öberg "), "asa-oberg");
    assert.equal(suggestHandle(null), "portfolio");
  });
});

describe("blank canvas", () => {
  it("produces a document the validator accepts", () => {
    const doc = blankDocument({ handle: "alex-morgan" });
    const result = parseDocument(doc);
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
  });

  it("is one PAGE with exactly one sibling SECTION", () => {
    const doc = blankDocument();
    assert.equal(doc.pages.length, 1);
    assert.equal(doc.pages[0].root.type, "PAGE");
    assert.equal(doc.pages[0].root.children?.length, 1);
    assert.equal(doc.pages[0].root.children?.[0].type, "SECTION");
  });

  it("carries the full token table and the 16-type registry", () => {
    const doc = blankDocument();
    assert.ok(Object.keys(doc.tokens.color).length >= 5);
    assert.equal(USER_INSERTABLE_TYPES.length, 16);
    assert.equal(USER_INSERTABLE_TYPES.includes("PAGE" as never), false);
  });
});
