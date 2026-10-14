import type { NextRequest } from "next/server";
import { Platform } from "@prisma/client";
import { validateOAuthState, type OAuthStateData } from "@/lib/oauth/state";
import { oauthStateSecret } from "@/lib/oauth/state-secret";

/**
 * Shared by the two Telegram connect endpoints (issue a code, verify and save).
 *
 * Both are POSTs that require the signed `oauth_state_<state>` cookie minted by
 * /api/social/connect for THIS user and TELEGRAM, on every path — there is no
 * branch that connects without it, and no environment fallback for the chat.
 */

const STATE_SHAPE = /^[a-f0-9]{64}$/;

export function stateCookieName(state: string): string {
  return `oauth_state_${state}`;
}

export function readTelegramState(
  req: NextRequest,
  state: unknown,
  userId: string,
): { ok: true; state: string; data: OAuthStateData } | { ok: false } {
  if (typeof state !== "string" || !STATE_SHAPE.test(state)) return { ok: false };
  const check = validateOAuthState(req.cookies.get(stateCookieName(state))?.value, {
    userId,
    platform: Platform.TELEGRAM,
    secret: oauthStateSecret(),
  });
  return check.ok ? { ok: true, state, data: check.data } : { ok: false };
}

/** Chat types where anybody in the chat can post, so the poster must be an admin. */
export function requiresAdminProof(chatType: string | null): boolean {
  return chatType === "group" || chatType === "supergroup";
}

export const TELEGRAM_ADMIN_STATUSES = new Set(["creator", "administrator"]);
