import { createHash, randomInt } from "node:crypto";

/**
 * One-time codes that prove the person connecting Telegram controls the chat.
 *
 * A chat id alone proves nothing: anybody can type one, and the bot can post
 * into any chat it was ever added to. So connecting is a challenge: the server
 * issues a short random code bound to one user in one workspace, the user posts
 * it in the chat (directly, through a `t.me/<bot>?start=` deep link, or as
 * `/connect@<bot> <code>` in a group), and the bot's update drain records the
 * first chat it appears in. Only that chat can then be bound, by that user.
 *
 * Only the SHA-256 of a code is stored. Codes are short-lived (CONNECT_CODE_TTL_MS).
 */

export const CONNECT_CODE_TTL_MS = 15 * 60_000;

/** No 0/O, 1/I/L: the code may be typed by hand into a channel. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_BODY_LENGTH = 12;
const PREFIX = "SOC";

/** Matches a code anywhere in a message (`/start SOC…`, `/connect@bot SOC…`, plain). */
const CODE_IN_TEXT = new RegExp(`(?:^|[^A-Za-z0-9])(${PREFIX}[A-HJKMNP-Z2-9]{${CODE_BODY_LENGTH}})(?![A-Za-z0-9])`, "gi");

export function generateConnectCode(): string {
  let body = "";
  for (let i = 0; i < CODE_BODY_LENGTH; i += 1) body += ALPHABET[randomInt(ALPHABET.length)];
  return `${PREFIX}${body}`;
}

export function hashConnectCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function isConnectCodeShape(value: string): boolean {
  return new RegExp(`^${PREFIX}[A-HJKMNP-Z2-9]{${CODE_BODY_LENGTH}}$`).test(value.trim().toUpperCase());
}

/** Every code-shaped token in a message, upper-cased, de-duplicated. */
export function extractConnectCodes(text: string | undefined | null): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(CODE_IN_TEXT)) found.add(match[1].toUpperCase());
  return [...found];
}

/**
 * A Telegram account is one chat reached through one bot. Keying accounts by
 * the bot alone let the first workspace to connect own the shared bot for the
 * whole deployment; keyed by chat, workspaces can connect different chats, and
 * the unique (platform, platformUserId) key still stops two binding the same one.
 */
export function telegramAccountId(botId: string, chatId: string): string {
  return `${botId}:${chatId}`;
}
