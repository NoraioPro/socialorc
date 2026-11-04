import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CONNECTORS, credentialShapeProblem, redirectUris, variableProblem } from "../../scripts/connector-setup-data.mjs";
import { platformOAuthCallbackUri } from "../../src/lib/social/approval";
import { getAdapter } from "../../src/lib/adapters";
import type { Platform } from "@prisma/client";

/**
 * scripts/setup-connector.mjs tells an operator what to register and which
 * variables to set. These keep that table honest against the code it describes.
 */
describe("connector setup data matches the adapters", () => {
  it("every redirect URI is the one the app actually sends", () => {
    for (const [key, connector] of Object.entries(CONNECTORS)) {
      const expected = connector.platforms.map((p: string) =>
        platformOAuthCallbackUri(p as Platform, { APP_URL: "https://www.socialork.com" } as unknown as NodeJS.ProcessEnv),
      );
      assert.deepEqual(redirectUris(connector, "https://www.socialork.com/"), expected, key);
    }
  });

  it("setting exactly the variables it lists makes each adapter valid, and none leaves it invalid", () => {
    const saved = { ...process.env };
    const aliases = ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "META_APP_ID", "META_APP_SECRET"];
    try {
      for (const connector of Object.values(CONNECTORS)) {
        for (const name of [...aliases, ...connector.vars.map((v: { name: string }) => v.name)]) delete process.env[name];
        for (const platform of connector.platforms) {
          assert.equal(getAdapter(platform as Platform).validateCredentials().valid, false, `${platform} needs credentials`);
        }
        for (const v of connector.vars as { name: string; pattern?: string }[]) process.env[v.name] = v.pattern ? "123456789012345678" : "1234567890abcdefghij";
        for (const platform of connector.platforms) {
          assert.equal(getAdapter(platform as Platform).validateCredentials().valid, true, `${platform} is valid once ${connector.vars.map((v: { name: string }) => v.name).join(" and ")} are set`);
        }
        for (const v of connector.vars) delete process.env[v.name];
      }
    } finally {
      process.env = saved;
    }
  });

  it("rejects empty, spaced, short and placeholder credentials", () => {
    assert.equal(credentialShapeProblem(""), "empty");
    assert.match(credentialShapeProblem("has space in it 123") ?? "", /whitespace/);
    assert.match(credentialShapeProblem("abc") ?? "", /short/);
    assert.match(credentialShapeProblem("your-client-id-here") ?? "", /placeholder/);
    assert.equal(credentialShapeProblem("1234567890abcdef"), null);
  });

  it("a Meta App ID must be numeric, as the adapter requires", () => {
    const appId = CONNECTORS.meta.vars[0];
    assert.match(variableProblem(appId, "abcdefghijklmnop") ?? "", /15-20 digit/);
    assert.equal(variableProblem(appId, "123456789012345678"), null);
  });

  it("the script never puts a value on a command line or in output", () => {
    const script = fs.readFileSync("scripts/setup-connector.mjs", "utf8");
    assert.match(script, /input: value/, "the value goes to the CLI on stdin");
    assert.equal(/"--value"|--value/.test(script), false);
    assert.equal(/\$\{value\}/.test(script), false, "no template interpolates a secret");
  });
});
