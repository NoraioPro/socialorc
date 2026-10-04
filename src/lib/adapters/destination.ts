/**
 * Where a send is addressed, taken from the connected account rather than from
 * the process environment.
 *
 * Why this exists: SocialOrc runs ONE application credential per platform (the
 * normal SaaS shape — every tenant cannot each own a Facebook app), but the
 * *destination* of a send belongs to the account. Telegram made the cost of
 * conflating the two concrete: the adapter read `process.env.TELEGRAM_CHAT_ID`
 * whenever the caller supplied nothing, so every tenant published into — and
 * read engagement from — the deployment owner's private chat.
 *
 * Only values that are actually present are returned, and a blank string counts
 * as absent: an empty destination would otherwise be sent to the platform as a
 * real target, which is exactly how "unset" turns into "somebody else's chat".
 */

/** Read the platform destination recorded on a `SocialAccount.metadata` value. */
export function destinationForAccount(metadata: unknown): Record<string, unknown> {
  const record = isRecord(metadata) ? metadata : {};
  const chatId = normaliseId(record.chatId);
  return chatId === null ? {} : { chatId };
}

/**
 * Normalise an id coming out of JSON metadata: a non-empty trimmed string, or a
 * finite number in its string form. Blank, null, NaN, arrays and objects are
 * treated as absent rather than coerced.
 */
function normaliseId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
