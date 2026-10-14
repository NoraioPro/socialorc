import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("minting a client upload token resolves the workspace and checks media:upload", () => {
  const source = readFileSync("src/app/api/media/upload-token/route.ts", "utf8");
  assert.ok(source.includes('requireWorkspace("media:upload")'));
  assert.ok(!source.includes("getAuthSession"), "upload-token still authorises from the bare session");
  // The permission check runs before any budget is spent or body parsed.
  assert.ok(
    source.indexOf('requireWorkspace("media:upload")') < source.indexOf("request.json()"),
    "permission must be checked before the body is read",
  );
});
