import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { telegramAdapter } from "@/lib/adapters/telegram";
import { resolveSessionUser, safeRedirectCode, sessionProblemRedirect } from "@/lib/social/session-user";

/**
 * Token-based connector handshake for Telegram.
 *
 * Telegram has no OAuth redirect, so "connecting" means: read the bot token and
 * target chat from the environment, verify the token against the Telegram API,
 * and store the account with the encrypted bot token. Same result as an OAuth
 * callback (a row in SocialAccount), reached through the platform's own flow.
 */
export async function GET(req: NextRequest) {
  try {
    // Signed in *and* present in this database: a session from another checkout
    // (same host, different port, same NEXTAUTH_SECRET) must not reach the write.
    const user = await resolveSessionUser();
    if (!user.ok) {
      const redirect = sessionProblemRedirect(user.code);
      console.error("Telegram connect rejected:", user.code);
      return NextResponse.redirect(new URL(redirect.path, req.url));
    }

    const validation = telegramAdapter.validateCredentials();
    if (!validation.valid) {
      return NextResponse.redirect(
        new URL(
          `/settings/accounts?error=telegram_not_configured&missing=${validation.missing.join(",")}`,
          req.url
        )
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN as string;
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    const info = await telegramAdapter.getAccountInfo(token);
    const encrypted = encryptTokens({ accessToken: token, refreshToken: null });

    const account = await prisma.socialAccount.upsert({
      where: {
        platform_platformUserId: {
          platform: Platform.TELEGRAM,
          platformUserId: info.platformUserId,
        },
      },
      create: {
        userId: user.userId,
        platform: Platform.TELEGRAM,
        platformUserId: info.platformUserId,
        platformUsername: info.platformUsername,
        displayName: info.displayName,
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        isActive: true,
        metadata: { chatId, tokenType: "bot", isBot: true },
      },
      update: {
        userId: user.userId,
        platformUsername: info.platformUsername,
        displayName: info.displayName,
        accessToken: encrypted.accessToken,
        isActive: true,
        metadata: { chatId, tokenType: "bot", isBot: true },
      },
    });

    return NextResponse.redirect(
      new URL(
        `/settings/accounts?success=telegram_connected&account=${account.id}&chat=${encodeURIComponent(chatId)}`,
        req.url
      )
    );
  } catch (error) {
    console.error("Telegram connect error:", error);
    // Never put the raw error in the URL: it can carry connection strings,
    // token fragments and stack traces into history, logs and screenshots.
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${safeRedirectCode(error, "telegram_connect_failed")}`, req.url)
    );
  }
}
