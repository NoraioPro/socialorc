#!/usr/bin/env node
/**
 * Switch a social connector on in Production.
 *
 *   npm run connector:setup -- youtube
 *   npm run connector:setup -- meta --dry-run
 *
 * Shows where to create the app and exactly what to register (redirect URIs,
 * scopes), asks for the credentials with hidden input, checks their shape and
 * stores them as Sensitive Production variables with the Vercel CLI. Values go to
 * the CLI on stdin: never on a command line, in a log or in a file. Run it
 * yourself from a linked checkout (`vercel link`). It does not redeploy.
 */
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import { CONNECTORS, redirectUris, variableProblem } from "./connector-setup-data.mjs";

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const appUrl = (process.env.APP_URL || "https://www.socialork.com").replace(/\/+$/, "");
const scopeFlag = args.find((a) => a.startsWith("--scope="));
const vercelScope = scopeFlag ? scopeFlag.slice("--scope=".length) : "noraios-projects";

const connector = key ? CONNECTORS[key] : undefined;
if (!connector) {
  console.error(`Usage: npm run connector:setup -- <${Object.keys(CONNECTORS).join("|")}> [--dry-run]`);
  process.exit(1);
}

console.log(`\n${connector.label}\n${"=".repeat(connector.label.length)}`);
console.log(`1. Open ${connector.portal}`);
connector.steps.forEach((s, i) => console.log(`   ${String.fromCharCode(97 + i)}. ${s}`));
console.log("\nRegister these redirect URIs exactly:");
redirectUris(connector, appUrl).forEach((u) => console.log(`   ${u}`));
console.log(`\nScopes the app requests:\n   ${connector.scopes}`);
console.log(`\nApproval: ${connector.approval}\n`);

if (dryRun) {
  console.log("Variables that would be set in Production (Sensitive):");
  [...connector.vars, ...(connector.flags ?? [])].forEach((v) => console.log(`   ${v.name}`));
  console.log("\n--dry-run: nothing was asked or stored.");
  process.exit(0);
}

// One readline interface for every prompt: a second one would drop input that
// the first had already buffered. `muted` hides what is typed for secrets.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
let muted = false;
const writeToOutput = rl._writeToOutput?.bind(rl);
rl._writeToOutput = (text) => {
  if (!muted) writeToOutput?.(text);
};
const lines = rl[Symbol.asyncIterator]();

async function prompt(text, { hidden = false } = {}) {
  process.stdout.write(text);
  muted = hidden;
  const { value, done } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  if (done) throw new Error("Input ended before every value was entered.");
  return String(value).trim();
}

const askHidden = (text) => prompt(text, { hidden: true });
const ask = (text) => prompt(text);

function store(name, value) {
  const result = spawnSync(
    "vercel",
    ["env", "add", name, "production", "--sensitive", "--force", "--yes", "--scope", vercelScope],
    { input: value, encoding: "utf8" },
  );
  if (result.status !== 0) {
    // Never echo the CLI's output: it is not expected to contain the value, but it is not worth the risk.
    console.error(`   FAILED to store ${name} (vercel exit ${result.status}). Is this folder linked (vercel link)?`);
    return false;
  }
  console.log(`   stored ${name}`);
  return true;
}

const values = [];
for (const v of connector.vars) {
  for (;;) {
    const value = await askHidden(`${v.label} (${v.name}): `);
    const problem = variableProblem(v, value);
    if (!problem) {
      values.push([v.name, value]);
      break;
    }
    console.log(`   That value ${problem}. Try again, or press Ctrl+C to stop.`);
  }
}
for (const flag of connector.flags ?? []) {
  const answer = (await ask(`${flag.label}? [y/N] `)).toLowerCase();
  if (answer === "y" || answer === "yes") values.push([flag.name, "true"]);
}

console.log("\nStoring in Vercel Production…");
let ok = true;
for (const [name, value] of values) ok = store(name, value) && ok;

console.log(
  ok
    ? `\nDone. Redeploy for it to take effect (vercel deploy --prod, or Redeploy in the dashboard). Then Settings, Accounts shows Connect for ${connector.label}.`
    : "\nSome variables were not stored. Fix the error above and run this again.",
);
rl.close();
process.exit(ok ? 0 : 1);
