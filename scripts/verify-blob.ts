/**
 * Real Blob verification against the production store.
 *
 * Uses the same @vercel/blob `put()` call and the same `access: "public"` option
 * the media route uses, with the production read-write token supplied through
 * the environment. Nothing is printed except URLs, statuses and byte counts -
 * never the token.
 *
 * The uploaded test objects are deleted again at the end.
 */
import { put, del } from "@vercel/blob";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  console.log("=== Blob configuration ===");
  console.log("  BLOB_READ_WRITE_TOKEN set :", Boolean(token));
  if (!token || token.length < 10) {
    console.log("  RESULT: MEDIA_STORAGE_NOT_CONFIGURED (no usable token)");
    return;
  }

  const created: string[] = [];

  async function upload(label: string, file: string, contentType: string) {
    if (!existsSync(file)) {
      console.log(`\n=== ${label} ===\n  skipped: ${file} not present`);
      return;
    }
    const bytes = readFileSync(file);
    const pathname = `socialorc/activation-probe/${Date.now()}-${label.replace(/\W+/g, "-").toLowerCase()}`;

    const started = Date.now();
    const blob = await put(pathname, bytes, {
      access: "public",
      contentType,
      token,
    });
    const ms = Date.now() - started;
    created.push(blob.url);

    console.log(`\n=== ${label} ===`);
    console.log("  uploaded bytes :", bytes.byteLength);
    console.log("  contentType sent:", contentType);
    console.log("  returned url    :", blob.url);
    console.log("  is https        :", blob.url.startsWith("https://"));
    console.log("  is a data: URL  :", blob.url.startsWith("data:"));
    console.log("  pathname        :", blob.pathname);
    console.log("  upload latency  :", ms, "ms");

    // Social platforms fetch this URL, so prove it is really reachable.
    const res = await fetch(blob.url);
    const body = await res.arrayBuffer();
    console.log("  GET status      :", res.status);
    console.log("  served type     :", res.headers.get("content-type"));
    console.log("  served bytes    :", body.byteLength);
    console.log(
      "  round trip ok   :",
      res.ok && body.byteLength === bytes.byteLength ? "YES" : "NO",
    );
  }

  await upload("probe image", "/tmp/px.png", "image/png");

  // A real (tiny) MP4 if ffmpeg is available, so the video path is exercised
  // with genuine video bytes rather than a mislabelled placeholder.
  let haveVideo = existsSync("/tmp/probe.mp4");
  if (!haveVideo) {
    try {
      execFileSync(
        "ffmpeg",
        ["-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1", "-pix_fmt", "yuv420p", "/tmp/probe.mp4"],
        { stdio: "ignore" },
      );
      haveVideo = existsSync("/tmp/probe.mp4");
    } catch {
      haveVideo = false;
    }
  }
  if (haveVideo) {
    await upload("probe video", "/tmp/probe.mp4", "video/mp4");
  } else {
    console.log("\n=== probe video ===");
    console.log("  skipped: ffmpeg unavailable, so no genuine video bytes to upload");
  }

  console.log("\n=== cleanup (remove the test objects) ===");
  for (const url of created) {
    await del(url, { token });
    const after = await fetch(url);
    console.log("  deleted, GET now:", after.status, "->", url.slice(0, 70));
  }
}

main().catch((error) => {
  console.error("blob verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
