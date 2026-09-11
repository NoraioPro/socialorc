import { Platform } from "@prisma/client";
import { createOAuthCallback } from "@/lib/oauth/callback";

/**
 * LinkedIn OAuth callback (the reference implementation).
 *
 * The body used to live here; it is now the shared handler so every connector
 * behaves identically. See src/lib/oauth/callback.ts for the flow and
 * src/lib/oauth/state.ts for state/PKCE handling.
 */
export const GET = createOAuthCallback(Platform.LINKEDIN);
export const dynamic = "force-dynamic";
