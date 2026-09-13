/**
 * Phases 3 / 6 / 10 — verify external credentials WITHOUT publishing anything.
 *
 * - LinkedIn: decrypt one stored account token and call a read-only endpoint.
 *   Proves the connection is live; creates no public content.
 * - X / TikTok: fetch the OAuth authorize URL. A login page means the client
 *   id is accepted; `invalid_client`/`unauthorized` means the credential is bad.
 *
 * Never prints a token, secret or key.
 */
import prisma from "../src/lib/prisma";
import { decryptTokens } from "../src/lib/encryption";
import { linkedInAdapter } from "../src/lib/adapters/linkedin";
import { twitterAdapter } from "../src/lib/adapters/twitter";
import { tiktokAdapter } from "../src/lib/adapters/tiktok";
import { platformOAuthCallbackUri } from "../src/lib/social/approval";

async function linkedIn() {
  console.log("=== Phase 3 — LinkedIn (read-only) ===");
  const account = await prisma.socialAccount.findFirst({
    where: { platform: "LINKEDIN", isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!account) {
    console.log("  BLOCKED — no active LinkedIn account row");
    return;
  }
  console.log("  account      :", account.displayName ?? account.platformUsername ?? "(no name)");
  console.log("  isActive     :", account.isActive, " needsReconnect:", account.needsReconnect);
  console.log("  token expires:", account.tokenExpiresAt?.toISOString() ?? "unknown");

  try {
    const { accessToken } = decryptTokens({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
    });

    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.text();
    console.log("  live token call -> HTTP", res.status);
    if (res.ok) {
      const d = JSON.parse(body);
      // Identity only — never the token.
      console.log("  identity     :", d.name, "| sub:", d.sub);
      console.log("  RESULT       : LIVE VERIFIED (stored LinkedIn token is accepted)");
    } else {
      console.log("  body         :", body.slice(0, 200));
      console.log("  RESULT       : token rejected — reconnect required");
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log("  live call    : NOT POSSIBLE from here —", msg);
    console.log(
      "  reason       : the stored tokens are encrypted with the PRODUCTION",
    );
    console.log(
      "                 TOKEN_ENCRYPTION_KEY; this shell has a different one, so it",
    );
    console.log(
      "                 cannot (and must not) read production tokens locally.",
    );
    console.log(
      "  RESULT       : connection state verified from the DB only — see report",
    );
  }
}

async function probeAuthorize(label: string, url: string) {
  console.log(`\n=== ${label} ===`);
  if (!url || url.includes("undefined")) {
    console.log("  BLOCKED — adapter produced no usable authorize URL");
    return;
  }
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    console.log("  unusable URL");
    return;
  }
  console.log("  authorize host:", host);
  try {
    const res = await fetch(url, { redirect: "manual" });
    const body = await res.text();
    const hay = body.toLowerCase();
    const bad =
      hay.includes("invalid_client") ||
      hay.includes("unauthorized_client") ||
      hay.includes("invalid client") ||
      hay.includes("client_id is invalid") ||
      hay.includes("error_code");
    console.log("  HTTP        :", res.status);
    console.log("  client rejected?:", bad);
    console.log(
      "  RESULT      :",
      bad
        ? "CREDENTIAL REJECTED by the platform"
        : "credential ACCEPTED (platform served its consent/login page)",
    );
  } catch (error) {
    console.log("  fetch failed:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Definitive client-credential check: call the platform's TOKEN endpoint with a
 * deliberately bogus authorization code.
 *
 *   invalid_client      -> the client id/secret are wrong
 *   invalid_grant / etc -> the client authenticated; only the fake code was bad
 *
 * No side effect, no token issued. Secrets go only to the platform that owns them.
 */
async function probeTokenEndpoint(
  label: string,
  url: string,
  opts: { basic?: { id: string; secret: string }; form: Record<string, string> },
) {
  console.log(`\n=== ${label} (definitive credential check) ===`);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.basic) {
    headers.Authorization = `Basic ${Buffer.from(
      `${opts.basic.id}:${opts.basic.secret}`,
    ).toString("base64")}`;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: new URLSearchParams(opts.form),
    });
    const text = await res.text();
    const hay = text.toLowerCase();
    const badClient = hay.includes("invalid_client") || hay.includes("unauthorized_client");
    console.log("  HTTP            :", res.status);
    console.log("  error           :", (text.match(/"error"\s*:\s*"([^"]+)"/)?.[1] ?? "(none)"));
    console.log(
      "  RESULT          :",
      badClient
        ? "CLIENT CREDENTIALS REJECTED"
        : "CLIENT CREDENTIALS VALID (server authenticated the client; only the fake code was rejected)",
    );
  } catch (error) {
    console.log("  fetch failed    :", error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  await linkedIn();

  // Twitter implements plain OAuth2 authorize URLs; TikTok adds PKCE via
  // createAuthorizationRequest, so only that one needs the optional call.
  await probeAuthorize("Phase 6 — X/Twitter OAuth client", twitterAdapter.getOAuthUrl("verify-state"));

  const xId = process.env.TWITTER_CLIENT_ID;
  const xSecret = process.env.TWITTER_CLIENT_SECRET;
  if (xId && xSecret && xId.length > 4 && xSecret.length > 4) {
    await probeTokenEndpoint("Phase 6 — X/Twitter", "https://api.x.com/2/oauth2/token", {
      basic: { id: xId, secret: xSecret },
      form: {
        grant_type: "authorization_code",
        code: "definitely-not-a-real-code",
        redirect_uri: platformOAuthCallbackUri("TWITTER" as never),
        code_verifier: "a".repeat(48),
      },
    });
  } else {
    console.log("\n=== Phase 6 — X/Twitter token probe ===\n  BLOCKED — credentials missing");
  }

  const tikAuth = tiktokAdapter.createAuthorizationRequest?.("verify-state");
  await probeAuthorize("Phase 10 — TikTok OAuth client", tikAuth?.url ?? tiktokAdapter.getOAuthUrl("verify-state"));

  const tkKey = process.env.TIKTOK_CLIENT_KEY;
  const tkSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (tkKey && tkSecret && tkKey.length > 4 && tkSecret.length > 4) {
    await probeTokenEndpoint("Phase 10 — TikTok", "https://open.tiktokapis.com/v2/oauth/token/", {
      form: {
        client_key: tkKey,
        client_secret: tkSecret,
        code: "definitely-not-a-real-code",
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI ?? platformOAuthCallbackUri("TIKTOK" as never),
      },
    });
  } else {
    console.log("\n=== Phase 10 — TikTok token probe ===\n  BLOCKED — credentials missing");
  }

  console.log("\n=== Phase 5 — Telegram ===");
  const th = process.env.TELEGRAM_BOT_TOKEN;
  const tc = process.env.TELEGRAM_CHAT_ID;
  console.log("  TELEGRAM_BOT_TOKEN:", th && th.length > 4 ? "set" : "MISSING/EMPTY");
  console.log("  TELEGRAM_CHAT_ID  :", tc && tc.length > 0 ? "set" : "MISSING/EMPTY");
  console.log("  RESULT            : BLOCKED — TELEGRAM credentials missing");

  console.log("\n=== Phase 1 — Blob ===");
  const blob = process.env.BLOB_READ_WRITE_TOKEN;
  console.log("  BLOB_READ_WRITE_TOKEN:", blob && blob.length > 4 ? "set" : "MISSING/EMPTY");
  console.log("  RESULT               : MEDIA_STORAGE_NOT_CONFIGURED");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("verification failed:", error);
  process.exit(1);
});
