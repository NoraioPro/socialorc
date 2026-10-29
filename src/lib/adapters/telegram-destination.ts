/**
 * Re-check, at publish time, that a connected Telegram chat still satisfies the
 * conditions it was connected under.
 *
 * Connecting proves control once: the person who posted the code was an admin of
 * the group. Nothing re-checked it afterwards, so a user removed as admin (or a
 * bot removed from the chat) kept a live connection. Telegram can answer the
 * relevant questions through getChatMember, so they are asked again before a send:
 *
 *  - the bot is still in the chat, and in a channel can still post;
 *  - in a group or channel, the user who connected it is still creator/admin
 *    (only when the connecting user's Telegram id was recorded at connect time).
 *
 * Only a definite answer blocks a send. A network error or an unexpected reply is
 * "unknown" and the send proceeds (it would fail loudly on its own if the bot had
 * really lost access): a Telegram outage must not be mistaken for a revoked chat.
 * Private chats cannot be checked and are not.
 */

export interface TelegramMemberInfo {
  status: string;
  canPostMessages?: boolean;
  canSendMessages?: boolean;
}

export type MemberLookup =
  | { ok: true; member: TelegramMemberInfo }
  | { ok: false; definite: boolean; error: string };

export type DestinationVerdict =
  | { ok: true }
  | { ok: false; reason: string }
  | { ok: "unknown" };

export interface DestinationFacts {
  chatId: string;
  chatType?: string | null;
  botId?: string | null;
  connectedBy?: string | null;
}

const ADMIN = new Set(["creator", "administrator"]);
const GONE = new Set(["left", "kicked"]);

export async function verifyTelegramDestination(
  facts: DestinationFacts,
  lookup: (userId: string) => Promise<MemberLookup>,
): Promise<DestinationVerdict> {
  const type = facts.chatType ?? "";
  // Nothing recorded to check against (older connections), or a private chat.
  if (!type || type === "private") return { ok: true };

  if (facts.botId) {
    const bot = await lookup(facts.botId);
    if (!bot.ok) {
      return bot.definite
        ? { ok: false, reason: "The SocialOrc bot is no longer in this Telegram chat. Add it again and reconnect." }
        : { ok: "unknown" };
    }
    if (GONE.has(bot.member.status)) {
      return { ok: false, reason: "The SocialOrc bot was removed from this Telegram chat. Add it again and reconnect." };
    }
    if (type === "channel") {
      if (bot.member.status !== "administrator" || bot.member.canPostMessages === false) {
        return { ok: false, reason: "The SocialOrc bot can no longer post in this channel. Make it an admin with permission to post, then reconnect." };
      }
    } else if (bot.member.status === "restricted" && bot.member.canSendMessages === false) {
      return { ok: false, reason: "The SocialOrc bot is not allowed to send messages in this chat. Change its permissions, then reconnect." };
    }
  }

  if (facts.connectedBy) {
    const author = await lookup(facts.connectedBy);
    if (!author.ok) {
      return author.definite
        ? { ok: false, reason: "The person who connected this Telegram chat is no longer a member. Reconnect it as a current admin." }
        : { ok: "unknown" };
    }
    if (!ADMIN.has(author.member.status)) {
      return { ok: false, reason: "The person who connected this Telegram chat is no longer an admin of it. Reconnect it as a current admin." };
    }
  }

  return { ok: true };
}

/**
 * Telegram answers "chat not found", "user not found", "member list is
 * inaccessible" and "bot was kicked" with HTTP 400/403. Those are verdicts about
 * the chat; anything else (network, 401 for a bad token, 429, 5xx) is not.
 */
export function isDefiniteMembershipError(httpStatus: number, description: string): boolean {
  if (httpStatus !== 400 && httpStatus !== 403) return false;
  return /chat not found|user not found|member not found|participant|kicked|not a member|forbidden|have no rights/i.test(description);
}
