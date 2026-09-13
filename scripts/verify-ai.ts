/**
 * Phase 2 — verify the AI path actually reaches a real provider.
 * Never prints key material; only whether a real completion came back.
 */
import {
  aiStudioGenerate,
  improveContent,
  isOpenAIAvailable,
  isMockAIAllowed,
} from "../src/lib/ai";
import { cascadeContent } from "../src/lib/cascade";
import { Platform } from "@prisma/client";

// Wrapped: this repo's tsx transform emits CJS, which forbids top-level await.
async function main() {
const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Print provider details WITHOUT leaking the key or a full private URL.
let host = "unknown";
try {
  host = new URL(base).host;
} catch {
  host = "<unparseable>";
}

console.log("=== AI configuration (no secrets shown) ===");
console.log("  OPENAI_API_KEY set :", isOpenAIAvailable());
console.log("  mock AI allowed    :", isMockAIAllowed(), `(NODE_ENV=${process.env.NODE_ENV})`);
console.log("  OPENAI_MODEL       :", model);
console.log("  OPENAI_BASE_URL host:", host);

const t0 = Date.now();
try {
  const res = await aiStudioGenerate({
    idea: "Announce that our new scheduling feature is live",
    platforms: [Platform.LINKEDIN, Platform.TWITTER],
    tone: "professional",
  });
  const ms = Date.now() - t0;

  console.log("\n=== aiStudioGenerate ===");
  console.log("  usedMock    :", res.usedMock, res.usedMock ? "<< MOCK — NOT REAL AI" : "(real provider)");
  console.log("  variants    :", res.variants.length);
  console.log("  latency     :", ms, "ms");
  for (const v of res.variants.slice(0, 3)) {
    const text = (v.content ?? "").replace(/\s+/g, " ").slice(0, 90);
    console.log(`    ${v.platform}: ${text}${(v.content ?? "").length > 90 ? "…" : ""}`);
  }
  // Every variant must be unique text, which random mock templates rarely are.
  const uniq = new Set(res.variants.map((v) => v.content));
  console.log("  unique texts:", uniq.size, "/", res.variants.length);
} catch (error) {
  console.log("\n=== aiStudioGenerate FAILED ===");
  console.log("  ", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

const t1 = Date.now();
try {
  const imp = await improveContent(
    "we have a new feature. it is good. try it",
    Platform.LINKEDIN,
    "make it punchy and professional",
  );
  console.log("\n=== improveContent ===");
  console.log("  isMock  :", imp.isMock, imp.isMock ? "<< MOCK — NOT REAL AI" : "(real provider)");
  console.log("  latency :", Date.now() - t1, "ms");
  console.log("  output  :", imp.content.replace(/\s+/g, " ").slice(0, 140));
} catch (error) {
  console.log("\n=== improveContent FAILED ===");
  console.log("  ", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

const t2 = Date.now();
try {
  const cas = await cascadeContent(
    { content: "Our new scheduling feature is live.", platform: Platform.LINKEDIN },
    [Platform.TWITTER, Platform.FACEBOOK],
  );
  console.log("\n=== cascadeContent ===");
  console.log("  adaptations:", cas.adaptations.length, " latency:", Date.now() - t2, "ms");
  for (const a of cas.adaptations) {
    const text = (a.content ?? "").replace(/\s+/g, " ").slice(0, 80);
    console.log(`    ${a.platform}: ${text}${(a.content ?? "").length > 80 ? "…" : ""}`);
  }
} catch (error) {
  console.log("\n=== cascadeContent FAILED ===");
  console.log("  ", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}
}

main().catch((error) => {
  console.error("verification script failed:", error);
  process.exit(1);
});
