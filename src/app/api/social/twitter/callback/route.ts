import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/** X (Twitter) OAuth 2.0 PKCE callback — see src/lib/oauth/callback.ts */
export const GET = createOAuthCallback(Platform.TWITTER);
export const dynamic = "force-dynamic";
