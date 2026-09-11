import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getAdapter } from "@/lib/adapters";
import { encryptTokens } from "@/lib/encryption";
import { splitState, validateOAuthState } from "@/lib/oauth/state";

/**
 * One OAuth callback, shared by every redirect-based connector.
 *
 * Before this existed only LinkedIn had a callback route, so the other five
 * OAuth platforms could start a connection and never finish it. All of them have
 * the same shape: the provider returns `code` + `state`, the state cookie
 * identifies the session, tokens are exchanged, the account is stored encrypted.
 *
 * Anything provider-specific stays in the adapter (`exchangeCodeForTokens`
 * accepts an optional PKCE verifier; adapters that do not use one ignore it).
 */
export function createOAuthCallback(platform: Platform) {
  return async function GET(req: NextRequest) {
    const failure = (reason: string) =>
      NextResponse.redirect(new URL(`/settings/accounts?error=${encodeURIComponent(reason)}`, req.url));

    try {
      const session = await getAuthSession();
      if (!session?.user?.id) {
        return NextResponse.redirect(new URL("/login?error=unauthorized", req.url));
      }

      const { searchParams } = new URL(req.url);
      const code = searchParams.get("code");
      const rawState = searchParams.get("state");
      const providerError = searchParams.get("error");
      const providerErrorDescription = searchParams.get("error_description");

      // The user (or the provider) declined: surface the provider's own reason.
      if (providerError) {
        console.error(`${platform} OAuth error:`, providerError, providerErrorDescription);
        return failure(providerErrorDescription || providerError);
      }

      if (!code || !rawState) return failure("missing_params");

      const { baseState, verifier } = splitState(rawState);

      const stateCheck = validateOAuthState(req.cookies.get(`oauth_state_${baseState}`)?.value, {
        userId: session.user.id,
        platform,
      });
      if (!stateCheck.ok) {
        console.error(`${platform} OAuth state rejected:`, stateCheck.reason);
        return failure(
          stateCheck.reason === "expired"
            ? "state_expired"
            : stateCheck.reason === "user_mismatch" || stateCheck.reason === "platform_mismatch"
              ? "state_mismatch"
              : "invalid_state",
        );
      }

      const adapter = getAdapter(platform);
      const tokens = await adapter.exchangeCodeForTokens(code, verifier ?? undefined);
      const info = await adapter.getAccountInfo(tokens.accessToken);
      const encrypted = encryptTokens(tokens);

      const shared = {
        userId: session.user.id,
        platformUserId: info.platformUserId,
        platformUsername: info.platformUsername,
        displayName: info.displayName,
        profileImageUrl: info.profileImageUrl,
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        tokenExpiresAt: tokens.expiresAt ?? null,
        metadata: (info.metadata ?? undefined) as object | undefined,
        isActive: true,
        lastSyncAt: new Date(),
        // Re-connecting is the operator's answer to a reconnect prompt.
        needsReconnect: false,
        lastError: null,
      };

      const account = await prisma.socialAccount.upsert({
        where: {
          platform_platformUserId: { platform, platformUserId: info.platformUserId },
        },
        create: { platform, ...shared },
        update: shared,
      });

      return NextResponse.redirect(
        new URL(
          `/settings/accounts?success=${platform.toLowerCase()}_connected&account=${account.id}`,
          req.url,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      console.error(`${platform} OAuth callback failed:`, message);
      return failure(`${platform.toLowerCase()}_connect_failed`);
    }
  };
}
