/**
 * What each channel actually accepts, in the words a writer can act on.
 *
 * The data existed but only as enforcement: `PLATFORM_CONFIGS[p].capabilities`
 * decides what the adapter will send, and the error a writer saw was
 * "Unsupported media type for Instagram: image/png" — after writing the post,
 * attaching the image and pressing publish. The specification has to be visible
 * while the post is being written, for the channels the writer picked.
 *
 * Pure: no React, no fetch, no env. `platformSpec()` and `mediaProblems()` are
 * unit-tested, and the composer only renders what they return.
 */
import { Platform } from "@prisma/client";

import { PLATFORM_CONFIGS } from "@/types/platform";

export type PlatformSpec = {
  platform: Platform;
  name: string;
  /** One line a writer can read at a glance. */
  summary: string;
  /** What may be attached, in plain words. */
  media: string;
  /** Things that will be rejected, phrased as instructions. */
  rules: string[];
  allowsTextOnly: boolean;
  /** MIME types the connector will send. Empty = no attachments. */
  acceptedMime: string[];
  maxCaption?: number;
};

const SPECS: Record<Platform, Omit<PlatformSpec, "platform" | "name" | "allowsTextOnly">> = {
  LINKEDIN: {
    summary: "Text, images, video, documents",
    media: "Images (JPEG/PNG) or one video (MP4/MOV, up to 15 min)",
    rules: ["Documents and multi-image carousels are supported"],
    acceptedMime: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "video/quicktime",
    ],
  },
  TWITTER: {
    summary: "Short text, up to 4 images or 1 video",
    media: "Up to 4 images (JPEG/PNG/GIF/WebP) or one video (MP4/MOV)",
    rules: ["Images and video cannot be mixed in one post"],
    acceptedMime: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ],
  },
  INSTAGRAM: {
    summary: "Media only — JPEG image or MP4/MOV video",
    media: "One image (JPEG only) or one video (MP4/MOV, for Reels)",
    rules: [
      "Text-only posts are not possible — a caption needs an image or video",
      "PNG, WebP and GIF are rejected by Instagram; export as JPEG",
    ],
    acceptedMime: ["image/jpeg", "video/mp4", "video/quicktime"],
    maxCaption: 2200,
  },
  FACEBOOK: {
    summary: "Text, up to 4 images, or one video",
    media: "Up to 4 images (JPEG/PNG/WebP) or one video (MP4/MOV)",
    rules: ["Photos and video cannot be mixed in one post", "Alt text only applies to photo uploads"],
    acceptedMime: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
    ],
  },
  YOUTUBE: {
    summary: "Video only — no text-only, no images",
    media: "One video (MP4/MOV)",
    rules: [
      "A title and description are the text; the post itself must be a video",
      "Until the Google app is verified, uploads land as private",
    ],
    acceptedMime: ["video/mp4", "video/quicktime"],
  },
  TIKTOK: {
    summary: "Video, or a photo carousel — no text-only",
    media: "One video (MP4/MOV), or 2–35 photos",
    rules: ["Until TikTok's audit passes, posts are SELF_ONLY — only the author sees them"],
    acceptedMime: ["video/mp4", "video/quicktime", "image/jpeg", "image/webp"],
  },
  TELEGRAM: {
    summary: "Text, photo, video or an album",
    media: "Photo up to 10 MB, video up to 50 MB, album of 2–10 items",
    rules: ["The album limit is 10 items, larger sets are rejected"],
    acceptedMime: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
    ],
  },
};

export function platformSpec(platform: Platform): PlatformSpec {
  const config = PLATFORM_CONFIGS[platform];
  const spec = SPECS[platform];
  const capabilities = config?.capabilities;
  return {
    platform,
    name: config?.name ?? platform,
    summary: spec.summary,
    media: spec.media,
    rules: spec.rules,
    // The adapter is the final word on whether text alone is allowed.
    allowsTextOnly: Boolean(capabilities?.text) && !capabilities?.mediaRequired,
    acceptedMime: spec.acceptedMime,
    maxCaption: spec.maxCaption,
  };
}

export type AttachedMedia = { mimeType: string; filename?: string };

/** Reader-facing format names: "QUICKTIME" is not a word anyone uses. */
const FORMAT_LABELS: Record<string, string> = {
  jpeg: "JPEG",
  png: "PNG",
  gif: "GIF",
  webp: "WebP",
  mp4: "MP4",
  quicktime: "MOV",
  webm: "WebM",
};

function formatLabel(mimeType: string): string {
  const subtype = mimeType.split("/")[1] ?? mimeType;
  return FORMAT_LABELS[subtype] ?? subtype.toUpperCase();
}

/**
 * Everything about the attached media that this channel will reject — empty when
 * the post can be sent. Written as instructions, not as codes, because the writer
 * is the one who has to fix it.
 */
export function mediaProblems(platform: Platform, media: AttachedMedia[]): string[] {
  const spec = platformSpec(platform);
  const problems: string[] = [];

  if (media.length === 0) {
    if (!spec.allowsTextOnly) {
      problems.push(`${spec.name} needs media — ${spec.media.toLowerCase()}.`);
    }
    return problems;
  }

  const unsupported = media.filter((m) => !spec.acceptedMime.includes(m.mimeType));
  for (const item of unsupported) {
    const kind = item.mimeType.startsWith("video/") ? "video" : "image";
    const sameKind = spec.acceptedMime.filter((m) => m.startsWith(`${kind}/`));
    const file = item.filename ? ` (${item.filename})` : "";
    if (sameKind.length === 0) {
      // The channel takes nothing of this kind at all — say what it does take
      // rather than "a supported type".
      const takes = spec.acceptedMime.map(formatLabel).join(", ");
      problems.push(`${spec.name} does not accept ${kind}s${file} — it only takes ${takes}.`);
    } else {
      const alternatives = sameKind.map(formatLabel).join(", ");
      problems.push(
        `${spec.name} will not accept ${item.mimeType}${file} — send the ${kind} as ${alternatives}.`,
      );
    }
  }

  const images = media.filter((m) => m.mimeType.startsWith("image/")).length;
  const videos = media.filter((m) => m.mimeType.startsWith("video/")).length;

  if ((platform === "FACEBOOK" || platform === "TWITTER") && images > 0 && videos > 0) {
    problems.push(`${spec.name} cannot mix photos and video in one post — pick one kind.`);
  }
  if (platform === "FACEBOOK" && images > 4) {
    problems.push("Facebook accepts at most 4 photos in one post.");
  }
  if (platform === "TWITTER" && images > 4) {
    problems.push("X accepts at most 4 photos in one post.");
  }
  if ((platform === "INSTAGRAM" || platform === "YOUTUBE" || platform === "TIKTOK") && media.length > 1) {
    problems.push(`${spec.name} publishes one item per post — the extra attachments are ignored.`);
  }
  if (platform === "TELEGRAM" && media.length > 10) {
    problems.push("Telegram albums hold at most 10 items.");
  }

  return problems;
}
