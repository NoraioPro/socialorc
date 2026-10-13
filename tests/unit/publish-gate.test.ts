import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  PUBLISHABLE_STATUSES,
  publishBlockCode,
  publishBlockMessage,
  publishBlockReason,
  publishBlockStatus,
} from "../../src/lib/posts/publish-gate";

const approved = new Date("2026-10-01T10:00:00.000Z");
const at = (status: string, approvedAt: Date | null, platformPostId: string | null = null) => ({
  status,
  approvedAt,
  platformPostId,
});

describe("approval gate on the immediate publish path", () => {
  it("refuses a DRAFT that was never approved (the regression this fixes)", () => {
    assert.equal(publishBlockReason(at("DRAFT", null)), "not_approved");
    assert.equal(publishBlockStatus("not_approved"), 400);
    assert.equal(publishBlockCode("not_approved"), "APPROVAL_REQUIRED");
    assert.match(publishBlockMessage("not_approved"), /approved/i);
  });

  it("refuses PENDING_APPROVAL, FAILED and PUBLISHED", () => {
    assert.equal(publishBlockReason(at("PENDING_APPROVAL", null)), "not_approved");
    assert.equal(publishBlockReason(at("FAILED", null)), "not_approved");
    assert.equal(publishBlockReason(at("PUBLISHED", null)), "not_approved");
  });

  it("refuses an APPROVED status with no approvedAt — the status alone is not proof", () => {
    // An edit sets the post back to DRAFT and clears approvedAt; a status that
    // survived without its timestamp must not open the gate.
    assert.equal(publishBlockReason(at("APPROVED", null)), "not_approved");
    assert.equal(publishBlockReason(at("SCHEDULED", null)), "not_approved");
  });

  it("allows APPROVED and SCHEDULED once approved", () => {
    assert.equal(publishBlockReason(at("APPROVED", approved)), null);
    assert.equal(publishBlockReason(at("SCHEDULED", approved)), null);
    assert.deepEqual([...PUBLISHABLE_STATUSES], ["APPROVED", "SCHEDULED"]);
  });

  it("keeps the two idempotency refusals, with 409", () => {
    assert.equal(publishBlockReason(at("PUBLISHED", approved, "plat_123")), "already_published");
    assert.equal(publishBlockReason(at("PUBLISHING", approved)), "publishing");
    assert.equal(publishBlockStatus("already_published"), 409);
    assert.equal(publishBlockStatus("publishing"), 409);
  });

  it("is wired into both the route and the button that renders it", () => {
    // A pure predicate nobody calls is not a fix: the server must consult it,
    // and the card must not render "Publish now" on a post it would refuse.
    const route = readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");
    assert.match(route, /publishBlockReason\(/);
    assert.match(route, /publishBlockMessage\(/);
    // and the PUBLISHING claim must be conditional, not a blind write
    assert.match(route, /updateMany\(/);
    assert.match(route, /status: \{ in: \[PostStatus\.APPROVED, PostStatus\.SCHEDULED\] \}/);
    assert.match(route, /claim\.count === 0/);

    const card = readFileSync("src/components/posts/post-card.tsx", "utf8");
    assert.match(card, /publishBlockReason\(/);
  });

  it("closes the post when the adapter throws, instead of stranding it in PUBLISHING", () => {
    // The post is already PUBLISHING by the time the platform is called, and
    // there is no job for the immediate path, so an escaped exception used to
    // leave it uneditable, undeletable and unpublishable forever.
    const route = readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");
    assert.match(route, /catch \(error\)/);
    assert.match(route, /PUBLISH_THREW/);
    assert.match(route, /status: PostStatus\.FAILED/);
  });
});
