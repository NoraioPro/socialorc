import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { tenantForUser } from "@/lib/tenancy/guard";
import { getAdapter } from "@/lib/adapters";
import { peekStateCookie, splitState, validateOAuthState, verifierFromStateCookie } from "@/lib/oauth/state";
import { oauthStateSecret } from "@/lib/oauth/state-secret";
import { resolveSessionUser, safeRedirectCode, sessionProblemRedirect } from "@/lib/social/session-user";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { persistConnectedAccount } from "@/lib/oauth/persist-account";
import {
  encodePendingConnection,
  pendingCookieName,
  pendingCookieOptions,
} from "@/lib/oauth/pending-connection";
import type { AccountInfo } from "@/types/platform";

/**
 * The collaborators the callback reaches out to. Injectable only so the unit
 * tests can drive the real control flow (state checks, ownership refusal, the
 * multi-target pending path) without a session, a database or a provider;
 * production always uses the defaults.
 */
export interface OAuthCallbackDeps {
  resolveSessionUser: typeof resolveSessionUser;
  tenantForUser: typeof tenantForUser;
  resolveBrainForWorkspace: (
    tenant: { userId: string; workspaceId: string },
    brainId?: string | null,
  ) => Promise<{ id: string }>;
  getAdapter: (platform: Platform) => ReturnType<typeof getAdapter>;
  persistConnectedAccount: typeof persistConnectedAccount;
}

const defaultDeps: OAuthCallbackDeps = {
  resolveSessionUser,
  tenantForUser,
  resolveBrainForWorkspace,
  getAdapter: (platform) => getAdapter(platform),
  persistConnectedAccount,
};

/** Shown when a grant covers nothing this connector can publish to. */
export function noTargetMessage(platform: Platform): string {
  return platform === Platform.INSTAGRAM
    ? "No Instagram professional account linked to a Facebook Page you manage was found. Instagram publishing runs through a Page: make sure you are an Admin or Editor of a Facebook Page, that the Page is ticked in the Facebook dialog, and that your Instagram account is a Business or Creator account linked to that Page."
    : "No Facebook Page you can publish to was found for this login. Meta only lets an app publish to a Page you are an Admin or Editor of: check facebook.com/pages, then tick the Page when Facebook asks which Pages to share.";
}

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
export function createOAuthCallback(platform: Platform, overrides: Partial<OAuthCallbackDeps> = {}) {
  const deps: OAuthCallbackDeps = { ...defaultDeps, ...overrides };
  return async function GET(req: NextRequest) {
    // Read as early as possible (before state validation can even run) so a
    // popup that fails early still knows to self-close instead of rendering
    // the settings page inside itself — see src/lib/oauth/state.ts.
    const earlyState = req.nextUrl.searchParams.get("state");
    const earlyPopup = Boolean(
      peekStateCookie(
        earlyState ? req.cookies.get(`oauth_state_${splitState(earlyState).baseState}`)?.value : null,
        oauthStateSecret()
      ).popup,
    );
    const failure = (reason: string, popup = earlyPopup) =>
      NextResponse.redirect(
        new URL(`/connect/done?error=${encodeURIComponent(reason)}${popup ? "&popup=1" : ""}`, req.url),
      );

    try {
      // The session must exist in *this* database: a cookie minted by another
      // local server on the same host (different port, same NEXTAUTH_SECRET)
      // would otherwise reach the write and die as a foreign-key violation.
      const user = await deps.resolveSessionUser();
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
        secret: oauthStateSecret(),
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

      const popup = Boolean(stateCheck.data.popup);

      // The connection belongs to the caller's workspace, resolved fresh (the
      // role may have changed since the flow started).
      const tenant = await deps.tenantForUser(user.userId);
      if (!tenant.ok) return failure("no_workspace", popup);
      const brain = await deps.resolveBrainForWorkspace(tenant, stateCheck.data.brainId);

      const adapter = deps.getAdapter(platform);
      // Prefer the server-side verifier (PKCE for TikTok and any newer
      // connector); fall back to the one X packs into the state string.
      const codeVerifier =
        verifierFromStateCookie(stateCookieValue, oauthStateSecret()) ?? verifier ?? undefined;
      let tokens = await adapter.exchangeCodeForTokens(code, codeVerifier);
      let info: AccountInfo;

      // Grants that cover several identities (Facebook Pages, Instagram
      // accounts): connect the only one directly, or park the grant in a
      // signed, encrypted cookie and let the user choose in settings.
      if (adapter.listConnectTargets && adapter.connectTarget) {
        const targets = await adapter.listConnectTargets(tokens.accessToken);
        if (targets.length === 0) return failure(noTargetMessage(platform), popup);
        if (targets.length > 1) {
          const pending = NextResponse.redirect(
            new URL(
              `/connect/done?error=${encodeURIComponent("account_needs_selection")}${popup ? "&popup=1" : ""}`,
              req.url,
            ),
          );
          pending.cookies.set(
            pendingCookieName(platform),
            encodePendingConnection(
              {
                userId: user.userId,
                workspaceId: tenant.workspaceId,
                platform,
                brainId: brain.id,
                userToken: tokens.accessToken,
                userTokenExpiresAt: tokens.expiresAt?.toISOString() ?? null,
                scope: tokens.scope ?? null,
                timestamp: Date.now(),
              },
              oauthStateSecret(),
            ),
            pendingCookieOptions(),
          );
          pending.cookies.delete(`oauth_state_${baseState}`);
          return pending;
        }
        ({ tokens, info } = await adapter.connectTarget(tokens.accessToken, targets[0].id));
      } else {
        info = await adapter.getAccountInfo(tokens.accessToken);
      }

      const saved = await deps.persistConnectedAccount({
        platform,
        workspaceId: tenant.workspaceId,
        userId: user.userId,
        brainId: brain.id,
        adapter,
        tokens,
        info,
      });
      if (!saved.ok) return failure(saved.reason, popup);
      const account = { id: saved.accountId };

      const response = NextResponse.redirect(
        new URL(
          `/connect/done?success=${platform.toLowerCase()}_connected&account=${account.id}${popup ? "&popup=1" : ""}`,
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
