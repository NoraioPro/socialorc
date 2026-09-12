/**
 * Session + database agreement checks for connection routes.
 *
 * A NextAuth JWT is signed, not bound to a database. Two local checkouts that
 * share `NEXTAUTH_SECRET` (copied `.env`) will happily accept each other's
 * session cookies, and because cookies are scoped by host — *not* by port — a
 * session minted on `localhost:3200` against one SQLite file is presented to
 * `localhost:3000`, which has a different `User` row set. The id in the token
 * then exists nowhere in that database, and `socialAccount.create({ userId })`
 * fails with a raw foreign-key violation that reads like a schema bug.
 *
 * So every connection route asks this module first: is there a signed-in user
 * *and* does that user exist here? And when something does go wrong, the browser
 * gets a stable code — never the database's own error text, which belongs in the
 * server log rather than in a query string the user can share.
 */

import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export type SessionUserProblem = "UNAUTHENTICATED" | "UNKNOWN_USER";

export type SessionUserResult =
  | { ok: true; userId: string }
  | { ok: false; code: SessionUserProblem };

/**
 * Resolve the signed-in user and prove they exist in this database.
 *
 * The extra lookup is one indexed primary-key hit on a route that is about to
 * write several rows and call a third-party API — cheap next to mistaking a
 * stale session for a broken connector.
 */
export async function resolveSessionUser(): Promise<SessionUserResult> {
  const session = await getAuthSession();
  const userId = session?.user?.id;

  if (!userId) return { ok: false, code: "UNAUTHENTICATED" };

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { ok: false, code: "UNKNOWN_USER" };

  return { ok: true, userId };
}

/**
 * A short, stable, non-sensitive reason for a redirect query string.
 *
 * Anything unexpected collapses to the fallback, so a Prisma message, a stack
 * trace or a token can never end up in the URL, the referrer header or the
 * browser history.
 */
export function safeRedirectCode(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/foreign key constraint/i.test(message)) return "session_user_missing";
  if (/unique constraint/i.test(message)) return "account_already_connected";
  if (/NEXTAUTH|decrypt|JWT/i.test(message)) return fallback;
  return fallback;
}

/** Where to send the browser when the session cannot be trusted here. */
export function sessionProblemRedirect(code: SessionUserProblem): {
  path: string;
  message: string;
} {
  if (code === "UNKNOWN_USER") {
    return {
      path: "/login?error=session_expired&reason=different_database",
      message:
        "Your sign-in belongs to another database (for example a second local server on the same host). Sign in again here.",
    };
  }
  return { path: "/login?error=unauthorized", message: "Sign in to continue." };
}
