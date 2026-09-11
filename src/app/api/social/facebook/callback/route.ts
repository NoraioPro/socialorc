import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/** Facebook Pages OAuth callback — see src/lib/oauth/callback.ts */
export const GET = createOAuthCallback(Platform.FACEBOOK);
export const dynamic = "force-dynamic";
