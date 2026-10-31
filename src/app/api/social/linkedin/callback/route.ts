import type { NextRequest } from "next/server";
import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";
import { overridesForCurrentUser, withPlatformEnv } from "@/lib/platform-env";

/**
 * LinkedIn OAuth callback (the reference implementation).
 *
 * The body used to live here; it is now the shared handler so every connector
 * behaves identically. See src/lib/oauth/callback.ts for the flow and
 * src/lib/oauth/state.ts for state/PKCE handling.
 */
const handler = createOAuthCallback(Platform.LINKEDIN);


export const dynamic = "force-dynamic";

/** The token exchange must use this workspace's app when it stored one. */
export async function GET(req: NextRequest) {
  const overrides = await overridesForCurrentUser();
  return withPlatformEnv(overrides, () => handler(req));
}
