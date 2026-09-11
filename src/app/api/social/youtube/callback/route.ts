import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/** YouTube (Google) OAuth callback — see src/lib/oauth/callback.ts */
export const GET = createOAuthCallback(Platform.YOUTUBE);
export const dynamic = "force-dynamic";
