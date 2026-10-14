import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { telegramAdapter } from "@/lib/adapters/telegram";
import {
  CONNECT_CODE_TTL_MS,
  generateConnectCode,
  hashConnectCode,
} from "@/lib/adapters/telegram-connect-code";
import { readTelegramState } from "@/lib/social/telegram-connect";

/**
 * Step 1 of connecting a Telegram chat: issue a one-time code.
 *
 * POST { state } → { code, botUsername, expiresAt, links, suggestedChatId }
 *
 * The code is stored hashed, bound to this user in this workspace, and only
 * proves anything once it has been posted in the chat (see the verify step,
 * POST /api/social/telegram/connect). `suggestedChatId` is the deployment's
 * TELEGRAM_CHAT_ID, offered as a UI prefill only — it is never connected
 * without the same proof.
 */
export async function POST(req: NextRequest) {
  const guard = await requireWorkspace("accounts:connect");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = (await req.json().catch(() => null)) as { state?: unknown } | null;
  const state = readTelegramState(req, body?.state, guard.userId);
  if (!state.ok) {
    return NextResponse.json(
      { error: "This connection request has expired. Start connecting Telegram again.", code: "STATE_INVALID" },
      { status: 400 },
    );
  }

  const validation = telegramAdapter.validateCredentials();
  if (!validation.valid) {
    return NextResponse.json({ error: "Telegram is not configured on this deployment.", code: "NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN as string;
    const bot = await telegramAdapter.getAccountInfo(token);

    const now = Date.now();
    // Housekeeping: codes are worthless after expiry; keep a day for forensics.
    await prisma.telegramConnectCode.deleteMany({ where: { expiresAt: { lt: new Date(now - 86_400_000) } } });

    const code = generateConnectCode();
    const expiresAt = new Date(now + CONNECT_CODE_TTL_MS);
    await prisma.telegramConnectCode.create({
      data: {
        codeHash: hashConnectCode(code),
        userId: guard.userId,
        workspaceId: guard.workspaceId,
        expiresAt,
      },
    });

    const username = bot.platformUsername ?? null;
    return NextResponse.json({
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername: username,
      links: username
        ? {
            // Private chat with the bot: Telegram sends `/start <code>` for the user.
            privateChat: `https://t.me/${username}?start=${code}`,
            // Pick a group, add the bot, and Telegram sends `/start@bot <code>` there.
            group: `https://t.me/${username}?startgroup=${code}`,
          }
        : null,
      suggestedChatId: (process.env.TELEGRAM_CHAT_ID ?? "").trim() || null,
    });
  } catch (error) {
    console.error("Telegram connect code failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not reach Telegram. Try again." }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
