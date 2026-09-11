import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/** Instagram (Meta) OAuth callback — see src/lib/oauth/callback.ts */
export const GET = createOAuthCallback(Platform.INSTAGRAM);
export const dynamic = "force-dynamic";
