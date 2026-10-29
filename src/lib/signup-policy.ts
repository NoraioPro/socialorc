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

/**
 * Whether an OAuth sign-in may proceed.
 *
 * A sign-in for an identity that is already linked, or that belongs to an
 * existing user, is a login, not a registration, and is always allowed here.
 * Only a brand-new account is a registration, and it is held to the same
 * `signupDecision` rules as the password form. Without this an invite-only
 * deployment was open to anyone with a Google or Facebook account.
 *
 * A new identity with no address cannot be checked against the allowlist, so
 * it is refused unless it is the very first account.
 */
export function oauthSignInDecision(input: {
  email: string | null;
  identityKnown: boolean;
  userWithEmailExists: boolean;
  existingUserCount: number;
  env?: NodeJS.ProcessEnv;
}): SignupDecision {
  if (input.identityKnown || input.userWithEmailExists) {
    return { allowed: true, reason: "existing account" };
  }
  if (!input.email) {
    return input.existingUserCount === 0
      ? { allowed: true, reason: "first account bootstraps the workspace owner" }
      : { allowed: false, reason: "new OAuth identity without an email address" };
  }
  return signupDecision(input.email, input.existingUserCount, input.env);
}

/**
 * Whether a verified Google identity may be attached to an existing account.
 *
 * Linking on email alone lets someone who pre-registered a password account for
 * a victim's address inherit the victim's later Google login. Only link when
 * the existing account has no password (nothing to pre-seed) or its email was
 * verified.
 */
export function mayLinkOAuthToExisting(existing: {
  password: string | null;
  emailVerified: Date | null;
}): boolean {
  return !existing.password || existing.emailVerified !== null;
}
