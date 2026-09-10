import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { Platform } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
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

    const state = crypto.randomBytes(32).toString("hex");
    
    const stateData = {
      userId: session.user.id,
      platform,
      timestamp: Date.now(),
    };

    const response = NextResponse.json({
      url: adapter.getOAuthUrl(state),
      state,
    });

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
