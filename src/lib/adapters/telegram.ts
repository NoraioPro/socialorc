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

const TELEGRAM_API = process.env.TELEGRAM_API_BASE?.replace(/\/$/, "") || "https://api.telegram.org";

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

  validateCredentials(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!process.env.TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
    if (!process.env.TELEGRAM_CHAT_ID) missing.push("TELEGRAM_CHAT_ID");
    return { valid: missing.length === 0, missing };
  }

  /** No OAuth: the "authorize" step is a local confirm-and-store route. */
  getOAuthUrl(state: string): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/api/social/telegram/connect?state=${state}&platform=TELEGRAM`;
  }

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
    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const chatId =
      (options.additionalOptions?.chatId as string | undefined) ||
      process.env.TELEGRAM_CHAT_ID;

    if (!chatId) {
      return {
        success: false,
        error: "No target chat configured (TELEGRAM_CHAT_ID missing)",
      };
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

  private resolveChatId(): string | null {
    return process.env.TELEGRAM_CHAT_ID ?? null;
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

  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    const chatId = this.resolveChatId();
    if (!chatId) {
      return { success: false, error: "No target chat configured (TELEGRAM_CHAT_ID missing)" };
    }

    const postMessageId = Number(options.platformPostId);
    if (!Number.isFinite(postMessageId)) {
      return { success: false, error: "platformPostId must be a Telegram message id" };
    }

    const offset = options.cursor ? Number(options.cursor) : undefined;
    const limit = options.limit ?? 50;

    const res = await fetch(`${TELEGRAM_API}/bot${accessToken}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offset: offset && offset > 0 ? offset : undefined,
        limit: Math.min(limit, 100),
        allowed_updates: ["message"],
      }),
    });

    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: Array<{
        update_id: number;
        message?: {
          message_id: number;
          date: number;
          text?: string;
          from?: { id: number; first_name?: string; username?: string };
          reply_to_message?: { message_id: number };
        };
      }>;
    };

    if (!json.ok || !json.result) {
      return {
        success: false,
        error: `Telegram getUpdates failed: ${json.description ?? res.status}`,
        rawResponse: json,
      };
    }

    const replies: SocialComment[] = [];
    let maxUpdateId = offset ?? 0;

    for (const update of json.result) {
      maxUpdateId = Math.max(maxUpdateId, update.update_id + 1);
      const message = update.message;
      if (!message?.text) continue;
      const parentId = message.reply_to_message?.message_id;
      if (parentId !== postMessageId) continue;

      const author = message.from;
      replies.push({
        id: String(message.message_id),
        platform: this.platform,
        platformPostId: options.platformPostId,
        authorId: author ? String(author.id) : "unknown",
        authorName: author?.first_name ?? author?.username ?? "unknown",
        text: message.text,
        createdAt: new Date(message.date * 1000),
        parentCommentId: String(postMessageId),
        canReply: true,
        canReact: true,
        canDelete: true,
        raw: message,
      });
    }

    const pageStart = offset ?? 0;
    const page = replies.slice(pageStart, pageStart + limit);
    const nextCursor = pageStart + limit < replies.length ? String(pageStart + limit) : null;

    return {
      success: true,
      items: page,
      nextCursor,
      rawResponse: { updates: json.result, nextUpdateOffset: maxUpdateId },
    };
  }

  async createComment(
    accessToken: string,
    options: WriteCommentOptions,
  ): Promise<EngagementResult> {
    return this.replyToComment(accessToken, {
      commentId: options.platformPostId,
      text: options.text,
      platformPostId: options.platformPostId,
    });
  }

  async replyToComment(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    const chatId = this.resolveChatId();
    if (!chatId) {
      return { success: false, error: "No target chat configured (TELEGRAM_CHAT_ID missing)" };
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
    const chatId = this.resolveChatId();
    if (!chatId) {
      return { success: false, error: "No target chat configured (TELEGRAM_CHAT_ID missing)" };
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
  ): Promise<EngagementResult> {
    const chatId = this.resolveChatId();
    if (!chatId) {
      return { success: false, error: "No target chat configured (TELEGRAM_CHAT_ID missing)" };
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
    return this.setReaction(accessToken, options.platformPostId, options.kind);
  }

  async unreactToPost(
    accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(accessToken, options.platformPostId, null);
  }

  async reactToComment(
    accessToken: string,
    options: ReactToCommentOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(accessToken, options.commentId, options.kind);
  }

  async unreactToComment(
    accessToken: string,
    options: UnreactToCommentOptions,
  ): Promise<EngagementResult> {
    return this.setReaction(accessToken, options.commentId, null);
  }
}

export const telegramAdapter = new TelegramAdapter();
