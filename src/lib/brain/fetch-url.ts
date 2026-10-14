/**
 * Fetch a public web page for the Brand Brain — without becoming an SSRF probe.
 *
 * The URL comes from a form, and the server fetches it, so:
 *   - https only, no credentials in the URL, default port only;
 *   - the host may not be a private/loopback/link-local/CGNAT/multicast IP
 *     literal or a `localhost`/`*.local`/`*.internal` name (the same rules as
 *     AI base URLs, src/lib/ai-base-url.ts);
 *   - the address the socket actually connects to is checked: DNS resolution
 *     goes through `guardedLookup`, so a name that resolves to 10.0.0.5 — or
 *     rebinds to it between a check and the connect — is refused at connect time;
 *   - every redirect hop is re-validated, at most MAX_REDIRECTS of them;
 *   - a hard wall-clock timeout and a byte cap on the body;
 *   - only text/html, text/plain and markdown are accepted.
 */

import https from "node:https";
import dns from "node:dns";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import type { IncomingMessage } from "node:http";
import { aiBaseUrlProblem, isNonPublicIp } from "@/lib/ai-base-url";
import { extractText } from "./ingest";

export const URL_FETCH_TIMEOUT_MS = 10_000;
export const URL_FETCH_MAX_BYTES = 2_000_000;
export const MAX_REDIRECTS = 3;

export class UrlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlFetchError";
  }
}

/** Synchronous checks on the URL text. Returns a user-facing problem, or null. */
export function knowledgeUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That is not a valid URL.";
  }
  if (url.protocol !== "https:") return "Only https:// pages can be added.";
  if (url.port && url.port !== "443") return "Only pages on the standard https port can be added.";
  const problem = aiBaseUrlProblem(value, { allowPrivate: false });
  if (problem) return problem.replace(/^The base URL/, "The URL").replace(/base URL/g, "URL");
  return null;
}

type BaseLookup = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * A `lookup` for the socket that refuses non-public addresses. Used as the
 * request's own resolver, so the checked address is the connected address.
 */
export function guardedLookup(base: BaseLookup = dns.lookup as unknown as BaseLookup): LookupFunction {
  const lookup = (
    hostname: string,
    options: dns.LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    base(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses ?? [];
      if (list.length === 0) {
        return callback(new UrlFetchError(`${hostname} did not resolve.`), "", 0);
      }
      if (list.some((entry) => isNonPublicIp(entry.address))) {
        return callback(
          new UrlFetchError(`${hostname} resolves to a private, loopback or link-local address, so it cannot be fetched.`),
          "",
          0,
        );
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
  return lookup as unknown as LookupFunction;
}

const ACCEPTED = /^(text\/html|application\/xhtml\+xml|text\/plain|text\/markdown|text\/x-markdown)\b/i;

interface RawPage {
  url: string;
  contentType: string;
  body: string;
}

function requestOnce(
  url: URL,
  lookup: LookupFunction,
  signal: AbortSignal,
  maxBytes: number,
): Promise<{ status: number; location?: string; contentType: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup,
        signal,
        headers: {
          "User-Agent": "SocialOrc-BrandBrain/1.0 (+knowledge source fetch)",
          Accept: "text/html,text/plain,text/markdown;q=0.9,*/*;q=0.1",
        },
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ status, contentType });
        }
        if (!ACCEPTED.test(contentType)) {
          res.destroy();
          return reject(new UrlFetchError(`That page is ${contentType || "an unknown type"}; only HTML and plain-text pages can be added.`));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new UrlFetchError(`That page is larger than ${Math.round(maxBytes / 1_000_000)} MB.`));
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (part: Buffer) => {
          size += part.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new UrlFetchError(`That page is larger than ${Math.round(maxBytes / 1_000_000)} MB.`));
            return;
          }
          parts.push(part);
        });
        res.on("end", () => resolve({ status, contentType, body: Buffer.concat(parts).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

export interface FetchPageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  /** Injected in tests; production resolves through the real DNS. */
  lookup?: LookupFunction;
}

/** Fetch the raw page, following and re-validating redirects. */
export async function fetchPublicPage(rawUrl: string, options: FetchPageOptions = {}): Promise<RawPage> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? URL_FETCH_TIMEOUT_MS);
  const lookup = options.lookup ?? guardedLookup();
  const maxBytes = options.maxBytes ?? URL_FETCH_MAX_BYTES;

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = knowledgeUrlProblem(current);
    if (problem) throw new UrlFetchError(hop === 0 ? problem : `The page redirected somewhere that cannot be fetched: ${problem}`);

    let response;
    try {
      response = await requestOnce(new URL(current), lookup, signal, maxBytes);
    } catch (error) {
      if (error instanceof UrlFetchError) throw error;
      if (signal.aborted) throw new UrlFetchError("The page took too long to respond.");
      const message = error instanceof Error ? error.message : String(error);
      throw new UrlFetchError(`The page could not be fetched: ${message}`);
    }

    if (response.location !== undefined) {
      current = new URL(response.location, current).toString();
      continue;
    }
    if (response.body === undefined) {
      throw new UrlFetchError(`The page answered with HTTP ${response.status}.`);
    }
    return { url: current, contentType: response.contentType, body: response.body };
  }
  throw new UrlFetchError(`The page redirected more than ${MAX_REDIRECTS} times.`);
}

/** The page's <title>, if any, decoded minimally. */
export function htmlTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = match[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
  return title || null;
}

/** Turn a fetched page into the text and a title for ingestion. */
export function pageToText(page: RawPage): { title: string; text: string } {
  const isHtml = /html/i.test(page.contentType);
  const { text } = extractText(isHtml ? "page.html" : "page.txt", page.body);
  const title = (isHtml ? htmlTitle(page.body) : null) ?? new URL(page.url).hostname;
  return { title: title.slice(0, 200), text };
}
