/**
 * Bounded cleanup of stored Telegram data.
 *
 * The shared bot's update drain stores every reply it sees, from every chat the
 * bot is in (connected or not), and nothing ever deleted a row. Replies are only
 * read to show engagement on recent posts, so rows older than RETENTION_DAYS
 * are dead weight, and for chats that were never connected they are other
 * people's messages we have no reason to keep. Used connect codes and codes
 * long past expiry go with them.
 *
 * Bounded on purpose: each call removes at most BATCH_SIZE x MAX_BATCHES rows
 * of each kind (oldest first), so a large backlog is worked off over several
 * runs instead of one long delete holding up the publish worker. The returned
 * counts are what was actually deleted, so a run is verifiable from the cron
 * response and logs. The client is injectable for tests.
 */

export const TELEGRAM_REPLY_RETENTION_DAYS = 30;
/** Connect codes live 15 minutes; keep the spent ones a day for support, then drop. */
export const TELEGRAM_CODE_RETENTION_DAYS = 1;
export const CLEANUP_BATCH_SIZE = 500;
export const CLEANUP_MAX_BATCHES = 4;

export interface TelegramCleanupClient {
  telegramReply: {
    findMany(args: {
      where: { createdAt: { lt: Date } };
      orderBy: { createdAt: "asc" };
      select: { id: true };
      take: number;
    }): Promise<{ id: string }[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
  telegramConnectCode: {
    findMany(args: {
      where: { expiresAt: { lt: Date } };
      orderBy: { expiresAt: "asc" };
      select: { id: true };
      take: number;
    }): Promise<{ id: string }[]>;
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
}

export interface TelegramCleanupResult {
  repliesDeleted: number;
  codesDeleted: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function drain(
  find: (cutoff: Date) => Promise<{ id: string }[]>,
  remove: (ids: string[]) => Promise<{ count: number }>,
  cutoff: Date,
): Promise<number> {
  let deleted = 0;
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
    const rows = await find(cutoff);
    if (rows.length === 0) break;
    deleted += (await remove(rows.map((row) => row.id))).count;
    if (rows.length < CLEANUP_BATCH_SIZE) break;
  }
  return deleted;
}

export async function purgeStaleTelegramData(
  client: TelegramCleanupClient,
  now: Date,
): Promise<TelegramCleanupResult> {
  const repliesDeleted = await drain(
    (cutoff) =>
      client.telegramReply.findMany({
        where: { createdAt: { lt: cutoff } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: CLEANUP_BATCH_SIZE,
      }),
    (ids) => client.telegramReply.deleteMany({ where: { id: { in: ids } } }),
    new Date(now.getTime() - TELEGRAM_REPLY_RETENTION_DAYS * DAY_MS),
  );

  const codesDeleted = await drain(
    (cutoff) =>
      client.telegramConnectCode.findMany({
        where: { expiresAt: { lt: cutoff } },
        orderBy: { expiresAt: "asc" },
        select: { id: true },
        take: CLEANUP_BATCH_SIZE,
      }),
    (ids) => client.telegramConnectCode.deleteMany({ where: { id: { in: ids } } }),
    new Date(now.getTime() - TELEGRAM_CODE_RETENTION_DAYS * DAY_MS),
  );

  return { repliesDeleted, codesDeleted };
}

/**
 * The cron runs every five minutes; cleaning is hourly work. True only in the
 * first run of each hour, so it costs nothing on the other eleven.
 */
export function isCleanupTick(now: Date): boolean {
  return now.getUTCMinutes() < 5;
}
