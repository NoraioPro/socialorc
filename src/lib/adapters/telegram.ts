import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "./base";
import {
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostResult,
  ListCommentsOptions,
  ListCommentsResult,
  WriteCommentOptions,
  ReplyToCommentOptions,
  DeleteCommentOptions,
  ReactToPostOptions,
  UnreactToPostOptions,
  ReactToCommentOptions,
  UnreactToCommentOptions,
  EngagementResult,
  SocialComment,
  ReactionKind,
} from "@/types/platform";
import {
  validateTelegramCredentials,
  type CredentialValidationResult,
} from "./credentials";
import {
  PrismaTelegramReplyStore,
  botIdFromToken,
  type StoredTelegramReply,
  type TelegramReplyStore,
} from "./telegram-replies";

const TELEGRAM_API = process.env.TELEGRAM_API_BASE?.replace(/\/$/, "") || "https://api.telegram.org";

/**
 * Raised when the account a call is acting for has no chat id.
 *
 * This is a mis-configured account, not a transient failure, so callers classify
 * it permanent and dead-letter on the first attempt with an instruction rather
 * than retrying three times against a destination that cannot exist.
 */
const MISSING_CHAT_ERROR =
  "This Telegram account has no target chat id, so there is nowhere to publish. " +
  "Reconnect the account and choose the chat the bot should post into.";

/** getUpdates returns at most 100 updates per call. */
const UPDATES_PER_BATCH = 100;
/** Batches drained per read: enough to catch up, bounded so a read cannot hang. */
const MAX_DRAIN_BATCHES = 5;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    text?: string;
    chat?: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    reply_to_message?: { message_id: number };
  };
}

/**
 * Telegram adapter.
 *
 * Telegram has no browser OAuth handshake: a bot token + a target chat id are
 * the whole credential set. "Connecting" therefore means registering those two
 * values (see /api/social/telegram/connect). This is the first real-network
 * connector in SocialOrc and doubles as the reference for token-based
 * (non-OAuth) platforms in the future Connector Framework.
 *
 * TELEGRAM_API_BASE overrides the API root, which the Telegram Bot API allows
 * for self-hosted servers and which the durability suite uses to exercise the
 * unreachable-platform path.
 */
export class TelegramAdapter extends BasePlatformAdapter {
  platform: Platform = Platform.TELEGRAM;

  /** Where drained replies are kept; injectable so tests need no database. */
  readonly replyStore: TelegramReplyStore;

  constructor(deps: { replyStore?: TelegramReplyStore } = {}) {
    super();
    this.replyStore = deps.replyStore ?? new PrismaTelegramReplyStore();
  }

  /**
   * Validate Telegram credentials: both presence and token shape.
   * The bot token must match the format {bot_id}:{35-char-token}.
   * The chat ID must be a numeric value (possibly negative for groups/channels).
   */
  validateCredentials(): { valid: boolean; missing: string[] } {
    const result = this.validateCredentialsExtended();
    const allIssues = [
      ...result.missing,
      ...result.invalid.map((i) => `${i.key} (invalid format)`),
    ];
    return { valid: result.valid, missing: allIssues };
  }

  /**
   * Extended validation returning detailed error information.
   * Use this when you need to know why credentials are invalid, not just that they are.
   */
  validateCredentialsExtended(): CredentialValidationResult {
    return validateTelegramCredentials();
  }

