import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { telegramAdapter } from "@/lib/adapters/telegram";
import { isValidTelegramChatIdShape } from "@/lib/adapters/credentials";
import { hashConnectCode, isConnectCodeShape, telegramAccountId } from "@/lib/adapters/telegram-connect-code";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { requireWorkspace } from "@/lib/tenancy/guard";
import {
  TELEGRAM_ADMIN_STATUSES,
  readTelegramState,
  requiresAdminProof,
  stateCookieName,
} from "@/lib/social/telegram-connect";

/**
 * Connecting a Telegram chat.
 *
 * Telegram has no OAuth, so this used to be a GET that stored whatever chat
 * the query string (or, failing that, TELEGRAM_CHAT_ID) named — nothing proved
 * the user controlled the chat, the env fallback ran without the state cookie,
 * and the account was keyed by the bot id, so the first workspace to connect
 * owned the deployment's Telegram. Now:
 *
 *   GET  ?state=…            → no write; sends the browser to the settings
 *                               page's chat-verification dialog.
 *   POST /code { state }     → a one-time code, bound to this user+workspace.
 *   POST { state, code, chatId? }
 *                            → the code must have been posted in a chat the bot
 *                               can see (read from the bot's own drained update
 *                               queue, scoped per chat, so no tenant's updates
 *                               are consumed). That chat — and only that chat —
 *                               is connected, as its own account
 *                               (`<botId>:<chatId>`). In groups, the poster must
 *                               administer the chat.
 *
 * Both POSTs require the signed state cookie for this session on every path.
 * TELEGRAM_CHAT_ID is only ever a UI prefill.
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
    | { state?: unknown; code?: unknown; chatId?: unknown }
    | null;

  const state = readTelegramState(req, body?.state, guard.userId);
  if (!state.ok) {
    return fail(400, "STATE_INVALID", "This connection request has expired. Start connecting Telegram again.");
  }

  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!isConnectCodeShape(code)) return fail(400, "CODE_INVALID", "That is not a connect code.");

  const requestedChat = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  if (requestedChat !== "" && !isValidTelegramChatIdShape(requestedChat)) {
    return fail(400, "CHAT_INVALID", "That chat id is not valid.");
  }

  const validation = telegramAdapter.validateCredentials();
  if (!validation.valid) return fail(503, "NOT_CONFIGURED", "Telegram is not configured on this deployment.");
  const token = process.env.TELEGRAM_BOT_TOKEN as string;

  try {
    const codeHash = hashConnectCode(code);
    const live = { codeHash, userId: guard.userId, workspaceId: guard.workspaceId, usedAt: null, expiresAt: { gt: new Date() } };

    let row = await prisma.telegramConnectCode.findFirst({ where: live });
    if (!row) return fail(410, "CODE_EXPIRED", "This code has expired or was already used. Get a new one.");

    if (!row.seenAt) {
      // Read the bot's queue into the per-chat store; the drain records where
      // pending codes were posted without consuming any other tenant's updates.
      const drained = await telegramAdapter.drainUpdates(token);
      if (!drained.ok) {
        console.error("Telegram connect: update drain failed:", drained.error);
        return fail(502, "TELEGRAM_UNREACHABLE", "Could not read the bot's messages from Telegram. Try again.");
      }
      row = await prisma.telegramConnectCode.findFirst({ where: live });
      if (!row) return fail(410, "CODE_EXPIRED", "This code has expired or was already used. Get a new one.");
    }

    if (!row.seenAt || !row.chatId) {
      return fail(
        409,
        "CODE_NOT_SEEN",
        "The bot has not seen the code in any chat yet. Post it in the chat (the bot must be a member, or an admin of a channel) and try again.",
      );
    }

    const chatId = row.chatId;
    if (requestedChat !== "" && requestedChat !== chatId) {
      return fail(409, "CHAT_MISMATCH", "The code was posted in a different chat from the one you entered.");
    }

    // In a group anybody can post; whoever posted the code must run the chat.
    if (requiresAdminProof(row.chatType)) {
      if (!row.authorId) return fail(403, "NOT_CHAT_ADMIN", "Post the code yourself, as an admin of the group.");
      const member = await telegramAdapter.getChatMemberStatus(token, chatId, row.authorId);
      if (!member.ok || !TELEGRAM_ADMIN_STATUSES.has(member.status)) {
        return fail(403, "NOT_CHAT_ADMIN", "Only an admin of the group can connect it. Post the code as an admin.");
      }
    }

    const chat = await telegramAdapter.getChat(token, chatId);
    if (!chat.ok) {
      console.error("Telegram connect refused: chat unreachable -", chat.error);
      return fail(409, "CHAT_UNREACHABLE", "The bot cannot reach that chat. Add it to the chat and try again.");
    }

    const info = await telegramAdapter.getAccountInfo(token);
    const platformUserId = telegramAccountId(info.platformUserId, chatId);

    const existing = await prisma.socialAccount.findUnique({
      where: { platform_platformUserId: { platform: Platform.TELEGRAM, platformUserId } },
      select: { id: true, workspaceId: true },
    });
    if (existing && existing.workspaceId !== guard.workspaceId) {
      return fail(409, "ACCOUNT_OWNED_ELSEWHERE", "That chat is already connected by another workspace.");
    }

    // Single use, claimed atomically before anything is stored.
    const claimed = await prisma.telegramConnectCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return fail(410, "CODE_EXPIRED", "This code was already used. Get a new one.");

    const brain = await resolveBrainForWorkspace(guard, state.data.brainId ?? null);
    const encrypted = encryptTokens({ accessToken: token, refreshToken: null });
    const metadata = { chatId, chatType: row.chatType, chatTitle: chat.title, tokenType: "bot", isBot: true, botId: info.platformUserId };
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
