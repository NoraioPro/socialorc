import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { createPublicOnlyFetch, isNonPublicIp, type FetchLike } from "@/lib/net/safe-fetch";

export { isNonPublicIp };

/**
 * Is a customer-supplied AI `baseUrl` safe for the server to call?
 *
 * The URL comes from a form (Settings → AI) and the server then sends requests
 * to it — with the customer's API key in the Authorization header. Unchecked, it
 * is an SSRF primitive: `http://169.254.169.254/` reaches cloud metadata,
 * `http://localhost:5432` probes the database, `http://10.0.0.5/` the private
 * network. So, outside local development:
 *
 *   - https only (the key travels in a header);
 *   - no credentials in the URL;
 *   - no loopback, private, link-local, CGNAT, unspecified or multicast address,
 *     whether written as an IP literal or reached through a hostname that
 *     resolves to one;
 *   - no `localhost`, `*.localhost`, `*.local`, `*.internal` names.
 *
 * Saving is only the first check. DNS can change after it, and the provider SDK
 * follows redirects, so every call also goes through `aiFetch`
 * (src/lib/net/safe-fetch.ts): the address is judged where the socket opens,
 * and a redirect is an error.
 *
 * Local development keeps http and private hosts (a local Ollama or LM Studio is
 * the normal case there). Override either way with AI_BASE_URL_ALLOW_PRIVATE.
 */

export function allowPrivateAiBaseUrl(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.AI_BASE_URL_ALLOW_PRIVATE;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return env.NODE_ENV === "development";
}

const BLOCKED_NAME = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

/**
 * Synchronous checks on the URL text alone. Returns a user-facing problem, or
 * null when the URL is acceptable.
 */
export function aiBaseUrlProblem(value: string, opts: { allowPrivate: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "The base URL is not a valid URL.";
  }

  if (url.protocol !== "https:" && !(opts.allowPrivate && url.protocol === "http:")) {
    return "The base URL must use https.";
  }
  if (url.username || url.password) {
    return "The base URL must not contain a username or password.";
  }
  if (opts.allowPrivate) return null;

  const host = url.hostname.replace(/\.$/, "");
  if (!host || BLOCKED_NAME.test(host) || isNonPublicIp(host)) {
    return "The base URL must point at a public host, not a private, loopback or link-local address.";
  }
  // A bare integer / hex host ("2130706433", "0x7f000001") is an IPv4 literal to
  // the WHATWG parser and already normalised above; nothing more to do here.
  return null;
}

/**
 * The full check: the text, then (outside development) every address the host
 * resolves to. A name that does not resolve is refused: accepting it would let
 * somebody save a name today and point it at a private address tomorrow, and
 * there is no legitimate provider without DNS.
 */
export async function checkAiBaseUrl(
  value: string,
  opts: { allowPrivate: boolean; resolve?: (host: string) => Promise<string[]> },
): Promise<string | null> {
  const problem = aiBaseUrlProblem(value, opts);
  if (problem || opts.allowPrivate) return problem;

  const host = new URL(value).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return null;

  const resolve =
    opts.resolve ??
    (async (name: string) => (await lookup(name, { all: true })).map((entry) => entry.address));
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    return "The base URL's host does not resolve.";
  }
  if (addresses.length === 0) return "The base URL's host does not resolve.";
  if (addresses.some(isNonPublicIp)) {
    return "The base URL's host resolves to a private, loopback or link-local address.";
  }
  return null;
}

/**
 * The `fetch` every AI provider client must be built with.
 *
 * Public addresses only (unless private hosts are allowed, i.e. local
 * development), checked at connect time on every request, and no redirects.
 */
export const aiFetch: FetchLike = createPublicOnlyFetch({ allowPrivate: () => allowPrivateAiBaseUrl() });
