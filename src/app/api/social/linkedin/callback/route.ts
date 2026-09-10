import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { linkedInAdapter } from "@/lib/adapters/linkedin";
import { encryptTokens } from "@/lib/encryption";
import { Platform } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", req.url));
    }

    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      console.error("LinkedIn OAuth error:", error, errorDescription);
      return NextResponse.redirect(
        new URL(`/settings/accounts?error=${encodeURIComponent(errorDescription || error)}`, req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/settings/accounts?error=missing_params", req.url)
      );
    }

    const stateCookie = req.cookies.get(`oauth_state_${state}`);
    if (!stateCookie) {
      return NextResponse.redirect(
        new URL("/settings/accounts?error=invalid_state", req.url)
      );
    }

    const stateData = JSON.parse(stateCookie.value);
    if (stateData.userId !== session.user.id || stateData.platform !== Platform.LINKEDIN) {
      return NextResponse.redirect(
        new URL("/settings/accounts?error=state_mismatch", req.url)
      );
    }

    const tokens = await linkedInAdapter.exchangeCodeForTokens(code);
    const accountInfo = await linkedInAdapter.getAccountInfo(tokens.accessToken);
    const encryptedTokens = encryptTokens(tokens);

    await prisma.socialAccount.upsert({
      where: {
        platform_platformUserId: {
          platform: Platform.LINKEDIN,
          platformUserId: accountInfo.platformUserId,
        },
      },
      create: {
        userId: session.user.id,
        platform: Platform.LINKEDIN,
        platformUserId: accountInfo.platformUserId,
        platformUsername: accountInfo.platformUsername,
        displayName: accountInfo.displayName,
        profileImageUrl: accountInfo.profileImageUrl,
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        metadata: accountInfo.metadata as object,
        isActive: true,
        lastSyncAt: new Date(),
      },
      update: {
        userId: session.user.id,
        displayName: accountInfo.displayName,
        profileImageUrl: accountInfo.profileImageUrl,
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        metadata: accountInfo.metadata as object,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });

    const response = NextResponse.redirect(
      new URL("/settings/accounts?success=linkedin_connected", req.url)
    );
    
    response.cookies.delete(`oauth_state_${state}`);
    
    return response;
  } catch (error) {
    console.error("LinkedIn callback error:", error);
    return NextResponse.redirect(
      new URL(`/settings/accounts?error=${encodeURIComponent(error instanceof Error ? error.message : "connection_failed")}`, req.url)
    );
  }
}
