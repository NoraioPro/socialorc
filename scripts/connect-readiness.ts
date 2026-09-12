/**
 * One-click-connect readiness check.
 *
 * Run from a checkout to see, for every connectable platform, whether the app is
 * configured and exactly which redirect URI must be registered in that
 * platform's developer portal. Needs no server and no credentials — it reads the
 * same code the app runs, so it cannot drift from reality.
 *
 *   npx tsx scripts/connect-readiness.ts
 *   npx tsx scripts/connect-readiness.ts --json
 *
 * Exit code 0 when every platform is ready, 1 when something still needs setup,
 * so it can gate a deploy.
 */

import "dotenv/config";

import { Platform } from "@prisma/client";
import { getAdapterStatus } from "../src/lib/adapters";
import { capabilitiesFor } from "../src/lib/social/capabilities";
import { appApprovalFor, appOrigin } from "../src/lib/social/approval";
import { CONNECTABLE_PLATFORMS, buildReadinessReport } from "../src/lib/social/status";

const asJson = process.argv.includes("--json");

const credentialStatus = getAdapterStatus();

const report = buildReadinessReport(CONNECTABLE_PLATFORMS, {
  credentialStatus: (platform) => credentialStatus[platform] ?? { configured: false, missing: [] },
  capabilities: (platform, approval) => {
    const capabilities = capabilitiesFor(platform, { scopes: [], approval });
    return { capabilities: capabilities.capabilities, limitations: capabilities.limitations };
  },
  approval: (platform) => appApprovalFor(platform),
  appUrl: appOrigin(),
});

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nOne-click connect readiness — app URL ${report.appUrl}\n`);
  console.log(
    `${"PLATFORM".padEnd(11)} ${"STATE".padEnd(12)} ${"METHOD".padEnd(10)} WHAT TO REGISTER / FIX`,
  );
  console.log("-".repeat(100));

  for (const row of report.platforms) {
    const target =
      row.state === "needs_setup"
        ? `set ${row.missing.join(", ") || "(no credential check implemented)"}`
        : row.redirectUri
          ? `redirect URI: ${row.redirectUri}`
          : "no redirect URI (token based)";

    console.log(`${row.platform.padEnd(11)} ${row.state.padEnd(12)} ${row.method.padEnd(10)} ${target}`);
    if (row.state === "ready" && row.redirectUri) {
      console.log(`${" ".repeat(35)}${row.summary}`);
    }
  }

  const publishBlocked = report.platforms.filter(
    (row) => row.state === "ready" && !row.approval.directPublish,
  );
  if (publishBlocked.length > 0) {
    console.log(
      `\nCan connect but cannot publish yet (platform app review outstanding): ${publishBlocked
        .map((row) => row.platform)
        .join(", ")}`,
    );
  }

  console.log(
    `\nready: ${report.totals.ready}/${report.totals.platforms}   needs setup: ${report.totals.needsSetup}   accounts already connected: ${report.totals.connected}\n`,
  );
}

process.exit(report.totals.needsSetup === 0 ? 0 : 1);
