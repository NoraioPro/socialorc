/**
 * Provider-side token revocation, shared by the adapters that have a documented
 * endpoint (X: POST https://api.x.com/2/oauth2/revoke; Google/YouTube: POST
 * https://oauth2.googleapis.com/revoke). LinkedIn documents none, so its adapter
 * has no `revokeAccess` and a disconnect reports "not supported" instead of
 * pretending.
 *
 * Throws on anything but a 2xx, with a message that never carries the token, a
 * response body or the request URL: the caller logs it.
 */

const REVOKE_TIMEOUT_MS = 8_000;

export async function postRevocation(opts: {
  url: string;
  token: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const send = opts.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await send(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...opts.headers },
      body: new URLSearchParams({ token: opts.token }),
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
  } catch {
    throw new Error("The provider could not be reached to revoke the token.");
  }
  if (!response.ok) {
    throw new Error(`The provider refused the revocation (HTTP ${response.status}).`);
  }
}

/** What a disconnect can truthfully say about the provider's side. */
export type RemoteRevocation = "revoked" | "failed" | "not_supported";

export type Revoker = (accessToken: string, refreshToken?: string | null) => Promise<void>;

/**
 * Run a provider's revoker and report what happened. "revoked" only when the
 * provider confirmed it; a missing revoker is "not_supported"; any error is
 * "failed". Never throws: a provider problem must not undo a local disconnect.
 */
export async function attemptRemoteRevocation(
  revoker: Revoker | undefined,
  tokens: { accessToken: string | null; refreshToken: string | null },
): Promise<RemoteRevocation> {
  if (typeof revoker !== "function") return "not_supported";
  if (!tokens.accessToken && !tokens.refreshToken) return "failed";
  try {
    await revoker(tokens.accessToken ?? "", tokens.refreshToken);
    return "revoked";
  } catch (error) {
    console.error("Disconnect: provider revocation failed:", error instanceof Error ? error.message : "unknown");
    return "failed";
  }
}
