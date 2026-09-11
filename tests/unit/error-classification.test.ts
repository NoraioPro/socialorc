import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import {
  classifyAdapterError,
  describeAdapterError,
  isPermanent,
  isRetryable,
  requiresReconnect,
  type AdapterErrorCode,
} from "../../src/lib/adapters/errors";

test("HTTP statuses classify deterministically", () => {
  assert.equal(classifyAdapterError({ status: 401 }), "AUTH_INVALID");
  assert.equal(classifyAdapterError({ status: 403 }), "PERMISSION_DENIED");
  assert.equal(classifyAdapterError({ status: 404 }), "NOT_FOUND");
  assert.equal(classifyAdapterError({ status: 400 }), "CONTENT_INVALID");
  assert.equal(classifyAdapterError({ status: 422 }), "CONTENT_INVALID");
  assert.equal(classifyAdapterError({ status: 429 }), "RATE_LIMITED");
  assert.equal(classifyAdapterError({ status: 500 }), "PLATFORM_UNAVAILABLE");
  assert.equal(classifyAdapterError({ status: 503 }), "PLATFORM_UNAVAILABLE");
});

test("status wins over a misleading message", () => {
  assert.equal(classifyAdapterError({ status: 429, message: "invalid token" }), "RATE_LIMITED");
});

test("real platform messages classify correctly", () => {
  // The exact string the Telegram adapter surfaced when a token was invalid.
  assert.equal(classifyAdapterError({ message: "Telegram sendMessage failed: Unauthorized" }), "AUTH_INVALID");
  assert.equal(classifyAdapterError({ message: "Telegram sendMessage failed: chat not found" }), "NOT_FOUND");
  assert.equal(classifyAdapterError({ message: "fetch failed" }), "NETWORK");
  assert.equal(classifyAdapterError({ message: "Text exceeds maximum length of 280 characters" }), "CONTENT_INVALID");
  assert.equal(classifyAdapterError({ message: "Caption exceeds 1024 characters when media is attached" }), "CONTENT_INVALID");
  assert.equal(classifyAdapterError({ message: "Unsupported media type for Instagram: image/png" }), "MEDIA_INVALID");
  assert.equal(classifyAdapterError({ message: "The access token has expired" }), "AUTH_EXPIRED");
  assert.equal(classifyAdapterError({ message: "ECONNREFUSED" }), "NETWORK");
});

test("unknown failures are not silently treated as transient", () => {
  const code = classifyAdapterError({ message: "something nobody has seen before" });
  assert.equal(code, "UNKNOWN");
  assert.equal(isRetryable(code), false);
  assert.equal(isPermanent(code), false);
});

test("retry policy splits transient from permanent", () => {
  const retryable: AdapterErrorCode[] = ["RATE_LIMITED", "PLATFORM_UNAVAILABLE", "NETWORK"];
  const permanent: AdapterErrorCode[] = [
    "AUTH_INVALID",
    "AUTH_EXPIRED",
    "PERMISSION_DENIED",
    "NOT_FOUND",
    "CONTENT_INVALID",
    "MEDIA_INVALID",
  ];

  for (const code of retryable) {
    assert.equal(isRetryable(code), true, `${code} should be retryable`);
    assert.equal(isPermanent(code), false, `${code} should not be permanent`);
  }
  for (const code of permanent) {
    assert.equal(isPermanent(code), true, `${code} should be permanent`);
    assert.equal(isRetryable(code), false, `${code} should not be retryable`);
  }
});

test("only credential-shaped failures ask for a human reconnect", () => {
  // These are the account's fault -> the UI should offer a reconnect.
  assert.equal(requiresReconnect("AUTH_INVALID"), true);
  assert.equal(requiresReconnect("AUTH_EXPIRED"), true);
  assert.equal(requiresReconnect("PERMISSION_DENIED"), true);

  // These are not: a rejected post, a missing chat, a rate limit or a network
  // blip must never nag the operator to re-authorise a working account.
  for (const code of ["CONTENT_INVALID", "MEDIA_INVALID", "NOT_FOUND", "RATE_LIMITED", "PLATFORM_UNAVAILABLE", "NETWORK", "UNKNOWN"] as const) {
    assert.equal(requiresReconnect(code), false, `${code} must not request a reconnect`);
  }
});

test("the Telegram failure we saw live maps to a reconnect", () => {
  const code = classifyAdapterError({ message: "Telegram sendMessage failed: Unauthorized" });
  assert.equal(requiresReconnect(code), true);
});

test("every code has a human-readable explanation that leaks nothing", () => {
  const codes: AdapterErrorCode[] = [
    "AUTH_INVALID",
    "AUTH_EXPIRED",
    "PERMISSION_DENIED",
    "NOT_FOUND",
    "CONTENT_INVALID",
    "MEDIA_INVALID",
    "RATE_LIMITED",
    "PLATFORM_UNAVAILABLE",
    "NETWORK",
    "UNKNOWN",
  ];
  for (const code of codes) {
    const text = describeAdapterError(code);
    assert.ok(text.length > 10, `${code} has no description`);
    assert.equal(/[A-Za-z0-9_-]{30,}/.test(text), false, `${code} description looks like it may embed a token`);
  }
});
