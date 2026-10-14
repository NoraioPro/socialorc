import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

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

function ipv4Private(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** True for any IP literal the server must not be pointed at. */
export function isNonPublicIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(ip);
  if (family === 4) return ipv4Private(ip);
  if (family !== 6) return false;

  if (ip === "::" || ip === "::1") return true;
  // IPv4-mapped / -compatible (::ffff:10.0.0.1, ::ffff:a00:1) — judge the IPv4 inside.
  const mapped = /^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return ipv4Private(mapped[2]);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // multicast
  );
}

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
 * resolves to. A name that does not resolve is accepted — it cannot reach a
 * private address today, and the provider call will fail visibly.
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
    return null;
  }
  if (addresses.some(isNonPublicIp)) {
    return "The base URL's host resolves to a private, loopback or link-local address.";
  }
  return null;
}
