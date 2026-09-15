/**
 * Connection readiness for every platform connector.
 *
 * Prints, per platform: whether credentials are complete, the EXACT redirect URI
 * the app sends (the value that must be registered with the provider - a mismatch
 * is the most common cause of a failed connection), the authorize host, and the
 * declared capabilities. Client ids are masked; no secret is printed.
 *
 * Then it reports the production callback that the provider will call back to.
 */
import { Platform } from "@prisma/client";
import { getAdapter } from "../src/lib/adapters";
import { platformOAuthCallbackUri } from "../src/lib/social/approval";
import { PLATFORM_CONFIGS } from "../src/types/platform";

const PLATFORMS: Platform[] = [
  Platform.LINKEDIN,
  Platform.TWITTER,
  Platform.FACEBOOK,
  Platform.INSTAGRAM,
  Platform.YOUTUBE,
  Platform.TIKTOK,
  Platform.TELEGRAM,
];

function mask(value: string | undefined): string {
  if (!value) return "<missing>";
  if (value.length <= 8) return `${value.slice(0, 2)}…(${value.length} chars)`;
  return `${value.slice(0, 4)}…${value.slice(-3)} (${value.length} chars)`;
}

async function main() {
  const base = process.env.APP_URL ?? "https://www.socialork.com";
  console.log(`=== connection readiness (APP_URL=${base}) ===\n`);

  for (const platform of PLATFORMS) {
    const adapter = getAdapter(platform, { useMockIfUnconfigured: false });
    const validation =
      "validateCredentialsExtended" in adapter
        ? (adapter as unknown as { validateCredentialsExtended: () => { valid: boolean; missing: string[] } })
            .validateCredentialsExtended()
        : adapter.validateCredentials();

    const configured = validation.valid;
    const config = PLATFORM_CONFIGS[platform];

    console.log(`${platform}`);
    console.log(`  credentials      : ${configured ? "CONFIGURED" : "MISSING"}`);
    if (!configured && validation.missing?.length) {
      console.log(`  missing          : ${validation.missing.join(", ")}`);
    }
    console.log(`  redirect uri     : ${platformOAuthCallbackUri(platform)}`);

    if (platform === Platform.TELEGRAM) {
      console.log(`  connect mode     : non-OAuth (bot token + chat id)`);
    } else {
      try {
        const url = new URL(adapter.getOAuthUrl("readiness-probe"));
        const clientId =
          url.searchParams.get("client_id") ?? url.searchParams.get("client_key") ?? undefined;
        console.log(`  authorize host   : ${url.host}`);
        console.log(`  client id        : ${mask(clientId ?? undefined)}`);
        const scope = url.searchParams.get("scope");
        if (scope) console.log(`  scopes           : ${scope.replace(/\s+/g, " ")}`);
        console.log(`  pkce             : ${url.searchParams.has("code_challenge") ? "yes" : "no"}`);
      } catch (error) {
        console.log(
          `  authorize url    : not buildable - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const caps = config?.capabilities;
    if (caps) {
      const on = Object.entries(caps)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      console.log(`  capabilities     : ${on.join(", ") || "none"}`);
    }
    console.log();
  }
}

main().catch((error) => {
  console.error("readiness probe failed:", error);
  process.exit(1);
});
