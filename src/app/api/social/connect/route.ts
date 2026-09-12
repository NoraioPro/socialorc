import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { Platform } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import { resolveBrainForUser } from "@/lib/brains";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const brain = await resolveBrainForUser(session.user.id, searchParams.get("brainId"));

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
      userId: session.user.id,
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

    response.cookies.set(`oauth_state_${state}`, JSON.stringify(stateData), {
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
