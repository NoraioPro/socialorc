import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITATION_TTL_MS,
  ROLE_VALUES,
  createInvitationToken,
  hashInvitationToken,
  invitationDecision,
  invitationTokenMatches,
  isRoleValue,
  normalizeEmail,
  roleChangeMessage,
  roleChangeProblem,
} from "../../src/lib/invitations";

/**
 * Invitations decide who may join and with which role, and role changes decide
 * who may administer the workspace. Both were impossible before this: roles were
 * only ever set once, at signup, and MANAGER/CLIENT could not be produced at all.
 */

const NOW = new Date("2026-10-13T12:00:00.000Z");
const live = { email: "invitee@example.test", role: "MANAGER", expiresAt: new Date(NOW.getTime() + 60_000), acceptedAt: null };

test("a token is returned once and only its hash is storable", () => {
  const { token, tokenHash } = createInvitationToken();
  assert.ok(token.length >= 40, `token too short: ${token.length}`);
  assert.notEqual(token, tokenHash, "the token must not be its own stored form");
  assert.equal(tokenHash, hashInvitationToken(token));
  assert.match(tokenHash, /^[0-9a-f]{64}$/);
  // Two tokens never collide.
  assert.notEqual(createInvitationToken().token, token);
});

test("a token is verified by hash, not by comparison of stored plaintext", () => {
  const { token, tokenHash } = createInvitationToken();
  assert.equal(invitationTokenMatches(tokenHash, token), true);
  assert.equal(invitationTokenMatches(tokenHash, `${token}x`), false);
  assert.equal(invitationTokenMatches(tokenHash, hashInvitationToken("other")), false);
});

test("an invitation admits its address, and nobody else", () => {
  assert.deepEqual(invitationDecision(live, "invitee@example.test", NOW), { ok: true });
  // The address is matched case-insensitively and trimmed.
  assert.deepEqual(invitationDecision(live, "  Invitee@Example.Test ", NOW), { ok: true });
  assert.deepEqual(invitationDecision(live, "somebody.else@example.test", NOW), {
    ok: false,
    reason: "email_mismatch",
  });
});

test("an unknown, used, expired or unreadable invitation is refused", () => {
  assert.deepEqual(invitationDecision(null, "x@example.test", NOW), { ok: false, reason: "missing" });
  assert.deepEqual(
    invitationDecision({ ...live, acceptedAt: NOW }, live.email, NOW),
    { ok: false, reason: "used" }
  );
  assert.deepEqual(
    invitationDecision({ ...live, expiresAt: new Date(NOW.getTime() - 1) }, live.email, NOW),
    { ok: false, reason: "expired" }
  );
  // The boundary: expiring exactly now is expired, not valid.
  assert.equal(invitationDecision({ ...live, expiresAt: NOW }, live.email, NOW).ok, false);
  assert.deepEqual(invitationDecision({ ...live, role: "OWNER" }, live.email, NOW), {
    ok: false,
    reason: "role_invalid",
  });
});

test("the invitation window is a week", () => {
  assert.equal(INVITATION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test("an invitation may carry any real role, which is how MANAGER and CLIENT exist", () => {
  for (const role of ROLE_VALUES) {
    assert.equal(isRoleValue(role), true);
    assert.deepEqual(invitationDecision({ ...live, role }, live.email, NOW), { ok: true });
  }
  assert.equal(isRoleValue("OWNER"), false);
  assert.equal(isRoleValue(""), false);
  assert.equal(isRoleValue(null), false);
});

test("nobody changes their own role, and the last admin cannot be demoted", () => {
  const base = { actorId: "admin_1", targetId: "user_2", targetRole: "EDITOR", nextRole: "MANAGER", adminCount: 2 };
  assert.equal(roleChangeProblem(base), null);

  assert.equal(roleChangeProblem({ ...base, targetId: "admin_1", targetRole: "ADMIN" }), "self");
  assert.equal(roleChangeProblem({ ...base, nextRole: "OWNER" }), "not_a_role");
  assert.equal(roleChangeProblem({ ...base, nextRole: "SUPERUSER" }), "not_a_role");

  // Demoting the only admin: refused. Promoting when admins exist: allowed.
  assert.equal(
    roleChangeProblem({ ...base, targetRole: "ADMIN", nextRole: "MANAGER", adminCount: 1 }),
    "last_admin"
  );
  assert.equal(
    roleChangeProblem({ ...base, targetRole: "ADMIN", nextRole: "MANAGER", adminCount: 2 }),
    null
  );
  // "Changing" an admin to ADMIN is not a demotion and must not be blocked.
  assert.equal(
    roleChangeProblem({ ...base, targetRole: "ADMIN", nextRole: "ADMIN", adminCount: 1 }),
    null
  );
});

test("the refusals explain themselves", () => {
  assert.match(roleChangeMessage("self"), /own role/i);
  assert.match(roleChangeMessage("last_admin"), /only admin/i);
  assert.match(roleChangeMessage("not_a_role"), new RegExp(ROLE_VALUES.join("|")));
});

test("emails are compared as the app stores them", () => {
  assert.equal(normalizeEmail("  A@B.Local "), "a@b.local");
});
