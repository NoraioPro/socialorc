import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { attemptRemoteRevocation, postRevocation } from "../../src/lib/adapters/revoke";
import { TwitterAdapter } from "../../src/lib/adapters/twitter";
import { YouTubeAdapter } from "../../src/lib/adapters/youtube";
import { LinkedInAdapter } from "../../src/lib/adapters/linkedin";

/**
 * Disconnect: the local effect is immediate and independent of the provider, and
 * the response says honestly what the provider did. Revocation exists only where
 * the provider documents an endpoint (X, Google/YouTube, TikTok); LinkedIn has none.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TWITTER_CLIENT_ID;
  delete process.env.TWITTER_CLIENT_SECRET;
});

interface Seen { url: string; method?: string; headers: Record<string, string>; body: string }
function stubFetch(statusFor: (call: Seen, index: number) => number): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Seen = {
      url: String(url),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    };
    seen.push(call);
    return new Response("{}", { status: statusFor(call, seen.length - 1) });
  }) as typeof fetch;
  return seen;
}

describe("postRevocation", () => {
  it("accepts a 2xx", async () => {
    stubFetch(() => 200);
    await postRevocation({ url: "https://p.example/revoke", token: "tok" });
  });

  it("rejects a non-2xx without leaking the token or the body", async () => {
    stubFetch(() => 400);
    await assert.rejects(
      () => postRevocation({ url: "https://p.example/revoke", token: "SECRET-TOKEN" }),
      (error: Error) => /HTTP 400/.test(error.message) && !error.message.includes("SECRET-TOKEN"),
    );
  });

  it("turns a network failure into a generic message", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED https://p.example/revoke?token=SECRET-TOKEN");
    }) as typeof fetch;
    await assert.rejects(
      () => postRevocation({ url: "https://p.example/revoke", token: "SECRET-TOKEN" }),
      (error: Error) => !error.message.includes("SECRET-TOKEN"),
    );
  });
});

describe("attemptRemoteRevocation reports only what happened", () => {
  const tokens = { accessToken: "a", refreshToken: "r" };
  it("revoked: the provider confirmed", async () => {
    assert.equal(await attemptRemoteRevocation(async () => {}, tokens), "revoked");
  });
  it("failed: the provider call threw, and it does not throw itself", async () => {
    assert.equal(await attemptRemoteRevocation(async () => { throw new Error("x"); }, tokens), "failed");
  });
  it("not_supported: no revoker exists", async () => {
    assert.equal(await attemptRemoteRevocation(undefined, tokens), "not_supported");
  });
  it("failed when there was no readable token to revoke", async () => {
    assert.equal(await attemptRemoteRevocation(async () => {}, { accessToken: null, refreshToken: null }), "failed");
  });
});

describe("X revocation", () => {
  it("revokes access and refresh tokens at the documented endpoint with Basic auth", async () => {
    process.env.TWITTER_CLIENT_ID = "cid";
    process.env.TWITTER_CLIENT_SECRET = "csecret";
    const seen = stubFetch(() => 200);
    await new TwitterAdapter().revokeAccess("access-1", "refresh-1");
    assert.equal(seen.length, 2);
    for (const call of seen) {
      assert.equal(call.url, "https://api.x.com/2/oauth2/revoke");
      assert.equal(call.method, "POST");
      assert.equal(call.headers.Authorization, `Basic ${Buffer.from("cid:csecret").toString("base64")}`);
    }
    assert.deepEqual(seen.map((c) => new URLSearchParams(c.body).get("token")), ["access-1", "refresh-1"]);
  });

  it("fails (so the UI does not claim success) when X refuses either token", async () => {
    process.env.TWITTER_CLIENT_ID = "cid";
    process.env.TWITTER_CLIENT_SECRET = "csecret";
    stubFetch((_c, i) => (i === 0 ? 200 : 400));
    await assert.rejects(() => new TwitterAdapter().revokeAccess("a", "r"), /HTTP 400/);
  });

  it("fails when the app credentials are not configured", async () => {
    await assert.rejects(() => new TwitterAdapter().revokeAccess("a"), /not configured/);
  });
});

describe("YouTube (Google) revocation", () => {
  it("revokes the access token at the documented endpoint", async () => {
    const seen = stubFetch(() => 200);
    await new YouTubeAdapter().revokeAccess("access-1", "refresh-1");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "https://oauth2.googleapis.com/revoke");
    assert.equal(new URLSearchParams(seen[0].body).get("token"), "access-1");
  });

  it("falls back to the refresh token when the access token is already dead", async () => {
    const seen = stubFetch((_c, i) => (i === 0 ? 400 : 200));
    await new YouTubeAdapter().revokeAccess("expired", "refresh-1");
    assert.deepEqual(seen.map((c) => new URLSearchParams(c.body).get("token")), ["expired", "refresh-1"]);
  });

  it("fails when Google rejects every token", async () => {
    stubFetch(() => 400);
    await assert.rejects(() => new YouTubeAdapter().revokeAccess("a", "r"), /HTTP 400/);
  });
});

describe("LinkedIn", () => {
  it("has no revoke call: LinkedIn documents none, so disconnect reports not_supported", () => {
    assert.equal(typeof (new LinkedInAdapter() as unknown as { revokeAccess?: unknown }).revokeAccess, "undefined");
  });
});

describe("the disconnect route", () => {
  const route = fs.readFileSync("src/app/api/accounts/route.ts", "utf8");
  const del = route.slice(route.indexOf("export async function DELETE"));

  it("deletes the connection locally, in a transaction, BEFORE calling the provider", () => {
    const tx = del.indexOf("prisma.$transaction(");
    const del_ = del.indexOf("tx.socialAccount.delete(");
    const revoke = del.indexOf("attemptRemoteRevocation(");
    assert.ok(tx > 0 && del_ > tx && revoke > del_, "local delete must come first");
  });

  it("survives a missing adapter or provider failure after the local delete", () => {
    assert.match(del, /remoteRevocation = "failed"/);
  });

  it("never claims revocation unless the provider confirmed it", () => {
    assert.match(del, /revokedAtPlatform: remoteRevocation === "revoked"/);
  });

  it("the settings page tells the user when the platform did not confirm", () => {
    const page = fs.readFileSync("src/app/(dashboard)/settings/accounts/page.tsx", "utf8");
    assert.match(page, /did not confirm the access was revoked/);
  });
});
