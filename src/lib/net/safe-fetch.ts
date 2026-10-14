import { isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Outbound HTTP to a URL somebody else chose, without SSRF.
 *
 * Checking a URL's host when it is *saved* is not enough: DNS can change after
 * the check (rebinding), and an HTTP client that follows redirects can be sent
 * from a public host to `http://169.254.169.254/` by a single 302. The defence
 * has to sit where the socket is opened, on every request:
 *
 *   - IP literals in the URL are judged before anything is sent;
 *   - every hostname is resolved by a guarded `lookup` that refuses to hand the
 *     socket a loopback, private, link-local, CGNAT, NAT64, 6to4, multicast or
 *     otherwise non-public address — the address that is checked is the address
 *     that is connected to, so there is no check-then-use gap;
 *   - redirects are an error, never followed.
 *
 * Generic on purpose: anything that fetches a customer-supplied URL (AI base
 * URLs, knowledge-source fetchers, webhooks) should go through
 * `createPublicOnlyFetch` rather than bare `fetch`.
 */

export class NonPublicAddressError extends Error {
  readonly code = "ERR_NON_PUBLIC_ADDRESS";
  constructor(host: string) {
    super(`Refusing to connect to ${host}: it is not a public address.`);
    this.name = "NonPublicAddressError";
  }
}

function ipv4NonPublic(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || // "this" network
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  );
}

/** Expand an IPv6 literal to its eight 16-bit groups, or null if it is not one. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  // A trailing dotted IPv4 (::ffff:10.0.0.1, 64:ff9b::10.0.0.1) is two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const parts = dotted[1].split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    const hi = ((parts[0] << 8) | parts[1]).toString(16);
    const lo = ((parts[2] << 8) | parts[3]).toString(16);
    text = `${text.slice(0, dotted.index)}${hi}:${lo}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

/** True for any IP literal an outbound request must not be pointed at. */
export function isNonPublicIp(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0];
  const family = isIP(ip);
  if (family === 4) return ipv4NonPublic(ip);
  if (family !== 6) return false;

  const g = ipv6Groups(ip);
  if (!g) return true; // unparseable: refuse rather than guess

  const embeddedV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and the deprecated IPv4-compatible ::a.b.c.d —
  // judge the IPv4 inside.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return ipv4NonPublic(embeddedV4(g[6], g[7]));
  }
  // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48: a
  // translator on the path turns these into IPv4 we cannot see. Refuse.
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;
  // 6to4 2002::/16 embeds an arbitrary IPv4 (2002:7f00:1::/48 is 127.0.0.1).
  if (g[0] === 0x2002) return true;
  // Teredo 2001:0::/32 tunnels to an obfuscated IPv4.
  if (g[0] === 0x2001 && g[1] === 0) return true;
  // Documentation 2001:db8::/32.
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  // Discard-only 100::/64.
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;

  return (
    (g[0] & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (g[0] & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g[0] & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (g[0] & 0xff00) === 0xff00 // multicast
  );
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

type Resolver = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * A `net.connect` / `tls.connect` `lookup` that refuses non-public answers.
 *
 * Every address the name resolves to is judged, not only the one that would be
 * used: a resolver answering with one public and one private address would
 * otherwise win whenever the private one is tried first (happy eyeballs).
 */
export function publicOnlyLookup(resolver: Resolver = dnsLookup as unknown as Resolver) {
  return function lookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
    resolver(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      if (!addresses || addresses.length === 0) {
        const notFound = Object.assign(new Error(`${hostname} did not resolve`), { code: "ENOTFOUND" });
        return callback(notFound, []);
      }
      if (addresses.some((entry) => isNonPublicIp(entry.address))) {
        return callback(new NonPublicAddressError(hostname) as unknown as NodeJS.ErrnoException, []);
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

let sharedAgent: Agent | null = null;

/** One pooled dispatcher whose every new socket goes through the guarded lookup. */
function publicOnlyAgent(): Agent {
  sharedAgent ??= new Agent({ connect: { lookup: publicOnlyLookup() } });
  return sharedAgent;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * A `fetch` that only reaches public addresses and never follows a redirect.
 *
 * `allowPrivate` (local development against a local model server) lifts the
 * address rule but keeps redirects an error. It is read per request when given
 * as a function, so an env flag flipped at runtime is honoured.
 */
export function createPublicOnlyFetch(
  opts: { allowPrivate?: boolean | (() => boolean) } = {},
): FetchLike {
  return async (input, init) => {
    const allowPrivate =
      typeof opts.allowPrivate === "function" ? opts.allowPrivate() : Boolean(opts.allowPrivate);
    const href = input instanceof Request ? input.url : String(input);
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new TypeError(`Refusing to fetch a ${url.protocol} URL.`);
    }

    if (!allowPrivate) {
      // Literal addresses never reach `lookup`, so they are judged here.
      const host = url.hostname.replace(/^\[|\]$/g, "");
      if (isIP(host) && isNonPublicIp(host)) throw new NonPublicAddressError(host);
    }

    const response = await undiciFetch(href, {
      ...(init as Record<string, unknown>),
      redirect: "error",
      ...(allowPrivate ? {} : { dispatcher: publicOnlyAgent() }),
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  };
}
