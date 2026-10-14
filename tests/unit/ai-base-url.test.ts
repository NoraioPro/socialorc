import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aiBaseUrlProblem,
  allowPrivateAiBaseUrl,
  checkAiBaseUrl,
  isNonPublicIp,
} from "../../src/lib/ai-base-url";

/**
 * The AI base URL is customer input the server then calls with the customer's
 * key. These pin the SSRF guard on /api/ai/credentials.
 */

const strict = { allowPrivate: false };
const dev = { allowPrivate: true };

describe("ai base url: strict (production) mode", () => {
  it("accepts public https endpoints", () => {
    assert.equal(aiBaseUrlProblem("https://api.openai.com/v1", strict), null);
    assert.equal(aiBaseUrlProblem("https://openrouter.ai/api/v1", strict), null);
    assert.equal(aiBaseUrlProblem("https://8.8.8.8/v1", strict), null);
  });

  it("refuses non-https schemes", () => {
    for (const url of ["http://api.openai.com/v1", "ftp://example.com", "file:///etc/passwd", "javascript:alert(1)"]) {
      assert.match(aiBaseUrlProblem(url, strict) ?? "", /https/, url);
    }
  });

  it("refuses garbage and embedded credentials", () => {
    assert.match(aiBaseUrlProblem("not a url", strict) ?? "", /valid URL/);
    assert.match(aiBaseUrlProblem("https://user:pass@api.openai.com", strict) ?? "", /username/);
  });

  it("refuses loopback, private, link-local and metadata addresses", () => {
    for (const url of [
      "https://127.0.0.1/v1",
      "https://127.1.2.3",
      "https://10.0.0.5",
      "https://172.16.0.1",
      "https://172.31.255.255",
      "https://192.168.1.1",
      "https://169.254.169.254/latest/meta-data",
      "https://100.64.0.1",
      "https://0.0.0.0",
      "https://[::1]/",
      "https://[fd00::1]/",
      "https://[fe80::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[::ffff:a9fe:a9fe]/",
      "https://2130706433/", // 127.0.0.1 as an integer
      "https://0x7f000001/",
      "https://localhost:11434/v1",
      "https://foo.localhost",
      "https://metadata.google.internal",
      "https://printer.local",
    ]) {
      assert.match(aiBaseUrlProblem(url, strict) ?? "", /public host/, url);
    }
  });

  it("does not mistake public neighbours for private ranges", () => {
    assert.equal(isNonPublicIp("172.15.0.1"), false);
    assert.equal(isNonPublicIp("172.32.0.1"), false);
    assert.equal(isNonPublicIp("100.63.0.1"), false);
    assert.equal(isNonPublicIp("2606:4700::1111"), false);
    assert.equal(isNonPublicIp("example.com"), false);
  });
});

describe("ai base url: development mode", () => {
  it("allows local http endpoints (Ollama, LM Studio)", () => {
    assert.equal(aiBaseUrlProblem("http://localhost:11434/v1", dev), null);
    assert.equal(aiBaseUrlProblem("http://192.168.1.20:1234/v1", dev), null);
  });

  it("still refuses other schemes and credentials", () => {
    assert.match(aiBaseUrlProblem("file:///etc/passwd", dev) ?? "", /https/);
    assert.match(aiBaseUrlProblem("http://u:p@localhost", dev) ?? "", /username/);
  });

  it("is chosen by NODE_ENV and overridable either way", () => {
    assert.equal(allowPrivateAiBaseUrl({ NODE_ENV: "development" } as NodeJS.ProcessEnv), true);
    assert.equal(allowPrivateAiBaseUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv), false);
    assert.equal(allowPrivateAiBaseUrl({ NODE_ENV: "test" } as NodeJS.ProcessEnv), false);
    assert.equal(
      allowPrivateAiBaseUrl({ NODE_ENV: "development", AI_BASE_URL_ALLOW_PRIVATE: "false" } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      allowPrivateAiBaseUrl({ NODE_ENV: "production", AI_BASE_URL_ALLOW_PRIVATE: "true" } as NodeJS.ProcessEnv),
      true,
    );
  });
});

describe("ai base url: DNS resolution", () => {
  it("refuses a public-looking name that resolves to a private address", async () => {
    const problem = await checkAiBaseUrl("https://rebind.example.com/v1", {
      allowPrivate: false,
      resolve: async () => ["93.184.216.34", "10.0.0.1"],
    });
    assert.match(problem ?? "", /resolves to a private/);
  });

  it("accepts a name that resolves only to public addresses", async () => {
    const problem = await checkAiBaseUrl("https://api.example.com/v1", {
      allowPrivate: false,
      resolve: async () => ["93.184.216.34"],
    });
    assert.equal(problem, null);
  });

  it("accepts a name that does not resolve (nothing private is reachable)", async () => {
    const problem = await checkAiBaseUrl("https://nxdomain.example.com/v1", {
      allowPrivate: false,
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    assert.equal(problem, null);
  });

  it("skips resolution in development", async () => {
    let called = false;
    await checkAiBaseUrl("https://api.example.com", {
      allowPrivate: true,
      resolve: async () => {
        called = true;
        return ["10.0.0.1"];
      },
    });
    assert.equal(called, false);
  });
});
