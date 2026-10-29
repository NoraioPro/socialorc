import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { telegramAdapter } from "@/lib/adapters/telegram";
import {
  isValidTelegramBotTokenShape,
  isValidTelegramChatIdShape,
} from "@/lib/adapters/credentials";
import { telegramAccountId } from "@/lib/adapters/telegram-connect-code";
import { verifyTelegramDestination } from "@/lib/adapters/telegram-destination";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { readTelegramState, stateCookieName } from "@/lib/social/telegram-connect";

/**
 * Connecting a Telegram chat with the customer's OWN bot.
 *
 * Telegram has no OAuth. Each customer creates a bot with @BotFather and gives
 * SocialOrc its token and the chat the bot should publish to. Nothing is shared:
 * the token is validated against Telegram, encrypted onto the customer's own
 * account row, and used for both immediate and scheduled publishing of that
 * account's posts. No deployment-wide bot token is read anywhere.
 *
 *   GET  ?state=…                  no write; sends the browser to the settings
 *                                  page's connect dialog.
 *   POST { state, botToken, chat } validates the token (getMe), resolves the chat
 *                                  (a numeric id, or @username for a public
 *                                  channel or supergroup), checks the bot can
 *                                  actually post there, then stores the account
 *                                  (`<botId>:<chatId>`). The token is never
 *                                  returned or logged.
 *
 * The POST requires the signed state cookie for this session and TELEGRAM, the
 * same proof every other connect uses. Possession of a bot's token is the proof
 * of control: the bot can only post where its owner has put it.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state") ?? "";
  const target = new URL("/settings/accounts", req.url);
  target.searchParams.set("tab", "integrations");
  if (/^[a-f0-9]{64}$/.test(state)) target.searchParams.set("telegram_state", state);
  else target.searchParams.set("error", "telegram_connect_not_verified");
  return NextResponse.redirect(target);
}

function fail(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => null)) as
    | { state?: unknown; botToken?: unknown; chat?: unknown }
    | null;

  const state = readTelegramState(req, body?.state, guard.userId);
  if (!state.ok) {
    return fail(400, "STATE_INVALID", "This connection request has expired. Start connecting Telegram again.");
  }

  const token = typeof body?.botToken === "string" ? body.botToken.trim() : "";
  if (!isValidTelegramBotTokenShape(token)) {
    return fail(400, "TOKEN_INVALID", "That does not look like a bot token. Copy the whole token from @BotFather.");
  }

  const chatArg = typeof body?.chat === "string" ? body.chat.trim() : "";
  const isChannelHandle = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chatArg);
  if (!isValidTelegramChatIdShape(chatArg) && !isChannelHandle) {
    return fail(400, "CHAT_INVALID", "Enter the chat id (for example -1001234567890) or the @username of a public channel.");
  }

  try {
    let info;
    try {
      info = await telegramAdapter.getAccountInfo(token);
    } catch {
      return fail(400, "TOKEN_REJECTED", "Telegram rejected that bot token. Check it with @BotFather and try again.");
    }

    const chat = await telegramAdapter.getChat(token, chatArg);
    if (!chat.ok) {
      console.error("Telegram connect refused: chat unreachable -", chat.error);
      return fail(
        409,
        "CHAT_UNREACHABLE",
        "Your bot cannot reach that chat. Open a private chat with the bot and send /start, or add the bot to the group or channel, then try again.",
      );
    }
    const chatId = chat.id;
    if (chatId === info.platformUserId) {
      return fail(400, "CHAT_INVALID", "That is the bot's own id, not a chat. Use your own chat id or a group or channel id.");
    }

    // The bot must be able to post where it is being connected (a channel needs
    // an admin bot with the post permission), so a wrong setup fails here with
    // a reason instead of at publish time. Not being able to ask counts as a
    // refusal: this is the one moment the connection is vetted.
    const verdict = await verifyTelegramDestination(
      { chatId, chatType: chat.type, botId: info.platformUserId, connectedBy: null },
      (userId) => telegramAdapter.lookupMember(token, chatId, userId),
    );
    if (verdict.ok !== true) {
      return fail(
        409,
        "BOT_CANNOT_POST",
        verdict.ok === false
          ? verdict.reason
          : "Could not check your bot's permissions in that chat right now. Try again.",
      );
    }

    const platformUserId = telegramAccountId(info.platformUserId, chatId);

    const existing = await prisma.socialAccount.findUnique({
      where: { platform_platformUserId: { platform: Platform.TELEGRAM, platformUserId } },
      select: { id: true, workspaceId: true },
    });
    if (existing && existing.workspaceId !== guard.workspaceId) {
      return fail(409, "ACCOUNT_OWNED_ELSEWHERE", "That bot and chat are already connected by another workspace.");
    }

    const brain = await resolveBrainForWorkspace(guard, state.data.brainId ?? null);
    const encrypted = encryptTokens({ accessToken: token, refreshToken: null });
    // `tokenSource: "own"` marks a customer's own bot. Connections made before
    // this existed carry no such marker and are the shared-bot ones.
    const metadata = {
      chatId,
      chatType: chat.type,
      chatTitle: chat.title,
      tokenType: "bot",
      isBot: true,
      botId: info.platformUserId,
      tokenSource: "own",
    };
    const displayName = chat.title ?? info.displayName;

    const account = await prisma.socialAccount.upsert({
      where: { platform_platformUserId: { platform: Platform.TELEGRAM, platformUserId } },
      create: {
        workspaceId: guard.workspaceId,
        userId: guard.userId,
        brainId: brain.id,
        platform: Platform.TELEGRAM,
        platformUserId,
        platformUsername: info.platformUsername,
        displayName,
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        isActive: true,
        metadata,
      },
      update: {
        // Ownership is set on create and never rewritten by a later connect.
        brainId: brain.id,
        platformUsername: info.platformUsername,
        displayName,
        accessToken: encrypted.accessToken,
        isActive: true,
        needsReconnect: false,
        lastError: null,
        metadata,
      },
    });

    const response = NextResponse.json({
      success: true,
      accountId: account.id,
      chatId,
      chatTitle: chat.title,
      botUsername: info.platformUsername ?? null,
      brainId: brain.id,
    });
    response.cookies.delete(stateCookieName(state.state));
    return response;
  } catch (error) {
    console.error("Telegram connect error:", error instanceof Error ? error.message : error);
    // Never the raw error: it can carry the bot token inside a request URL.
    return fail(502, "TELEGRAM_CONNECT_FAILED", "Could not connect Telegram. Try again.");
  }
}

export const dynamic = "force-dynamic";
