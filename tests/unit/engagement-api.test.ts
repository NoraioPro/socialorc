import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Platform } from "@prisma/client";
import { createMockAdapter } from "../../src/lib/adapters/mock";
import { linkedInAdapter } from "../../src/lib/adapters/linkedin";
import {
  checkEngagementSupported,
  engagementLimitationMessage,
  parseReactionKind,
} from "../../src/lib/social/engagement-api";
import { can } from "../../src/lib/roles";

describe("engagement-api: capability gates", () => {
  it("returns 501 when the platform config disables the capability", () => {
    const result = checkEngagementSupported(linkedInAdapter, Platform.LINKEDIN, "listComments");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 501);
      assert.equal(result.body.code, "ENGAGEMENT_NOT_SUPPORTED");
      assert.equal(result.body.capabilityDeclared, false);
      assert.match(result.body.message, /Comment|Community|partner/i);
    }
  });

  it("allows mock adapter listComments when capability flags are true", () => {
    const mock = createMockAdapter(Platform.FACEBOOK);
    const result = checkEngagementSupported(mock, Platform.FACEBOOK, "listComments");
    assert.equal(result.ok, true);
  });

  it("parses reaction kinds strictly", () => {
    assert.equal(parseReactionKind("like"), "like");
    assert.equal(parseReactionKind("love"), "love");
    assert.equal(parseReactionKind("invalid"), null);
  });

  it("surfaces platform notes for LinkedIn engagement limits", () => {
    const message = engagementLimitationMessage(Platform.LINKEDIN, "readComments");
    assert.match(message, /partner|Community|Comment/i);
  });
});

describe("engagement-api: permissions", () => {
  it("keeps CLIENT read-only for engagement actions", () => {
    assert.equal(can("CLIENT", "engagement:view"), true);
    assert.equal(can("CLIENT", "engagement:reply"), false);
    assert.equal(can("CLIENT", "engagement:react"), false);
    assert.equal(can("CLIENT", "engagement:delete"), false);
  });

  it("lets editors reply but not delete", () => {
    assert.equal(can("EDITOR", "engagement:reply"), true);
    assert.equal(can("EDITOR", "engagement:react"), true);
    assert.equal(can("EDITOR", "engagement:delete"), false);
  });

  it("lets managers delete comments", () => {
    assert.equal(can("MANAGER", "engagement:delete"), true);
    assert.equal(can("ADMIN", "engagement:delete"), true);
  });
});
