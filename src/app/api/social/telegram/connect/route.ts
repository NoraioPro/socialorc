import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { telegramAdapter } from "@/lib/adapters/telegram";
import { resolveSessionUser, safeRedirectCode, sessionProblemRedirect } from "@/lib/social/session-user";
import { resolveBrainForUser } from "@/lib/brains";
import { requirePermission } from "@/lib/auth";

/**
 * Token-based connector handshake for Telegram.
 *
 * Telegram has no OAuth redirect, so "connecting" means: read the bot token and
 * target chat from the environment, verify the token against the Telegram API,
 * and store the account with the encrypted bot token. Same result as an OAuth
 * callback (a row in SocialAccount), reached through the platform's own flow.
 */
export async function GET(req: NextRequest) {
  // The generic /api/social/connect route parks the chosen brain (and whether
  // this is a popup-window connect) in the same oauth_state_<state> cookie
  // every connector reads, Telegram included — even though it has no OAuth
  // exchange of its own to protect with `state`.
  const { searchParams } = new URL(req.url);
  const rawState = searchParams.get("state");
  const stateCookie = rawState ? req.cookies.get(`oauth_state_${rawState}`) : undefined;
  let requestedBrainId: string | null = null;
  let popup = false;
  if (stateCookie) {
    try {
      const parsed = JSON.parse(stateCookie.value);
      requestedBrainId = parsed?.brainId ?? null;
      popup = Boolean(parsed?.popup);
    } catch {
      // Malformed cookie: fall back to the user's default brain below.
    }
  }
  const popupSuffix = popup ? "&popup=1" : "";

  try {
    // Signed in *and* present in this database: a session from another checkout
    // (same host, different port, same NEXTAUTH_SECRET) must not reach the write.
    const user = await resolveSessionUser();
    if (!user.ok) {
      const redirect = sessionProblemRedirect(user.code);
      console.error("Telegram connect rejected:", user.code);
      return NextResponse.redirect(new URL(redirect.path, req.url));
    }

    // Connecting is a write path that ends in a stored credential, gated by the
    // same permission as every other connector.
    const permission = await requirePermission("accounts:connect");
    if (!permission.ok) {
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=not_allowed${popupSuffix}`, req.url)
      );
    }

    const validation = telegramAdapter.validateCredentials();
    if (!validation.valid) {
      return NextResponse.redirect(
        new URL(
          `/settings/accounts?error=telegram_not_configured&missing=${validation.missing.join(",")}${popupSuffix}`,
          req.url
        )
      );
    }

    const token = process.env.TELEGRAM_BOT_TOKEN as string;
    const chatId = process.env.TELEGRAM_CHAT_ID as string;

    const brain = await resolveBrainForUser(user.userId, requestedBrainId);

    const info = await telegramAdapter.getAccountInfo(token);
    const encrypted = encryptTokens({ accessToken: token, refreshToken: null });

    // Same takeover rule as the shared OAuth callback: an existing connection
    // belongs to whoever made it. Telegram is the sharpest case, because every
    // tenant resolves the *same* bot from env today, so the row collides with no
    // credentials required at all.
    const existingAccount = await prisma.socialAccount.findUnique({
      where: {
        platform_platformUserId: {
          platform: Platform.TELEGRAM,
          platformUserId: info.platformUserId,
        },
      },
      select: { id: true, userId: true },
    });

    if (existingAccount && existingAccount.userId !== user.userId) {
      console.error("Telegram connect refused: bot already connected by another user");
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=account_owned_elsewhere${popupSuffix}`, req.url)
      );
    }

    const account = await prisma.socialAccount.upsert({
      where: {
        platform_platformUserId: {
          platform: Platform.TELEGRAM,
          platformUserId: info.platformUserId,
        },
      },
      create: {
        userId: user.userId,
        brainId: brain.id,
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
        // Ownership is set on create and never rewritten by a later connect.
        brainId: brain.id,
        platformUsername: info.platformUsername,
        displayName: info.displayName,
        accessToken: encrypted.accessToken,
        isActive: true,
        metadata: { chatId, tokenType: "bot", isBot: true },
      },
    });

    return NextResponse.redirect(
      new URL(
        `/settings/accounts?success=telegram_connected&account=${account.id}&chat=${encodeURIComponent(chatId)}&brain=${brain.id}${popupSuffix}`,
        req.url
      )
    );
  } catch (error) {
    console.error("Telegram connect error:", error);
    // Never put the raw error in the URL: it can carry connection strings,
    // token fragments and stack traces into history, logs and screenshots.
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${safeRedirectCode(error, "telegram_connect_failed")}${popupSuffix}`, req.url)
    );
  }
}
