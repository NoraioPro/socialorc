import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

/**
 * Where an AI key comes from.
 *
 * **The deployment's own key is deliberately not a source here, and must never
 * become one.** The owner's standing instruction is that his key is never spent
 * on anyone's behalf — not for a customer, not for the cron worker, not for a
 * test, not as a fallback. A missing customer key is therefore a hard, visible
 * failure (`AiKeyMissingError`), never a silent call to a provider on our bill.
 *
 * That means `process.env.OPENAI_API_KEY` must not appear anywhere on the AI
 * path. `resolveAiConfig` reads exactly two rows: the user's, then the
 * workspace's. If neither exists it returns `null`, and the caller must turn
 * `null` into a 4xx telling the person to add their own key (Settings → AI).
 *
 * Resolution order, highest first:
 *   1. the user's own key      — a person's key beats the team's
 *   2. the workspace's key     — what the team agreed to share
 *   3. `null`                  — AI is off for this request
 */

export type AiSource = "user" | "workspace";

export interface AiConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  provider: string;
  /** Which row the key came from — surfaced in the UI so nobody is guessing. */
  source: AiSource;
}

export interface AiScope {
  userId?: string | null;
  workspaceId?: string | null;
}

/** Provider defaults. A model default is harmless; the KEY is what must not be inherited. */
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-4o-mini";

export const AI_KEY_REQUIRED = "ai_key_required";

/**
 * Raised when a request needs AI but nobody supplied a key.
 *
 * A distinct class rather than a bare Error so the API boundary can map it to a
 * 4xx with an actionable message instead of leaking a 500.
 */
export class AiKeyMissingError extends Error {
  readonly code = AI_KEY_REQUIRED;

  constructor(
    message = "No AI key is configured for this account. Add your own key under Settings → AI.",
  ) {
    super(message);
    this.name = "AiKeyMissingError";
  }
}

/** Is this error the "nobody configured a key" case? Used by route error mapping. */
export function isAiKeyMissing(error: unknown): error is AiKeyMissingError {
  return error instanceof AiKeyMissingError;
}

interface CredentialRow {
  provider: string;
  encryptedKey: string;
  baseUrl: string | null;
  model: string | null;
}

function toConfig(row: CredentialRow, source: AiSource): AiConfig {
  const apiKey = decrypt(row.encryptedKey).trim();

  // A stored row that cannot be decrypted (rotated or missing
  // TOKEN_ENCRYPTION_KEY) is indistinguishable to the caller from having no key
  // at all. Fail the same way rather than sending an empty key to a provider.
  if (!apiKey) {
    throw new AiKeyMissingError(
      "The stored AI key could not be read. Re-enter it under Settings → AI.",
    );
  }

  return {
    apiKey,
    baseUrl: row.baseUrl ?? undefined,
    model: row.model ?? undefined,
    provider: row.provider,
    source,
  };
}

/**
 * Resolve the AI config for a request, or `null` when nobody supplied a key.
 *
 * Never throws for the "no key" case — callers that can work without AI should
 * branch on `null`; callers that cannot should use `requireAiConfig`.
 */
export async function resolveAiConfig(scope: AiScope): Promise<AiConfig | null> {
  if (scope.userId) {
    const row = await prisma.aiCredential.findUnique({
      where: { userId: scope.userId },
    });
    if (row) return toConfig(row, "user");
  }

  if (scope.workspaceId) {
    const row = await prisma.aiCredential.findUnique({
      where: { workspaceId: scope.workspaceId },
    });
    if (row) return toConfig(row, "workspace");
  }

  return null;
}

/** Same as `resolveAiConfig`, but a missing key is an error rather than a `null`. */
export async function requireAiConfig(scope: AiScope): Promise<AiConfig> {
  const config = await resolveAiConfig(scope);
  if (!config) throw new AiKeyMissingError();
  return config;
}

/**
 * The only safe shape to show a key back to its owner: enough to recognise it,
 * never enough to use it. Used by the credentials API and the settings page.
 */
export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "…";
  return `…${trimmed.slice(-4)}`;
}
