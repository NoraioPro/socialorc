import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LookupAddress } from "node:dns";
import {
  NonPublicAddressError,
  createPublicOnlyFetch,
  isNonPublicIp,
  publicOnlyLookup,
} from "../../src/lib/net/safe-fetch";
import { aiFetch } from "../../src/lib/ai-base-url";
import { readFileSync } from "node:fs";

/**
 * The call-time half of the SSRF defence: the address that is judged is the
 * address that is connected to, and a redirect is never followed.
 */

describe("isNonPublicIp", () => {
  it("refuses NAT64 and 6to4, which embed an IPv4 the check cannot see", () => {
    for (const ip of [
      "64:ff9b::a9fe:a9fe", // NAT64 → 169.254.169.254
      "64:ff9b::127.0.0.1",
      "64:ff9b:1::1",
      "2002:7f00:1::", // 6to4 → 127.0.0.1
      "2002:c0a8:101::1",
      "2001:0:4136:e378::1", // Teredo
      "2001:db8::1",
    ]) {
      assert.equal(isNonPublicIp(ip), true, ip);
    }
  });

  it("refuses the classic private ranges in every spelling", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "::",
      "[::1]",
      "::ffff:127.0.0.1",
      "::ffff:a9fe:a9fe",
      "0:0:0:0:0:ffff:7f00:1",
      "fd00::1",
      "fe80::1%eth0",
      "ff02::1",
    ]) {
      assert.equal(isNonPublicIp(ip), true, ip);
    }
  });

  it("accepts public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:80b::200e"]) {
      assert.equal(isNonPublicIp(ip), false, ip);
    }
  });
});

describe("publicOnlyLookup", () => {
  const fakeResolver = (answers: LookupAddress[]) =>
    ((_host: string, _opts: unknown, cb: (err: null, a: LookupAddress[]) => void) => cb(null, answers)) as never;

  it("refuses when any answer is private, even if the first is public", async () => {
    const lookup = publicOnlyLookup(
      fakeResolver([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]),
    );
    const err = await new Promise((resolve) => lookup("evil.example", {}, (e) => resolve(e)));
    assert.ok(err instanceof NonPublicAddressError);
  });

  it("returns the single address shape when `all` was not asked for", async () => {
    const lookup = publicOnlyLookup(fakeResolver([{ address: "93.184.216.34", family: 4 }]));
    const result = await new Promise<unknown[]>((resolve) =>
      lookup("ok.example", {}, (...args) => resolve(args)),
    );
    assert.deepEqual(result, [null, "93.184.216.34", 4]);
  });

  it("returns the list when `all` was asked for (happy eyeballs)", async () => {
    const answers = [{ address: "2606:4700:4700::1111", family: 6 }];
    const lookup = publicOnlyLookup(fakeResolver(answers));
    const result = await new Promise<unknown[]>((resolve) =>
      lookup("ok.example", { all: true }, (...args) => resolve(args)),
    );
    assert.deepEqual(result, [null, answers]);
  });
});

describe("createPublicOnlyFetch against a real local server", () => {
  let server: Server;
  let port: number;

  before(async () => {
    server = createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: `http://127.0.0.1:${port}/ok` });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  after(() => server.close());

  it("refuses an IP literal that is not public before sending anything", async () => {
    const strict = createPublicOnlyFetch();
    await assert.rejects(strict(`http://127.0.0.1:${port}/ok`), NonPublicAddressError);
    await assert.rejects(strict(`http://[::1]:${port}/ok`), NonPublicAddressError);
  });

  it("refuses a hostname that resolves to a private address, at connect time", async () => {
    const strict = createPublicOnlyFetch();
    await assert.rejects(strict(`http://localhost:${port}/ok`), (error: unknown) => {
      // undici wraps connector errors in `TypeError: fetch failed` with a cause.
      const cause = (error as { cause?: unknown }).cause;
      return cause instanceof NonPublicAddressError || error instanceof NonPublicAddressError;
    });
  });

  it("never follows a redirect, even where private hosts are allowed", async () => {
    const dev = createPublicOnlyFetch({ allowPrivate: true });
    const ok = await dev(`http://127.0.0.1:${port}/ok`);
    assert.equal(ok.status, 200);
    await assert.rejects(dev(`http://127.0.0.1:${port}/redirect`));
  });

  it("refuses non-http schemes", async () => {
    await assert.rejects(createPublicOnlyFetch({ allowPrivate: true })("file:///etc/passwd"), TypeError);
  });

  it("the AI fetch follows the AI_BASE_URL_ALLOW_PRIVATE flag per request", async () => {
    const previous = process.env.AI_BASE_URL_ALLOW_PRIVATE;
    try {
      process.env.AI_BASE_URL_ALLOW_PRIVATE = "false";
      await assert.rejects(aiFetch(`http://127.0.0.1:${port}/ok`), NonPublicAddressError);
      process.env.AI_BASE_URL_ALLOW_PRIVATE = "true";
      assert.equal((await aiFetch(`http://127.0.0.1:${port}/ok`)).status, 200);
    } finally {
      if (previous === undefined) delete process.env.AI_BASE_URL_ALLOW_PRIVATE;
      else process.env.AI_BASE_URL_ALLOW_PRIVATE = previous;
    }
  });
});

describe("AI routes do not echo raw errors to the client", () => {
  it("no AI route returns error.message except the fixed not-configured text", () => {
    for (const file of [
      "src/app/api/ai-studio/route.ts",
      "src/app/api/posts/generate/route.ts",
      "src/app/api/posts/[id]/cascade/route.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.ok(!/error instanceof Error \? error\.message/.test(source), `${file} reflects error.message`);
      assert.ok(!/\{ error: error\.message \}/.test(source), `${file} reflects error.message`);
      // The one allowed form carries a code and sits under an AINotConfiguredError check.
      const reflected = source.match(/error: error\.message, code: error\.code/g) ?? [];
      const guarded = source.match(/error instanceof AINotConfiguredError/g) ?? [];
      assert.ok(reflected.length <= guarded.length, `${file} reflects an unguarded error message`);
    }
  });
});

describe("every AI provider client is built with the guarded fetch", () => {
  it("ai.ts and cascade.ts pass aiFetch to the OpenAI client", () => {
    for (const file of ["src/lib/ai.ts", "src/lib/cascade.ts"]) {
      const source = readFileSync(file, "utf8");
      const constructions = source.match(/new OpenAI\(\{[\s\S]*?\}\)/g) ?? [];
      assert.ok(constructions.length > 0, `${file} builds no client?`);
      for (const block of constructions) {
        assert.ok(block.includes("fetch: aiFetch"), `${file} builds an OpenAI client without aiFetch`);
      }
    }
  });
});
