/**
 * Where Telegram replies live once they have been taken off the bot's queue.
 *
 * Why this exists: a Telegram bot has ONE update queue (getUpdates), shared by
 * every chat the bot is in — and SocialOrc runs one bot for every tenant. The
 * queue is destructive: calling getUpdates with an `offset` higher than an
 * update's id *confirms* it, and Telegram never returns it again (and drops
 * unconfirmed ones after 24 hours anyway). So reading replies for one account
 * and advancing the offset silently consumed every other account's replies, and
 * not advancing it means the oldest 100 pending updates block everything newer.
 *
 * The fix is to treat the queue as a feed to drain, not a query to answer:
 * every reply is persisted keyed by the chat it was sent in, the offset only
 * advances after that write, and an account reads its own chat's rows back out.
 * Message ids are only unique per chat, so the chat is part of every lookup —
 * matching on `reply_to_message.message_id` alone is what showed one tenant's
 * replies on another tenant's post.
 */

/** One reply in a chat, as stored. Ids are strings: chat ids exceed 32 bits. */
export interface StoredTelegramReply {
  updateId: number;
  chatId: string;
  messageId: number;
  replyToMessageId: number;
  authorId: string | null;
  authorName: string | null;
  text: string;
  sentAt: Date;
}

/**
 * A connect code (telegram-connect-code.ts) seen in a chat during a drain. The
 * drain is the only reader of the shared update queue, so this is where a code
 * posted in a chat is noticed without consuming anybody else's updates.
 */
export interface ConnectCodeSighting {
  codeHash: string;
  chatId: string;
  chatType: string | null;
  /** The sender, when Telegram names one (channel posts have none). */
  authorId: string | null;
}

export interface TelegramReplyStore {
  /** The next getUpdates offset for this bot, or null if it has never been drained. */
  getOffset(botId: string): Promise<number | null>;
  /** Persist replies. Must be idempotent on `updateId`: a crashed drain re-reads the same batch. */
  saveReplies(replies: StoredTelegramReply[]): Promise<void>;
  /** Move the offset forward. Never backwards, so concurrent drains cannot rewind each other. */
  advanceOffset(botId: string, nextOffset: number): Promise<void>;
  /** Replies to one message in one chat, oldest first. */
  listReplies(
    chatId: string,
    replyToMessageId: number,
    page: { skip: number; take: number },
  ): Promise<StoredTelegramReply[]>;
  /**
   * Record where pending connect codes were posted. Only the FIRST sighting of
   * a live, unused code counts; a later repost elsewhere changes nothing.
   */
  recordConnectCodes(sightings: ConnectCodeSighting[]): Promise<void>;
}

/** The bot id is the part of the token before the colon; it is not a secret. */
export function botIdFromToken(token: string): string {
  const id = token.split(":")[0]?.trim();
  return id && /^\d+$/.test(id) ? id : "unknown";
}

/** In-memory store, for tests and for anything that must not touch a database. */
export class MemoryTelegramReplyStore implements TelegramReplyStore {
  readonly offsets = new Map<string, number>();
  readonly replies = new Map<number, StoredTelegramReply>();
  /** codeHash → first sighting. Tests seed `liveCodes` to model issued codes. */
  readonly codeSightings = new Map<string, ConnectCodeSighting>();
  readonly liveCodes = new Set<string>();

  async getOffset(botId: string): Promise<number | null> {
    return this.offsets.get(botId) ?? null;
  }

  async saveReplies(replies: StoredTelegramReply[]): Promise<void> {
    for (const reply of replies) {
      if (!this.replies.has(reply.updateId)) this.replies.set(reply.updateId, reply);
    }
  }

  async advanceOffset(botId: string, nextOffset: number): Promise<void> {
    const current = this.offsets.get(botId) ?? 0;
    if (nextOffset > current) this.offsets.set(botId, nextOffset);
  }

