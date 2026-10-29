import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateTelegramCredentials } from "../../src/lib/adapters/credentials";

/**
 * Each customer connects their own Telegram bot. These pin the properties that
 * make that true: no deployment-wide bot token anywhere, the token stored
 * encrypted on the account it belongs to, and never sent back to a browser. The
 * live behaviour (connect, publish now, scheduled publish, disconnect, two
 * workspaces) is exercised against the real Telegram API by the e2e suites.
 */

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("Telegram uses the customer's own bot", () => {
  it("no code path reads a deployment-wide bot token or chat id", () => {
    for (const file of sourceFiles("src")) {
      const code = strip(fs.readFileSync(file, "utf8"));
      assert.equal(/process\.env\.TELEGRAM_BOT_TOKEN/.test(code), false, `${file} reads TELEGRAM_BOT_TOKEN`);
      assert.equal(/process\.env\.TELEGRAM_CHAT_ID/.test(code), false, `${file} reads TELEGRAM_CHAT_ID`);
    }
  });

  it("Telegram is available without any deployment credential", () => {
    assert.deepEqual(validateTelegramCredentials(), { valid: true, missing: [], invalid: [] });
  });

  it("the connect route validates with Telegram, encrypts the token onto the account and marks it as the customer's own", () => {
    const route = strip(fs.readFileSync("src/app/api/social/telegram/connect/route.ts", "utf8"));
    assert.match(route, /requireWorkspace\("accounts:connect"\)/);
    assert.match(route, /readTelegramState\(req, body\?\.state, guard\.userId\)/);
    assert.match(route, /getAccountInfo\(token\)/, "the token is checked against Telegram before it is saved");
    assert.match(route, /verifyTelegramDestination\(/, "the bot's right to post in the chat is checked");
    assert.match(route, /encryptTokens\(\{ accessToken: token/);
    assert.match(route, /workspaceId: guard\.workspaceId/);
    assert.match(route, /tokenSource: "own"/);
    assert.match(route, /ACCOUNT_OWNED_ELSEWHERE/);
  });

  it("the connect route never returns or logs the token", () => {
    const route = strip(fs.readFileSync("src/app/api/social/telegram/connect/route.ts", "utf8"));
    const json = route.slice(route.indexOf("NextResponse.json({\n      success: true"));
    assert.equal(/token/i.test(json.slice(0, json.indexOf("});"))), false, "the success body names no token");
    for (const log of route.match(/console\.(error|warn|log)\([^;]*;/g) ?? []) {
      assert.equal(/\btoken\b|botToken/.test(log.replace(/"[^"]*"/g, "")), false, `a log call includes the token: ${log}`);
    }
  });

  it("the connect dialog posts the token only to the connect route and clears it afterwards", () => {
    const dialog = fs.readFileSync("src/components/settings/telegram-connect-dialog.tsx", "utf8");
    assert.match(dialog, /type="password"/);
    assert.match(dialog, /\/api\/social\/telegram\/connect"/);
    assert.match(dialog, /setBotToken\(""\)/);
    assert.equal(/localStorage|sessionStorage|console\./.test(dialog), false);
  });

  it("the accounts listing exposes neither the token nor the metadata, only the shared-bot flag", () => {
    const route = strip(fs.readFileSync("src/app/api/accounts/route.ts", "utf8"));
    const response = route.slice(route.indexOf("const accounts = rawAccounts.map"), route.indexOf("const platformStatus"));
    assert.equal(/accessToken/.test(response.replace(/tokens\.accessToken/g, "")), false);
    assert.equal(/metadata:/.test(response), false, "metadata is read for the flag, never returned");
    assert.match(response, /sharedBot:/);
  });

  it("publishing resolves the account's own token, for the worker and for publish-now", () => {
    for (const file of ["src/app/api/cron/publish/route.ts", "src/app/api/posts/[id]/publish/route.ts"]) {
      const code = strip(fs.readFileSync(file, "utf8"));
      assert.match(code, /decryptTokens\(/, `${file} decrypts the account's stored token`);
      assert.match(code, /createPost\(/);
    }
  });
});
