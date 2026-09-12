/**
 * Who may create an account.
 *
 * SocialOrc is a single-workspace product, so registration is not a free-for-all.
 * The public signup form was handing out accounts to anyone who found it, and
 * (before the role fix) those accounts were admins.
 *
 * The rules, in order:
 *
 *  1. The first account always gets in. It bootstraps the workspace owner, so
 *     refusing it would leave the deployment with no way to sign in at all.
 *  2. `ALLOW_PUBLIC_SIGNUP=true` reopens registration deliberately, for a
 *     deployment that genuinely wants self-serve signups.
 *  3. `SIGNUP_ALLOWLIST` invites specific people — comma-separated, accepting
 *     exact addresses and whole domains ("me@x.com,@example.com").
 *
 * Kept pure, taking the env bag as a parameter like `auth-providers.ts`, so the
 * rules are testable without NextAuth, Prisma or a request context.
 */

export interface SignupDecision {
  allowed: boolean;
  /**
   * Why, for the server log only. Never send this to the client: it would tell
   * an attacker which addresses are invited.
   */
  reason: string;
}

/** Parse `SIGNUP_ALLOWLIST` into lower-cased entries. */
export function signupAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.SIGNUP_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether `email` may register, given how many accounts already exist.
 * `existingUserCount` is passed in rather than queried so the caller can reuse
 * one count for both the decision and the role assignment.
 */
export function signupDecision(
  email: string,
  existingUserCount: number,
  env: NodeJS.ProcessEnv = process.env,
): SignupDecision {
  const normalised = email.trim().toLowerCase();

  if (existingUserCount === 0) {
    return { allowed: true, reason: "first account bootstraps the workspace owner" };
  }

  if ((env.ALLOW_PUBLIC_SIGNUP ?? "").trim().toLowerCase() === "true") {
    return { allowed: true, reason: "ALLOW_PUBLIC_SIGNUP is true" };
  }

  const invited = signupAllowlist(env).find((entry) =>
    entry.startsWith("@") ? normalised.endsWith(entry) : entry === normalised,
  );

  if (invited) {
    return { allowed: true, reason: "address is on SIGNUP_ALLOWLIST" };
  }

  return {
    allowed: false,
    reason:
      "registration is invite-only - set SIGNUP_ALLOWLIST to invite specific " +
      "addresses, or ALLOW_PUBLIC_SIGNUP=true to open it deliberately",
  };
}
