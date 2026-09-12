import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";
import { resolveBrainForUser } from "@/lib/brains";

/**
 * Mock OAuth callback for development/testing.
 * Simulates connecting a social account without real OAuth flow.
 * 
 * Enable by setting MOCK_SOCIAL_ADAPTERS=true in .env
 */
export async function GET(req: NextRequest) {
  if (process.env.MOCK_SOCIAL_ADAPTERS !== "true") {
    return NextResponse.redirect(
      new URL("/settings/accounts?error=mock_mode_disabled", req.url)
    );
  }

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url));
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
    const stateCookie = req.cookies.get(`oauth_state_${state}`);
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
    const brain = await resolveBrainForUser(session.user.id, requestedBrainId);

    // Keep one demo account per platform and brain. A timestamp here created a
    // duplicate account every time someone clicked Connect or Reconnect.
    const mockUserId = `mock_${session.user.id}_${brain.id}_${platform.toLowerCase()}`;
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
        userId: session.user.id,
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
