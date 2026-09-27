import { test } from "node:test";
import assert from "node:assert/strict";

import { isAuthorizedCronRequest } from "../../src/lib/cron-auth";

test("the matching bearer secret is authorized", () => {
  assert.equal(isAuthorizedCronRequest("Bearer s3cret", "s3cret"), true);
});

test("a missing or wrong header is refused", () => {
  assert.equal(isAuthorizedCronRequest(null, "s3cret"), false);
  assert.equal(isAuthorizedCronRequest("Bearer wrong", "s3cret"), false);
  assert.equal(isAuthorizedCronRequest("s3cret", "s3cret"), false);
});

test("an unset CRON_SECRET fails closed instead of opening the worker", () => {
  assert.equal(isAuthorizedCronRequest(null, undefined), false);
  assert.equal(isAuthorizedCronRequest("Bearer anything", undefined), false);
  assert.equal(isAuthorizedCronRequest("Bearer ", ""), false);
  assert.equal(isAuthorizedCronRequest("Bearer undefined", undefined), false);
});
