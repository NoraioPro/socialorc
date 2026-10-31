import type { NextRequest } from "next/server";
import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";
import { overridesForCurrentUser, withPlatformEnv } from "@/lib/platform-env";

/** YouTube (Google) OAuth callback — see src/lib/oauth/callback.ts */
const handler = createOAuthCallback(Platform.YOUTUBE);


export const dynamic = "force-dynamic";

/** The token exchange must use this workspace's app when it stored one. */
export async function GET(req: NextRequest) {
  const overrides = await overridesForCurrentUser();
  return withPlatformEnv(overrides, () => handler(req));
}
