import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  validateTelegramCredentials,
  type CredentialValidationResult,
} from "./credentials";

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
}

export const telegramAdapter = new TelegramAdapter();
