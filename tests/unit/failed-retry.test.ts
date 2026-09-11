import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRetryFailedPublish,
  defaultRetrySchedule,
  getRetryBlockReason,
  retryBlockMessage,
} from "../../src/lib/failed-retry";

describe("failed-retry gate helpers", () => {
  it("allows FAILED + approved + account", () => {
    assert.equal(
      canRetryFailedPublish({
        status: "FAILED",
        approvedAt: new Date(),
        socialAccountId: "acc_1",
      }),
      true
    );
  });

  it("blocks DRAFT even with approvedAt set oddly", () => {
    assert.equal(
      getRetryBlockReason({
        status: "DRAFT",
        approvedAt: new Date(),
        socialAccountId: "acc_1",
      }),
      "not_failed"
    );
  });

  it("blocks FAILED without approval (gate sacred)", () => {
    assert.equal(
      getRetryBlockReason({
        status: "FAILED",
        approvedAt: null,
        socialAccountId: "acc_1",
      }),
      "not_approved"
    );
    assert.match(retryBlockMessage("not_approved"), /approval gate/i);
  });

  it("blocks FAILED without social account", () => {
    assert.equal(
      getRetryBlockReason({
        status: "FAILED",
        approvedAt: new Date(),
        socialAccountId: null,
      }),
      "missing_account"
    );
  });

  it("defaultRetrySchedule is in the future", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const next = defaultRetrySchedule(now, 60_000);
    assert.ok(next.getTime() > now.getTime());
  });
});
