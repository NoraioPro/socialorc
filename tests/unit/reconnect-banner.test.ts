import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECONNECT_FALLBACK_REASON,
  accountNeedsReconnect,
  reconnectNotices,
  reconnectReason,
  reconnectSummary,
} from "../../src/lib/social/reconnect";

const healthy = {
  id: "acc_linkedin",
  platform: "LINKEDIN",
  label: "@hassan",
  isActive: true,
  needsReconnect: false,
  lastError: null,
};

describe("M0.10 reconnect banner helpers", () => {
  it("says nothing about a healthy account", () => {
    assert.equal(accountNeedsReconnect(healthy), false);
    assert.deepEqual(reconnectNotices([healthy]), []);
    assert.equal(reconnectSummary(0), "");
  });

  it("surfaces the worker's stored error verbatim", () => {
    // Shape written by the cron worker / publish route on a credential dead-letter.
    const flagged = {
      id: "acc_x",
      platform: "TWITTER",
      label: "@socialorc",
      isActive: true,
      needsReconnect: true,
      lastError: "invalid_grant (AUTH_EXPIRED)",
    };
    assert.equal(accountNeedsReconnect(flagged), true);
    const [notice] = reconnectNotices([flagged]);
    assert.equal(notice.platform, "TWITTER");
    assert.equal(notice.accountId, "acc_x");
    assert.equal(notice.label, "@socialorc");
    assert.equal(notice.reason, "invalid_grant (AUTH_EXPIRED)");
  });

  it("flags a token the refresh flow cannot rescue, even without lastError", () => {
    const expired = {
      id: "acc_ig",
      platform: "INSTAGRAM",
      label: "@brand",
      isActive: true,
      needsReconnect: false,
      lastError: "   ",
      tokenStatus: { requiresReconnect: true },
    };
    assert.equal(accountNeedsReconnect(expired), true);
    assert.equal(reconnectReason(expired), RECONNECT_FALLBACK_REASON);
    assert.match(reconnectNotices([expired])[0].reason, /reconnect/i);
  });

  it("never flags a disconnected account", () => {
    const gone = {
      id: "acc_yt",
      platform: "YOUTUBE",
      label: "@old",
      isActive: false,
      needsReconnect: true,
      lastError: "invalid_grant (AUTH_EXPIRED)",
    };
    assert.equal(accountNeedsReconnect(gone), false);
    assert.deepEqual(reconnectNotices([gone]), []);
  });

  it("the reconnect flow clearing the flag clears the banner", () => {
    // Exactly what src/lib/oauth/callback.ts stores after a finished connect.
    const reconnected = {
      id: "acc_tw",
      platform: "TWITTER",
      label: "@socialorc",
      isActive: true,
      needsReconnect: false,
      lastError: null,
      tokenStatus: { requiresReconnect: false },
    };
    assert.deepEqual(reconnectNotices([reconnected]), []);
  });

  it("orders notices by platform then label and sums honestly", () => {
    const notices = reconnectNotices([
      { id: "b", platform: "TWITTER", label: "@b", isActive: true, needsReconnect: true },
      { id: "a", platform: "TELEGRAM", label: "@a", isActive: true, needsReconnect: true },
      { id: "c", platform: "TWITTER", label: "@a", isActive: true, needsReconnect: true },
      healthy,
    ]);
    assert.deepEqual(
      notices.map((n) => n.accountId),
      ["a", "c", "b"]
    );
    assert.equal(reconnectSummary(1), "1 connected account needs reconnecting before it can publish.");
    assert.match(reconnectSummary(3), /^3 connected accounts/);
  });

  it("falls back to a usable label instead of rendering 'undefined'", () => {
    const noLabel = {
      platform: "FACEBOOK",
      isActive: true,
      needsReconnect: true,
      lastError: "invalid_grant (AUTH_EXPIRED)",
    };
    const [notice] = reconnectNotices([noLabel]);
    assert.equal(notice.label, "FACEBOOK");
    assert.equal(notice.accountId, "FACEBOOK:FACEBOOK");
  });
});
