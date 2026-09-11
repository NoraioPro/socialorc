import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/** TikTok Content Posting OAuth callback — see src/lib/oauth/callback.ts */
export const GET = createOAuthCallback(Platform.TIKTOK);
export const dynamic = "force-dynamic";
