import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { overridesForCurrentUser, withPlatformEnv } from "@/lib/platform-env";
import { Platform } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import { resolveBrainForWorkspace } from "@/lib/brains";
import crypto from "crypto";
import { encodeStateCookie } from "@/lib/oauth/state";
import { oauthStateSecret } from "@/lib/oauth/state-secret";

async function handleConnect(req: NextRequest) {
  try {
    // Starting a connection is a write path that ends in a stored credential.
    // `accounts:connect` is the permission for it; it was defined and checked
    // nowhere, so every signed-in role could connect an account.
    const guard = await requireWorkspace("accounts:connect");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(req.url);
    const platformParam = searchParams.get("platform")?.toUpperCase();

    if (!platformParam || !Object.values(Platform).includes(platformParam as Platform)) {
      return NextResponse.json(
        { error: "Invalid platform" },
        { status: 400 }
      );
    }

    const platform = platformParam as Platform;
    const adapter = getAdapter(platform);
    const validation = adapter.validateCredentials();

    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: `${platform} credentials not configured`,
          missing: validation.missing,
          message: `Please configure the following environment variables: ${validation.missing.join(", ")}`
        },
        { status: 503 }
      );
    }

    const brain = await resolveBrainForWorkspace(guard, searchParams.get("brainId"));

    const state = crypto.randomBytes(32).toString("hex");

    // Prefer the explicit authorization request when the connector implements
    // it: it hands back the PKCE verifier separately so it can be parked in the
    // state cookie instead of being embedded in the URL (see src/lib/oauth/state.ts).
    const authorization = adapter.createAuthorizationRequest?.(state);
    const url = authorization?.url ?? adapter.getOAuthUrl(state);

    const stateData: {
      userId: string;
      platform: Platform;
      brainId: string;
      popup: boolean;
      timestamp: number;
      verifier?: string;
      codeChallengeMethod?: "S256" | "plain";
    } = {
      userId: guard.userId,
      platform,
      brainId: brain.id,
      // Connect was opened in a popup window, not a full-page navigation —
      // every callback threads this through so it knows to self-close instead
      // of rendering the settings page inside the popup.
      popup: searchParams.get("popup") === "1",
      timestamp: Date.now(),
    };

    if (authorization?.verifier) {
      stateData.verifier = authorization.verifier;
      stateData.codeChallengeMethod = authorization.codeChallengeMethod;
    }

    const response = NextResponse.json({ url, state });

    // Signed, so a client cannot mint one: this cookie is the only thing that
    // proves a later callback belongs to the flow this user started.
    response.cookies.set(`oauth_state_${state}`, encodeStateCookie(stateData, oauthStateSecret()), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Error initiating OAuth:", error);
    return NextResponse.json(
      { error: "Failed to initiate connection" },
      { status: 500 }
    );
  }
}


/**
 * A workspace that stored its own app must get ITS app in the authorize URL.
 * `withPlatformEnv` scopes the override to this request only.
 */
export async function GET(req: NextRequest) {
  const overrides = await overridesForCurrentUser();
  return withPlatformEnv(overrides, () => handleConnect(req));
}
