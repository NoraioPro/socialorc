/**
 * Dev-only role login.
 *
 * When `ALLOW_DEV_ROLE_LOGIN="true"` and we are not in a production build, the
 * credentials provider also accepts a `devRole` credential and signs in as the
 * seeded demo account for that role. That keeps the real NextAuth pipeline
 * (JWT, session callback, cookie handling) under test instead of bypassing it.
 *
 * Everything in here fails closed: without the flag, role login does not exist.
 */

import { DEFAULT_ROLE, ROLE_META, ROLES, isRole, type Role } from "./roles";

export const DEV_ROLE_LOGIN_ENV = "ALLOW_DEV_ROLE_LOGIN";
export const DEV_ROLE_LOGIN_PUBLIC_ENV = "NEXT_PUBLIC_DEV_ROLE_LOGIN";

/**
 * True only for an explicit opt-in outside a production build.
 * `NODE_ENV` is checked so a stray flag in a production .env cannot open a
 * role-based login backdoor.
 */
export function isDevRoleLoginEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[DEV_ROLE_LOGIN_ENV] === "true" && env.NODE_ENV !== "production";
}

/**
 * Same gate for browser code, which can only read NEXT_PUBLIC_* at build time.
 * The server gate above is the security boundary; this one is presentation.
 *
 * The literal `process.env.NEXT_PUBLIC_DEV_ROLE_LOGIN` below is deliberate:
 * Next only inlines statically written keys into the client bundle, so looking
 * it up dynamically (`env[SOME_CONST]`) yields undefined in the browser, the
 * panel renders server-side and not on hydration, and React reports a
 * hydration mismatch. Keep the literal; tests pass an env object instead.
 */
export function isDevRoleLoginVisible(env?: NodeJS.ProcessEnv): boolean {
  const nodeEnv =
    env?.NODE_ENV ??
    (process.env.NODE_ENV as string | undefined);

  if (nodeEnv === "production") return false;

  const flag = env
    ? env[DEV_ROLE_LOGIN_PUBLIC_ENV]
    : process.env.NEXT_PUBLIC_DEV_ROLE_LOGIN;

  return flag === "true";
}

export function demoEmailFor(role: Role): string {
  return ROLE_META[role].demoEmail;
}

export function demoNameFor(role: Role): string {
  return ROLE_META[role].demoName;
}

/**
 * Narrow an untrusted `devRole` credential to a real role.
 * Returns null (not FALLBACK_ROLE) so a bad value is refused outright rather
 * than silently signing somebody in as a read-only client.
 */
export function devRoleFromCredential(value: unknown): Role | null {
  return isRole(value) ? value : null;
}

export interface DevRoleOption {
  role: Role;
  label: string;
  blurb: string;
  email: string;
}

/** The list the login page renders; ordered most-privileged first. */
export function devRoleOptions(): DevRoleOption[] {
  return ROLES.map((role) => ({
    role,
    label: ROLE_META[role].label,
    blurb: ROLE_META[role].blurb,
    email: ROLE_META[role].demoEmail,
  }));
}

export { DEFAULT_ROLE };

