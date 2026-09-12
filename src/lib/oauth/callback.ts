import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAdapter } from "@/lib/adapters";
import { encryptTokens } from "@/lib/encryption";
import { splitState, validateOAuthState, verifierFromStateCookie } from "@/lib/oauth/state";
import { resolveBrainForUser } from "@/lib/brains";
import { resolveSessionUser, safeRedirectCode, sessionProblemRedirect } from "@/lib/social/session-user";

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
    let popupSuffix = "";
    const failure = (reason: string) =>
      NextResponse.redirect(
        new URL(`/settings/accounts?error=${encodeURIComponent(reason)}${popupSuffix}`, req.url),
      );

    try {
      // The session must exist in *this* database: a cookie minted by another
      // local server on the same host (different port, same NEXTAUTH_SECRET)
      // would otherwise reach the write and die as a foreign-key violation.
      const user = await resolveSessionUser();
      if (!user.ok) {
        console.error(`${platform} OAuth callback rejected:`, user.code);
        return NextResponse.redirect(new URL(sessionProblemRedirect(user.code).path, req.url));
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
      const stateCookieValue = req.cookies.get(`oauth_state_${baseState}`)?.value;

      const stateCheck = validateOAuthState(stateCookieValue, {
        userId: user.userId,
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

      popupSuffix = stateCheck.data.popup ? "&popup=1" : "";
      const brain = await resolveBrainForUser(user.userId, stateCheck.data.brainId);

      const adapter = getAdapter(platform);
      // Prefer the server-side verifier (PKCE for TikTok and any newer
      // connector); fall back to the one X packs into the state string.
      const codeVerifier = verifierFromStateCookie(stateCookieValue) ?? verifier ?? undefined;
      const tokens = await adapter.exchangeCodeForTokens(code, codeVerifier);
      const info = await adapter.getAccountInfo(tokens.accessToken);
      const encrypted = encryptTokens(tokens);

      // Capabilities and scopes are stored with the connection: "connected" and
      // "allowed to publish" are different facts and the UI needs both.
      const scopes = tokens.scope ?? null;
      const accountType =
        (info.metadata?.accountType as string | undefined) ?? null;
      let capabilities: object | undefined;
      if (adapter.getCapabilities) {
        try {
          const report = adapter.getCapabilities({
            scopes: scopes ? scopes.split(/[\s,]+/).filter(Boolean) : [],
            accountType,
          });
          capabilities = {
            capabilities: report.capabilities,
            limitations: report.limitations,
            computedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`${platform} capability computation failed:`, error instanceof Error ? error.message : error);
        }
      }

      const shared = {
        userId: user.userId,
        brainId: brain.id,
        platformUserId: info.platformUserId,
        platformUsername: info.platformUsername,
        displayName: info.displayName,
        profileImageUrl: info.profileImageUrl,
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        tokenExpiresAt: tokens.expiresAt ?? null,
        refreshTokenExpiresAt: tokens.refreshExpiresAt ?? null,
        metadata: (info.metadata ?? undefined) as object | undefined,
        accountType,
        externalParentId: info.metadata?.externalParentId as string | undefined,
        scopes,
        capabilities,
        isActive: true,
        lastSyncAt: new Date(),
        disconnectedAt: null,
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

      const response = NextResponse.redirect(
        new URL(
          `/settings/accounts?success=${platform.toLowerCase()}_connected&account=${account.id}&brain=${brain.id}${popupSuffix}`,
          req.url,
        ),
      );
      response.cookies.delete(`oauth_state_${baseState}`);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      console.error(`${platform} OAuth callback failed:`, message);
      return failure(safeRedirectCode(error, `${platform.toLowerCase()}_connect_failed`));
    }
  };
}
