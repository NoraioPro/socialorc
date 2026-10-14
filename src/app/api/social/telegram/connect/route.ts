import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { telegramAdapter } from "@/lib/adapters/telegram";
import { isValidTelegramChatIdShape } from "@/lib/adapters/credentials";
import { resolveSessionUser, safeRedirectCode, sessionProblemRedirect } from "@/lib/social/session-user";
import { peekStateCookie } from "@/lib/oauth/state";
import { oauthStateSecret } from "@/lib/oauth/state-secret";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { requireWorkspace } from "@/lib/tenancy/guard";

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
  const stateCookieValue = rawState
    ? req.cookies.get(`oauth_state_${rawState}`)?.value
    : undefined;

  // Declared out here because the catch block needs it, so a failed popup still
  // knows to close itself.
  let popupSuffix = "";

  try {
    // Signed and verified: an unsigned or edited cookie is simply not a cookie.
    // The generic /api/social/connect route parks the chosen brain (and whether
    // this is a popup-window connect) in the same oauth_state_<state> cookie
    // every connector reads, Telegram included, even though it has no OAuth
    // exchange of its own to protect with `state`.
    const stateData = peekStateCookie(stateCookieValue, oauthStateSecret());
    const requestedBrainId = stateData.brainId ?? null;
    popupSuffix = stateData.popup ? "&popup=1" : "";
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
    const permission = await requireWorkspace("accounts:connect");
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

    // The chat belongs to the ACCOUNT, not to the deployment. Env only supplies
    // the default offered here; a tenant that brings its own chat passes it in.
    // This is the fix for the cross-tenant bug where every post landed in the
    // owner's private chat because the destination came from the environment.
    const requestedChat = searchParams.get("chatId")?.trim() ?? "";

    // A chat id from the query string is the part an attacker controls, and this
    // endpoint is a GET a victim can be made to open. Without this check somebody
    // else's account could be pointed at the attacker's chat and that tenant's
    // posts would land there. The state cookie is minted and signed by
    // /api/social/connect for the signed-in user, so requiring it — and requiring
    // it to belong to *this* session — is what makes the request the user's own.
    if (requestedChat !== "") {
      const stateData = peekStateCookie(stateCookieValue, oauthStateSecret());
      if (stateData.userId !== user.userId) {
        console.error(
          "Telegram connect refused: chat id supplied without this session's state cookie"
        );
        return NextResponse.redirect(
          new URL(`/settings/accounts?error=telegram_connect_not_verified${popupSuffix}`, req.url)
        );
      }
    }

    const chatId = requestedChat !== "" ? requestedChat : (process.env.TELEGRAM_CHAT_ID ?? "").trim();

    if (!chatId) {
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=telegram_chat_required${popupSuffix}`, req.url)
      );
    }

    if (!isValidTelegramChatIdShape(chatId)) {
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=telegram_chat_invalid${popupSuffix}`, req.url)
      );
    }

    const brain = await resolveBrainForWorkspace(permission, requestedBrainId);

    const info = await telegramAdapter.getAccountInfo(token);

    // Refuse a chat the bot cannot reach NOW, with Telegram's own reason, rather
    // than discovering it at the first publish hours later.
    const chat = await telegramAdapter.getChat(token, chatId);
    if (!chat.ok) {
      console.error("Telegram connect refused: chat unreachable —", chat.error);
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=telegram_chat_unreachable${popupSuffix}`, req.url)
      );
    }
    const encrypted = encryptTokens({ accessToken: token, refreshToken: null });

    // Same takeover rule as the shared OAuth callback: an existing connection
    // belongs to the workspace that made it; a teammate may reconnect it. Telegram is the sharpest case, because every
    // tenant resolves the *same* bot from env today, so the row collides with no
    // credentials required at all.
    const existingAccount = await prisma.socialAccount.findUnique({
      where: {
        platform_platformUserId: {
          platform: Platform.TELEGRAM,
          platformUserId: info.platformUserId,
        },
      },
      select: { id: true, workspaceId: true },
    });

    if (existingAccount && existingAccount.workspaceId !== permission.workspaceId) {
      console.error("Telegram connect refused: bot already connected by another workspace");
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
        workspaceId: permission.workspaceId,
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
