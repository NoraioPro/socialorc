#!/usr/bin/env bun
/**
 * SocialOrc platform compatibility + reliability audit.
 *
 * Reads source files and checks that the declared platform configs in
 * `src/types/platform.ts` are faithfully implemented in the adapters under
 * `src/lib/adapters/`. Also scans for demo/mock data and common failure modes.
 *
 * Run: `bun run scripts/audit-platforms.ts`
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Scripts live one level under the repo root, so ".." gets us to the repo root.
// `import.meta.dir` is a Bun extension and is not in the TypeScript lib, so it is
// read through a cast and falls back to the standard URL form under Node.
const SCRIPT_DIR =
  (import.meta as ImportMeta & { dir?: string }).dir ??
  dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");

const TYPES_FILE = join(ROOT, "src", "types", "platform.ts");
const ADAPTERS_DIR = join(ROOT, "src", "lib", "adapters");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read(path: string): string {
  if (!existsSync(path)) throw new Error(`Missing file: ${path}`);
  return readFileSync(path, "utf8");
}

function findAll(text: string, pattern: RegExp): string[] {
  const hits: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(
    pattern.source,
    pattern.flags + (pattern.flags.includes("g") ? "" : "g")
  );
  while ((m = re.exec(text)) !== null) hits.push(m[0]);
  return hits;
}

function grabOne(pattern: RegExp, text: string): string | undefined {
  const m = text.match(pattern);
  return m?.[1].trim();
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------

const typesSrc = read(TYPES_FILE);
const adapterFiles = [
  "linkedin.ts",
  "twitter.ts",
  "instagram.ts",
  "facebook.ts",
  "tiktok.ts",
  "youtube.ts",
  "telegram.ts",
  "mock.ts",
];
const adapterSrc = Object.fromEntries(
  adapterFiles.map((f) => [
    f.replace(/\.ts$/, ""),
    read(join(ADAPTERS_DIR, f)),
  ])
);

// ---------------------------------------------------------------------------
// 1. Extract declared configs from src/types/platform.ts
// ---------------------------------------------------------------------------

const platforms = [
  "LINKEDIN",
  "TWITTER",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "TELEGRAM",
];

type PlatformConfigPartial = {
  maxMediaCount: number;
  maxImageSizeMb: number;
  maxVideoSizeMb: number;
  supportedMediaTypes: string[];
  supportsScheduling: boolean;
  supportsVideo: boolean;
  mediaRequired: boolean;
  text: boolean;
  image: boolean;
  video: boolean;
  carousel: boolean;
  authMethod: "oauth" | "token";
  refreshableTokens: boolean;
  nativeScheduling: boolean;
};

function parsePlatformConfig(src: string, name: string): PlatformConfigPartial {
  const section = src.match(new RegExp(`${name}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`, "m"));
  const text = section ? section[1] : "";
  const num = (key: string) =>
    Number(grabOne(new RegExp(`${key}\\s*:\\s*(\\d+)`), text) ?? 0);
  const bool = (key: string) =>
    (grabOne(new RegExp(`${key}\\s*:\\s*(true|false)`), text) ?? "false") === "true";
  const arr = (key: string) => {
    const m = text.match(new RegExp(`${key}\\s*:\\s*\\[(.*?)\\]`));
    if (!m) return [] as string[];
    return m[1]
      .split(",")
      .map((s) => s.trim().replace(/["`]/g, ""))
      .filter(Boolean);
  };
  const auth = (key: string) => {
    const m = text.match(new RegExp(`${key}\\s*:\\s*"([^"]+)"`));
    return (m?.[1] ?? "oauth") as PlatformConfigPartial["authMethod"];
  };
  return {
    maxMediaCount: num("maxMediaCount"),
    maxImageSizeMb: num("maxImageSizeMb"),
    maxVideoSizeMb: num("maxVideoSizeMb"),
    supportedMediaTypes: arr("supportedMediaTypes"),
    supportsScheduling: bool("supportsScheduling"),
    supportsVideo: bool("supportsVideo"),
    mediaRequired: bool("mediaRequired"),
    text: bool("text"),
    image: bool("image"),
    video: bool("video"),
    carousel: bool("carousel"),
    authMethod: auth("authMethod"),
    refreshableTokens: bool("refreshableTokens"),
    nativeScheduling: bool("nativeScheduling"),
  };
}

// Parse the PLATFORM_CONFIGS block.
const blockMatch = typesSrc.match(
  /export\s+const\s+PLATFORM_CONFIGS\s*:\s*Record<Platform,\s*PlatformConfig>\s*=\s*\{([\s\S]*)\n\};\s*$/m
);
if (!blockMatch) {
  console.error("Could not find PLATFORM_CONFIGS block in src/types/platform.ts");
  process.exit(2);
}
const configBlock = blockMatch[1];

const declared = Object.fromEntries(
  platforms.map((p) => [p, parsePlatformConfig(configBlock, p)])
);

// ---------------------------------------------------------------------------
// 2. Read the connect-readiness tests so we can cross-check redirect URIs
// ---------------------------------------------------------------------------

const TESTS_DIR = join(ROOT, "tests", "unit");
const connectReadinessTest = join(TESTS_DIR, "connect-readiness.test.ts");
let testRedirects: Record<string, string> = {};
if (existsSync(connectReadinessTest)) {
  const testSrc = read(connectReadinessTest);
  testRedirects = Object.fromEntries(
    (testSrc.matchAll(
      /redirectUriFor\("([^"]+)"\s*as\s*Platform,\s*[^)]+\s*\)\s*,\s*"([^"]+)"/g
    ) || []).map((m) => [m[1], m[2]])
  );
}

// ---------------------------------------------------------------------------
// Findings accumulator
// ---------------------------------------------------------------------------

interface Finding {
  severity: "error" | "warn" | "info";
  platform: string;
  message: string;
  evidence?: string;
}

const findings: Finding[] = [];

// ---------------------------------------------------------------------------
// 2. Compatibility checks per platform
// ---------------------------------------------------------------------------

for (const platform of platforms) {
  const adapterKey = platform.toLowerCase();
  const src = adapterSrc[adapterKey] ?? "";
  const cfg = declared[platform];

  // --- Media requirement consistency ---
  if (cfg.mediaRequired) {
    const hasMediaGuard =
      /\b(require|need|cannot.?publish\.?\s*without|cannot.?post\.?\s*without|must).*?(media|video|image)/i
        .test(src) ||
      /\b(require|must|need)/i.test(src);
    if (!hasMediaGuard) {
      findings.push({
        severity: "warn",
        platform,
        message:
          "Declares mediaRequired=true but the adapter body does not appear to enforce a media requirement.",
      });
    }
  }

  // --- declared content capabilities vs adapter body ---
  if (!cfg.video && /video/i.test(src)) {
    const hasNoVideoNote =
      /does not support video|video is not implemented|video.*not.*implemented|video.*off|video.*false/i.test(
        src
      );
    if (!hasNoVideoNote) {
      findings.push({
        severity: "error",
        platform,
        message:
          "Config declares video=false but the adapter references video without an explicit 'not supported' note.",
      });
    }
  }

  if (!cfg.image && /image/i.test(src)) {
    const hasNoImageNote =
      /does not support image|image is not implemented|image.*not.*implemented|image.*off|image.*false/i.test(
        src
      );
    if (!hasNoImageNote) {
      findings.push({
        severity: "error",
        platform,
        message:
          "Config declares image=false but the adapter references image without an explicit 'not supported' note.",
      });
    }
  }

  if (cfg.image && cfg.supportedMediaTypes.length === 0) {
    findings.push({
      severity: "warn",
      platform,
      message: "Image is allowed in config but supportedMediaTypes is empty.",
    });
  }

  // --- Instagram: JPEG only ---
  if (platform === "INSTAGRAM") {
    const jpegOnly =
      cfg.supportedMediaTypes.length === 1 &&
      cfg.supportedMediaTypes[0] === "image/jpeg";
    if (!jpegOnly) {
      findings.push({
        severity: "error",
        platform,
        message:
          "Instagram must allow only image/jpeg per requirements (Business Graph API feeds only support JPEG).",
        evidence: `supportedMediaTypes=${JSON.stringify(cfg.supportedMediaTypes)}`,
      });
    }
    if (!cfg.mediaRequired) {
      findings.push({
        severity: "error",
        platform,
        message: "Instagram declared without mediaRequired, but Instagram feed posts require an image.",
        evidence: `mediaRequired=${cfg.mediaRequired}`,
      });
    }
  }

  // --- TikTok: video-only ---
  if (platform === "TIKTOK") {
    const videoOnly = !cfg.text && !cfg.image && cfg.video && cfg.mediaRequired;
    if (!videoOnly) {
      findings.push({
        severity: "error",
        platform,
        message: "TikTok must be video-only and require media.",
        evidence: `text=${cfg.text} image=${cfg.image} video=${cfg.video} mediaRequired=${cfg.mediaRequired}`,
      });
    }
    if (cfg.text) {
      findings.push({
        severity: "error",
        platform,
        message: "TikTok config still allows text, but TikTok feed requires a video.",
        evidence: `text=${cfg.text}`,
      });
    }
  }

  // --- YouTube: video-only ---
  if (platform === "YOUTUBE") {
    const videoOnly =
      !cfg.text && !cfg.image && cfg.video && cfg.mediaRequired && cfg.supportsVideo;
    if (!videoOnly) {
      findings.push({
        severity: "error",
        platform,
        message: "YouTube must be video-only and require media.",
        evidence: `text=${cfg.text} image=${cfg.image} video=${cfg.video} mediaRequired=${cfg.mediaRequired} supportsVideo=${cfg.supportsVideo}`,
      });
    }
  }

  // --- X/Twitter: text-only ---
  if (platform === "TWITTER") {
    const textOnly = cfg.text && !cfg.image && !cfg.video && !cfg.carousel;
    if (!textOnly) {
      findings.push({
        severity: "error",
        platform,
        message: "X/Twitter must remain text-only in the current implementation.",
        evidence: `text=${cfg.text} image=${cfg.image} video=${cfg.video} carousel=${cfg.carousel}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Mock adapter production guard
// ---------------------------------------------------------------------------

const indexSrc = read(join(ADAPTERS_DIR, "index.ts"));
const mockSrc = adapterSrc.mock ?? "";
const prodGuard = /process\.env\.NODE_ENV\s*!==\s*"production"/i;
const testGuard = /process\.env\.NODE_ENV\s*===\s*"test"/i;
const hasProductionGuard =
  prodGuard.test(indexSrc) || testGuard.test(mockSrc) || prodGuard.test(mockSrc);
if (!hasProductionGuard) {
  findings.push({
    severity: "error",
    platform: "ALL",
    message:
      "Mock adapter does not appear to be blocked in production (no NODE_ENV guard found in adapters/index.ts or adapters/mock.ts).",
  });
}

// ---------------------------------------------------------------------------
// 4. Silent-success / reliability checks
// ---------------------------------------------------------------------------

for (const [key, src] of Object.entries(adapterSrc)) {
  if (key === "mock") continue;
  const hasSuccessPath = /success:\s*true/.test(src) && /platformPostId/.test(src);
  if (!hasSuccessPath) {
    findings.push({
      severity: "warn",
      platform: key.toUpperCase(),
      message: "createPost may return success:true without a platformPostId.",
    });
  }
  if (!/validatePostContent/.test(src)) {
    findings.push({
      severity: "warn",
      platform: key.toUpperCase(),
      message: "createPost does not call validatePostContent before making the API call.",
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Redirect URI consistency with connect-readiness tests
// ---------------------------------------------------------------------------

for (const platform of platforms) {
  const lower = platform.toLowerCase();
  const routePath = join(
    ROOT,
    "src",
    "app",
    "api",
    "social",
    lower,
    "callback",
    "route.ts"
  );
  const routeExists = existsSync(routePath);

  if (platform === "TELEGRAM") {
    if (!testRedirects[platform] && !routeExists) {
      // expected: Telegram has no redirect URI
    }
    continue;
  }

  if (!routeExists) {
    findings.push({
      severity: "warn",
      platform,
      message: `Callback route file missing: ${routePath}`,
    });
    continue;
  }

  const routeSrc = read(routePath);
  const hasGET =
    /export\s+(?:const|function|async\s+function)\s+GET\s*[= \(]/.test(routeSrc);
  if (!hasGET) {
    findings.push({
      severity: "warn",
      platform,
      message: `Callback route at ${routePath} appears to miss an exported GET handler.`,
    });
  }

  const expectedUri = testRedirects[platform];
  if (expectedUri) {
    const actualUri = routeSrc.match(
      /["'`](https?:\/\/[^"']*\/api\/social\/${lower}\/callback)["'`]/i
    )?.[1];
    if (!actualUri) {
      findings.push({
        severity: "info",
        platform,
        message: `Could not extract redirect URI from callback route file for cross-check with tests.`,
      });
    } else if (actualUri !== expectedUri) {
      findings.push({
        severity: "error",
        platform,
        message: "Redirect URI in callback route does not match the URI asserted in connect-readiness tests.",
        evidence: `route: ${actualUri}\ntest:  ${expectedUri}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Demo / mock data locations
// ---------------------------------------------------------------------------

const demoTags: { file: string; hits: string[] }[] = [];
const demoPatterns = [
  /demo-[a-z-]+@socialorc\.local/g,
  /mock_[a-z_]+_[a-z]+/g,
  /mock_access_token/g,
  /mock_refresh_token/g,
  /mock_post_[a-z]+/g,
  /mock_user_[a-z]+/g,
  /socialorc\.local/g,
];
const scanFiles: { path: string; label: string }[] = [
  { path: join(ADAPTERS_DIR, "index.ts"), label: "adapters/index.ts" },
  { path: join(ADAPTERS_DIR, "mock.ts"), label: "adapters/mock.ts" },
  { path: join(ROOT, "src", "lib", "roles.ts"), label: "lib/roles.ts" },
  { path: join(ROOT, "src", "app", "api", "social", "mock", "callback", "route.ts"), label: "api/social/mock/callback/route.ts" },
];
for (const { path, label } of scanFiles) {
  if (!existsSync(path)) continue;
  const content = read(path);
  const hits = demoPatterns.flatMap((re) => findAll(content, re));
  if (hits.length) {
    demoTags.push({ file: label, hits: [...new Set(hits)] });
  }
}

// ---------------------------------------------------------------------------
// 7. Output
// ---------------------------------------------------------------------------

const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");
const infos = findings.filter((f) => f.severity === "info");

console.log("\n=== SocialOrc Platform Compatibility Audit ===\n");

console.log("Platforms audited: " + platforms.join(", "));
console.log("Declared configs:  src/types/platform.ts");
console.log("Adapters scanned:  src/lib/adapters/*.ts\n");

console.log(`Findings: ${findings.length} total — ${errors.length} error(s), ${warns.length} warning(s), ${infos.length} info(s)\n`);

if (errors.length) {
  console.log("ERRORS");
  for (const f of errors) {
    console.log(` - [${f.platform}] ${f.message}`);
    if (f.evidence) console.log(`    evidence: ${f.evidence}`);
  }
  console.log("");
}

if (warns.length) {
  console.log("WARNINGS");
  for (const f of warns) {
    console.log(` - [${f.platform}] ${f.message}`);
  }
  console.log("");
}

if (infos.length) {
  console.log("INFO");
  for (const f of infos) {
    console.log(` - [${f.platform}] ${f.message}`);
  }
  console.log("");
}

if (demoTags.length) {
  console.log("DEMO / MOCK DATA LOCATIONS");
  for (const { file, hits } of demoTags) {
    console.log(` - ${file}: ${hits.length} distinct tag(s)`);
    for (const h of hits.slice(0, 6)) console.log(`    • ${h}`);
    if (hits.length > 6) console.log(`    ... +${hits.length - 6} more`);
  }
  console.log("");
}

console.log("=== Audit complete ===\n");

process.exit(errors.length ? 1 : 0);