  async listReplies(
    chatId: string,
    replyToMessageId: number,
    page: { skip: number; take: number },
  ): Promise<StoredTelegramReply[]> {
    return [...this.replies.values()]
      .filter((r) => r.chatId === chatId && r.replyToMessageId === replyToMessageId)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.messageId - b.messageId)
      .slice(page.skip, page.skip + page.take);
  }

  async recordConnectCodes(sightings: ConnectCodeSighting[]): Promise<void> {
    for (const sighting of sightings) {
      if (!this.liveCodes.has(sighting.codeHash) || this.codeSightings.has(sighting.codeHash)) continue;
      this.codeSightings.set(sighting.codeHash, sighting);
    }
  }
}

/**
 * Database-backed store. Prisma is imported lazily so that importing the adapter
 * (which every adapter test does) never opens a database connection.
 */
export class PrismaTelegramReplyStore implements TelegramReplyStore {
  private async db() {
    const { default: prisma } = await import("@/lib/prisma");
    return prisma;
  }

  async getOffset(botId: string): Promise<number | null> {
    const prisma = await this.db();
    const row = await prisma.telegramUpdateCursor.findUnique({ where: { botId } });
    return row ? Number(row.nextOffset) : null;
  }

  async saveReplies(replies: StoredTelegramReply[]): Promise<void> {
    if (replies.length === 0) return;
    const prisma = await this.db();
    // One upsert per row: `createMany({ skipDuplicates })` is not available on
    // SQLite, and the unique update id is what makes a re-read batch harmless.
    for (const reply of replies) {
      await prisma.telegramReply.upsert({
        where: { updateId: BigInt(reply.updateId) },
        create: {
          updateId: BigInt(reply.updateId),
          chatId: reply.chatId,
          messageId: reply.messageId,
          replyToMessageId: reply.replyToMessageId,
          authorId: reply.authorId,
          authorName: reply.authorName,
          text: reply.text,
          sentAt: reply.sentAt,
        },
        update: {},
      });
    }
  }

  async advanceOffset(botId: string, nextOffset: number): Promise<void> {
    const prisma = await this.db();
    const next = BigInt(nextOffset);
    const moved = await prisma.telegramUpdateCursor.updateMany({
      where: { botId, nextOffset: { lt: next } },
      data: { nextOffset: next },
    });
    if (moved.count > 0) return;
    // No row yet (first drain) — or a concurrent drain already moved further,
    // in which case the create collides on the primary key and is ignored.
    try {
      await prisma.telegramUpdateCursor.create({ data: { botId, nextOffset: next } });
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }

  async listReplies(
    chatId: string,
    replyToMessageId: number,
    page: { skip: number; take: number },
  ): Promise<StoredTelegramReply[]> {
    const prisma = await this.db();
    const rows = await prisma.telegramReply.findMany({
      where: { chatId, replyToMessageId },
      orderBy: [{ sentAt: "asc" }, { messageId: "asc" }],
      skip: page.skip,
      take: page.take,
    });
    return rows.map((row) => ({
      updateId: Number(row.updateId),
      chatId: row.chatId,
      messageId: row.messageId,
      replyToMessageId: row.replyToMessageId,
      authorId: row.authorId,
      authorName: row.authorName,
      text: row.text,
      sentAt: row.sentAt,
    }));
  }

  async recordConnectCodes(sightings: ConnectCodeSighting[]): Promise<void> {
    if (sightings.length === 0) return;
    const prisma = await this.db();
    const now = new Date();
    for (const sighting of sightings) {
      // Guarded write: first sighting of a live, unused code only.
      await prisma.telegramConnectCode.updateMany({
        where: { codeHash: sighting.codeHash, seenAt: null, usedAt: null, expiresAt: { gt: now } },
        data: {
          chatId: sighting.chatId,
          chatType: sighting.chatType,
          authorId: sighting.authorId,
          seenAt: now,
        },
      });
    }
  }
}