  /** No OAuth: the "authorize" step is a local confirm-and-store route. */
  getOAuthUrl(state: string): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/api/social/telegram/connect?state=${state}&platform=TELEGRAM`;
  }

  /**
   * Bot tokens are the deployment's own credential; only the *chat* is
   * per-account. See resolveChatId.
   */
  async exchangeCodeForTokens(): Promise<OAuthTokens> {
    const token = process.env.TELEGRAM_BOT_TOKEN as string;
    return {
      accessToken: token,
      refreshToken: null,
      expiresAt: null,
      tokenType: "Bot",
      scope: "bot",
    };
  }

  /** Bot tokens do not expire; a refresh is a no-op re-read of the env token. */
  async refreshAccessToken(): Promise<OAuthTokens> {
    return this.exchangeCodeForTokens();
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/getMe`);
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { id: number; username?: string; first_name?: string };
    };

    if (!json.ok || !json.result) {
      throw new Error(`Telegram getMe failed: ${json.description ?? res.status}`);
    }

    return {
      platformUserId: String(json.result.id),
      platformUsername: json.result.username,
      displayName: json.result.first_name,
      metadata: { isBot: true },
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    const chatId = this.resolveChatId(options.additionalOptions);

    if (!chatId) {
      return { success: false, error: MISSING_CHAT_ERROR, code: "NOT_FOUND" };
    }

    const mediaUrls = options.mediaUrls ?? [];
    const endpoint = mediaUrls.length > 0 ? "sendPhoto" : "sendMessage";
    const payload: Record<string, unknown> =
      mediaUrls.length > 0
        ? { chat_id: chatId, photo: mediaUrls[0], caption: options.text }
        : { chat_id: chatId, text: options.text, disable_web_page_preview: true };

    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { message_id: number; chat?: { username?: string; id?: number } };
    };

    if (!json.ok || !json.result) {
      return {
        success: false,
        error: `Telegram ${endpoint} failed: ${json.description ?? res.status}`,
        rawResponse: json,
      };
    }

    const messageId = json.result.message_id;
    const chatUsername = json.result.chat?.username;
    const platformPostUrl = chatUsername
      ? `https://t.me/${chatUsername}/${messageId}`
      : `https://t.me/c/${String(chatId).replace("-100", "")}/${messageId}`;

    return {
      success: true,
      platformPostId: String(messageId),
      platformPostUrl,
      rawResponse: json,
    };
  }

  /**
   * The chat a call acts in.
   *
   * Telegram's bot token is a single process-wide credential (the normal SaaS
   * shape: one SocialOrc-owned bot serving every tenant), but the chat it posts
   * into belongs to ONE connected account. This used to fall back to
   * `process.env.TELEGRAM_CHAT_ID` whenever the caller supplied nothing, which
   * meant every tenant published into — and read and deleted engagement from —
   * the deployment owner's private chat.
   *
   * Env is now only the *default offered at connect time*. At publish and
   * engagement time the account's own chat id is the only source, and its
   * absence is a loud, permanent failure instead of a silent redirect.
   */
  private resolveChatId(additionalOptions?: Record<string, unknown>): string | null {
    const raw = additionalOptions?.chatId;
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
    return null;
  }

  /**
   * Resolve a chat the bot can actually reach.
   *
   * Used by the connect route so a wrong chat id is refused when somebody
   * connects, with Telegram's own reason, rather than surfacing as a failed
   * publish hours later.
   */
  async getChat(
    accessToken: string,
    chatId: string,
  ): Promise<
    { ok: true; title: string | null; type: string | null } | { ok: false; error: string }
  > {
    const res = await fetch(
      `${TELEGRAM_API}/bot${accessToken}/getChat?chat_id=${encodeURIComponent(chatId)}`,
    );

    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { title?: string; username?: string; first_name?: string; type?: string };
    };

    if (!json.ok || !json.result) {
      return { ok: false, error: json.description ?? `HTTP ${res.status}` };
    }

    return {
      ok: true,
      title: json.result.title ?? json.result.username ?? json.result.first_name ?? null,
      type: json.result.type ?? null,
    };
  }

  private reactionEmoji(kind: ReactionKind): string {
    switch (kind) {
      case "like":
        return "👍";
      case "dislike":
        return "👎";
      case "love":
        return "❤";
      case "haha":
        return "😂";
      case "wow":
        return "😮";
      case "sad":
        return "😢";
      case "angry":
        return "😡";
      case "care":
        return "🤗";
      default:
        return "👍";
    }
  }

  /**
   * Replies to one of this account's messages.
   *
   * The bot's update queue is shared by every chat (and so every tenant) the
   * bot serves, and reading it with an offset destroys what was read. So this
   * drains the queue into a per-chat store first (see telegram-replies.ts) and
   * then answers from the store, scoped to THIS account's chat: message ids are
   * only unique within a chat, so the chat id is part of the match.
   *
   * `cursor` is a position in this post's stored replies, not a Telegram offset.
   */
  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    const chatId = this.resolveChatId(options.additionalOptions);
    if (!chatId) {
      return { success: false, error: MISSING_CHAT_ERROR };
    }

    const postMessageId = Number(options.platformPostId);
    if (!Number.isInteger(postMessageId)) {
      return { success: false, error: "platformPostId must be a Telegram message id" };
    }

    const drained = await this.drainUpdates(accessToken);
    if (!drained.ok) {
      return { success: false, error: drained.error, rawResponse: drained.raw };
    }

    const skip = options.cursor && /^\d+$/.test(options.cursor) ? Number(options.cursor) : 0;
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    // One extra row tells us whether there is a next page without a count query.
    const rows = await this.replyStore.listReplies(chatId, postMessageId, {
      skip,
      take: limit + 1,
    });
    const page = rows.slice(0, limit);

    const items: SocialComment[] = page.map((reply) => ({
      id: String(reply.messageId),
      platform: this.platform,
      platformPostId: options.platformPostId,
      authorId: reply.authorId ?? "unknown",
      authorName: reply.authorName ?? "unknown",
      text: reply.text,
      createdAt: reply.sentAt,
      parentCommentId: String(postMessageId),
      canReply: true,
      canReact: true,
      canDelete: true,
    }));

    return {
      success: true,
      items,
      nextCursor: rows.length > limit ? String(skip + limit) : null,
      rawResponse: { drainedUpdates: drained.drained },
    };
  }

  /**
   * Move everything waiting on the bot's queue into the reply store.
   *
   * Ordering is the safety property: replies are written BEFORE the offset that
   * confirms them is stored, and Telegram only forgets an update once a later
   * call passes an offset above it. A crash between the two re-reads the same
   * batch next time, which the store absorbs by update id. Bounded, so a large
   * backlog cannot hold a request open; the next read continues from the cursor.
   */
  private async drainUpdates(
    accessToken: string,
  ): Promise<{ ok: true; drained: number } | { ok: false; error: string; raw?: unknown }> {
    const botId = botIdFromToken(accessToken);
    let drained = 0;

    for (let batch = 0; batch < MAX_DRAIN_BATCHES; batch += 1) {
      const offset = await this.replyStore.getOffset(botId);

      const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(offset !== null ? { offset } : {}),
          limit: UPDATES_PER_BATCH,
          timeout: 0,
          allowed_updates: ["message"],
        }),
      });

      const json = (await res.json().catch(() => ({ ok: false }))) as {
        ok: boolean;
        description?: string;
        result?: TelegramUpdate[];
      };

      if (!json.ok || !json.result) {
        return {
          ok: false,
          error: `Telegram getUpdates failed: ${json.description ?? res.status}`,
          raw: { ok: json.ok, description: json.description },
        };
      }

      if (json.result.length === 0) break;

      const replies: StoredTelegramReply[] = [];
      let next = offset ?? 0;
      for (const update of json.result) {
        next = Math.max(next, update.update_id + 1);
        const message = update.message;
        const parentId = message?.reply_to_message?.message_id;
        if (!message?.text || parentId === undefined || message.chat?.id === undefined) continue;
        replies.push({
          updateId: update.update_id,
          chatId: String(message.chat.id),
          messageId: message.message_id,
          replyToMessageId: parentId,
          authorId: message.from ? String(message.from.id) : null,
          authorName: message.from?.first_name ?? message.from?.username ?? null,
          text: message.text,
          sentAt: new Date(message.date * 1000),
        });
      }

      await this.replyStore.saveReplies(replies);
      await this.replyStore.advanceOffset(botId, next);
      drained += json.result.length;

      if (json.result.length < UPDATES_PER_BATCH) break;
    }

    return { ok: true, drained };
  }

  async createComment(
    accessToken: string,
    options: WriteCommentOptions,
  ): Promise<EngagementResult> {
    return this.replyToComment(accessToken, {
      commentId: options.platformPostId,
      text: options.text,
      platformPostId: options.platformPostId,
      additionalOptions: options.additionalOptions,
    });
  }

  async replyToComment(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    const chatId = this.resolveChatId(options.additionalOptions);
    if (!chatId) {
      return { success: false, error: MISSING_CHAT_ERROR };
    }

    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: options.text,
        reply_to_message_id: Number(options.commentId),
      }),
    });

    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { message_id: number };
    };

    if (!json.ok || !json.result) {
      return {
        success: false,
        error: `Telegram sendMessage failed: ${json.description ?? res.status}`,
        rawResponse: json,
      };
    }

    return { success: true, commentId: String(json.result.message_id), rawResponse: json };
  }

  async deleteComment(
    accessToken: string,
    options: DeleteCommentOptions,
  ): Promise<EngagementResult> {
    const chatId = this.resolveChatId(options.additionalOptions);
    if (!chatId) {
      return { success: false, error: MISSING_CHAT_ERROR };
    }

    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: Number(options.commentId),
      }),
    });

    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      return {
        success: false,
        error: `Telegram deleteMessage failed: ${json.description ?? res.status}`,
        rawResponse: json,
      };
    }

    return { success: true, rawResponse: json };
  }

  private async setReaction(
    accessToken: string,
    messageId: string,
    kind: ReactionKind | null,
    additionalOptions?: Record<string, unknown>,
  ): Promise<EngagementResult> {
    const chatId = this.resolveChatId(additionalOptions);
    if (!chatId) {
      return { success: false, error: MISSING_CHAT_ERROR };
    }

    const reaction =
      kind === null
        ? []
        : [{ type: "emoji", emoji: this.reactionEmoji(kind) }];

    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/setMessageReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: Number(messageId),
        reaction,
      }),
    });

    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      return {
        success: false,
        error: `Telegram setMessageReaction failed: ${json.description ?? res.status}`,
        rawResponse: json,
      };
    }

    return { success: true, rawResponse: json };
  }

  async reactToPost(
    accessToken: string,
    options: ReactToPostOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(
      accessToken,
      options.platformPostId,
      options.kind,
      options.additionalOptions,
    );
  }

  async unreactToPost(
    accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(
      accessToken,
      options.platformPostId,
      null,
      options.additionalOptions,
    );
  }

  async reactToComment(
    accessToken: string,
    options: ReactToCommentOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(
      accessToken,
      options.commentId,
      options.kind,
      options.additionalOptions,
    );
  }

  async unreactToComment(
    accessToken: string,
    options: UnreactToCommentOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(
      accessToken,
      options.commentId,
      null,
      options.additionalOptions,
    );
  }
}

export const telegramAdapter = new TelegramAdapter();
