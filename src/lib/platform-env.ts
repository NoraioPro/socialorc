/**
 * Per-workspace platform credentials.
 *
 * The deployment can carry one app per provider, but a SaaS cannot force every
 * customer to publish through its author's LinkedIn app. A workspace may store
 * its own OAuth app (id + secret) in `WorkspacePlatformCredential`; when it does,
 * the adapters must use those values for that workspace's requests only.
 *
 * Adapters historically read `process.env` directly. Rather than mutate the
 * process environment (a cross-tenant leak under concurrency), every adapter read
 * goes through `platformEnv()`, which consults an AsyncLocalStorage override that
 * is populated for the duration of one request.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

const storage = new AsyncLocalStorage<Record<string, string>>();

/** Read a credential: workspace override first, deployment env second. */
export function platformEnv(name: string, fallback = ""): string {
  const overrides = storage.getStore();
  const value = overrides?.[name] ?? process.env[name];
  return value ?? fallback;
}

export function withPlatformEnv<T>(overrides: Record<string, string>, fn: () => T): T {
  if (!overrides || Object.keys(overrides).length === 0) return fn();
  return storage.run(overrides, fn);
}

/** Env names a stored workspace app has to fill, per platform. */
const APP_ENV: Record<string, [appId: string, appSecret: string]> = {
  LINKEDIN: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  TWITTER: ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"],
  TIKTOK: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  FACEBOOK: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  INSTAGRAM: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"],
  YOUTUBE: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
};

/**
 * The overrides this workspace's own apps provide, ready for `withPlatformEnv`.
 * A row whose secret cannot be decrypted is skipped rather than half-applied, so
 * a bad key never produces an app id with an empty secret.
 */
export async function workspaceCredentialOverrides(workspaceId: string): Promise<Record<string, string>> {
  const rows = await prisma.workspacePlatformCredential.findMany({
    where: { workspaceId },
    select: { platform: true, appId: true, encryptedAppSecret: true },
  });

  const overrides: Record<string, string> = {};
  for (const row of rows) {
    const names = APP_ENV[row.platform];
    if (!names) continue;
    try {
      const secret = decrypt(row.encryptedAppSecret);
      if (!row.appId || !secret) continue;
      overrides[names[0]] = row.appId;
      overrides[names[1]] = secret;
    } catch {
      /* undecryptable row: fall back to the deployment's own app */
    }
  }
  return overrides;
}

/** Overrides for the signed-in caller's workspace (empty when none are stored). */
export async function overridesForCurrentUser(): Promise<Record<string, string>> {
  const { getAuthSession } = await import("@/lib/auth");
  const { tenantForUser } = await import("@/lib/tenancy/guard");
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return {};
  const tenant = await tenantForUser(userId);
  return tenant.ok ? workspaceCredentialOverrides(tenant.workspaceId) : {};
}
