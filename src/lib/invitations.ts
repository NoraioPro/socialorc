/**
 * Invitations and role changes, as decisions rather than as routes.
 *
 * Two questions live here so they can be answered without a request: may this
 * invitation be accepted (by this address, at this time), and may this role be
 * changed (by this actor, for this target). Both are the kind of rule that is
 * easy to get subtly wrong inline and impossible to test there.
 *
 * Pure: no Prisma, no cookies, no clock of its own.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Every role the product knows. Mirrors ROLES in src/lib/roles.ts. */
export const ROLE_VALUES = ["ADMIN", "MANAGER", "EDITOR", "CLIENT"] as const;
export type RoleValue = (typeof ROLE_VALUES)[number];

export function isRoleValue(value: unknown): value is RoleValue {
  return typeof value === "string" && (ROLE_VALUES as readonly string[]).includes(value);
}

/** Raw token for the invitee, and the value we are willing to store. */
export function createInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare, so a wrong token cannot be found byte by byte. */
export function invitationTokenMatches(storedHash: string, presented: string): boolean {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hashInvitationToken(presented), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type InvitationProblem =
  | "missing"
  | "expired"
  | "used"
  | "email_mismatch"
  | "role_invalid";

export interface InvitationRow {
  email: string;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/**
 * Whether this invitation admits this address right now.
 *
 * Deliberately says "the invitation is not valid" without distinguishing a wrong
 * address from a used one in the *response* — the caller decides what to reveal.
 * The reason is returned for logs and tests.
 */
export function invitationDecision(
  invite: InvitationRow | null,
  email: string,
  now: Date = new Date()
): { ok: true } | { ok: false; reason: InvitationProblem } {
  if (!invite) return { ok: false, reason: "missing" };
  if (invite.acceptedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (!isRoleValue(invite.role)) return { ok: false, reason: "role_invalid" };
  if (normalizeEmail(invite.email) !== normalizeEmail(email)) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true };
}

export type RoleChangeProblem = "not_a_role" | "self" | "last_admin";

/**
 * Whether this role change may happen.
 *
 * `adminCount` is the number of ADMINs *including* the target, counted before the
 * write: demoting the last one would leave a workspace nobody can administer, and
 * an actor changing their own role can lock themselves out of the page that would
 * undo it.
 */
export function roleChangeProblem(input: {
  actorId: string;
  targetId: string;
  targetRole: string;
  nextRole: unknown;
  adminCount: number;
}): RoleChangeProblem | null {
  if (!isRoleValue(input.nextRole)) return "not_a_role";
  if (input.actorId === input.targetId) return "self";
  if (input.targetRole === "ADMIN" && input.nextRole !== "ADMIN" && input.adminCount <= 1) {
    return "last_admin";
  }
  return null;
}

export function roleChangeMessage(problem: RoleChangeProblem): string {
  switch (problem) {
    case "not_a_role":
      return `Role must be one of: ${ROLE_VALUES.join(", ")}.`;
    case "self":
      return "You cannot change your own role — ask another admin.";
    case "last_admin":
      return "This is the only admin left. Promote somebody else first.";
  }
}
