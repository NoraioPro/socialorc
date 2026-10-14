import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { isMockAdapterAllowed } from "@/lib/adapters";
import { peekStateCookie } from "@/lib/oauth/state";
import { oauthStateSecret } from "@/lib/oauth/state-secret";

/**
 * Mock OAuth callback for development/testing.
 * Simulates connecting a social account without real OAuth flow.
 *
 * Enable by setting MOCK_SOCIAL_ADAPTERS=true in .env — and it only applies
 * outside production, so this route cannot create a fake account on a live
 * deployment even if the flag is left switched on there.
 */
export async function GET(req: NextRequest) {
  if (process.env.MOCK_SOCIAL_ADAPTERS !== "true" || !isMockAdapterAllowed()) {
    return NextResponse.redirect(
      new URL("/settings/accounts?error=mock_mode_disabled", req.url)
    );
  }

  try {
    // Same gate as the real connect flow: a member who may connect accounts,
    // in a workspace the connection will belong to.
    const tenant = await requireWorkspace("accounts:connect");
    if (!tenant.ok) {
      return NextResponse.redirect(
        new URL(tenant.status === 401 ? "/login?error=unauthorized" : "/settings/accounts?error=not_allowed", req.url)
      );
    }

    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state");
    const platformParam = searchParams.get("platform")?.toUpperCase();

    if (!state || !platformParam || !Object.values(Platform).includes(platformParam as Platform)) {
      return NextResponse.redirect(
        new URL("/settings/accounts?error=invalid_mock_params", req.url)
      );
    }

    const platform = platformParam as Platform;
    // Signed cookie: peekStateCookie verifies it, so an unsigned or edited value
    // yields nothing rather than being parsed on trust.
    const stateCookie = req.cookies.get(`oauth_state_${state}`);
    const stateData = peekStateCookie(stateCookie?.value, oauthStateSecret());
    const requestedBrainId: string | null = stateData.brainId ?? null;
    const popup = Boolean(stateData.popup);
    const popupSuffix = popup ? "&popup=1" : "";
    const brain = await resolveBrainForWorkspace(tenant, requestedBrainId);

    // Keep one demo account per platform and brain. A timestamp here created a
    // duplicate account every time someone clicked Connect or Reconnect.
    const mockUserId = `mock_${tenant.workspaceId}_${brain.id}_${platform.toLowerCase()}`;
    const mockTokens = {
      accessToken: `mock_access_token_${platform}_${Date.now()}`,
      refreshToken: `mock_refresh_token_${platform}_${Date.now()}`,
    };

    const encryptedTokens = encryptTokens(mockTokens);

    await prisma.socialAccount.upsert({
      where: {
        platform_platformUserId: {
          platform,
          platformUserId: mockUserId,
        },
      },
      create: {
        workspaceId: tenant.workspaceId,
        userId: tenant.userId,
        brainId: brain.id,
        platform,
        platformUserId: mockUserId,
        platformUsername: `mock_${platform.toLowerCase()}_user`,
        displayName: `Mock ${platform} Account (Dev)`,
        profileImageUrl: undefined,
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        metadata: { isMock: true, connectedAt: new Date().toISOString() },
        isActive: true,
        lastSyncAt: new Date(),
      },
      update: {
        displayName: `Mock ${platform} Account (Dev)`,
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        metadata: { isMock: true, reconnectedAt: new Date().toISOString() },
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    return NextResponse.redirect(
      new URL(`/settings/accounts?success=${platform.toLowerCase()}_mock_connected${popupSuffix}`, req.url)
    );
  } catch (error) {
    console.error("Mock callback error:", error);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "mock_connection_failed")}`, req.url)
    );
  }
}
