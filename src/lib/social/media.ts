/**
 * Media validation, before anything is sent to a platform.
 *
 * Every platform disagrees about size, mime type, duration and count, and a
 * rejection that arrives after a 200 MB upload has already been paid for is the
 * expensive kind. `validateMediaForPlatform` answers with issues the frontend
 * can render, and never mutates or silently re-encodes the user's file.
 */

import type { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import {
  TIKTOK_CHUNK_MAX_BYTES,
  TIKTOK_CHUNK_MIN_BYTES,
  TIKTOK_MAX_CHUNKS,
  TIKTOK_SINGLE_CHUNK_MAX_BYTES,
} from "./tiktok/constants";

export interface MediaIssue {
  platform: Platform;
  /** The field the user should look at, e.g. `videoDuration`, `fileSize`, `mimeType`. */
  field: string;
  message: string;
}

export interface MediaValidationResult {
  valid: boolean;
  issues: MediaIssue[];
  /** Non-blocking facts worth surfacing (chunking, stricter UI limits, …). */
  notes: string[];
}

export interface MediaInput {
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
  /** Per-account ceiling when the platform exposes one (TikTok creator info). */
  maxDurationSec?: number;
}

export type TikTokTransfer = "file_upload" | "pull_from_url";

export interface TikTokChunkPlan {
  chunkSize: number;
  totalChunkCount: number;
}

/**
 * Split a file into upload chunks the way TikTok's media transfer guide
 * requires: ≤64 MB goes up whole; anything larger uses chunks of 5–64 MB with
 * the final chunk allowed to be smaller, at most 1000 chunks.
 */
export function planTikTokChunks(
  sizeBytes: number,
  options: { singleChunkMaxBytes?: number; minChunkBytes?: number; maxChunkBytes?: number; maxChunks?: number } = {},
): { ok: true; plan: TikTokChunkPlan } | { ok: false; reason: string } {
  const singleMax = options.singleChunkMaxBytes ?? TIKTOK_SINGLE_CHUNK_MAX_BYTES;
  const minChunk = options.minChunkBytes ?? TIKTOK_CHUNK_MIN_BYTES;
  const maxChunk = options.maxChunkBytes ?? TIKTOK_CHUNK_MAX_BYTES;
  const maxChunks = options.maxChunks ?? TIKTOK_MAX_CHUNKS;

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: "The file has no usable size." };
  }

  if (sizeBytes <= singleMax) {
    return { ok: true, plan: { chunkSize: sizeBytes, totalChunkCount: 1 } };
  }

  let chunkSize = maxChunk;
  let totalChunkCount = Math.ceil(sizeBytes / chunkSize);

  if (totalChunkCount > maxChunks) {
    // Growing the chunk size is the only lever left; TikTok's per-chunk limit
    // bounds it, so an oversized file is genuinely unuploadable.
    chunkSize = Math.ceil(sizeBytes / maxChunks);
    if (chunkSize > maxChunk) {
      return {
        ok: false,
        reason: `This file needs ${totalChunkCount} chunks, more than TikTok's limit of ${maxChunks}.`,
      };
    }
    totalChunkCount = Math.ceil(sizeBytes / chunkSize);
  }

  // The last chunk may be smaller than the minimum; the earlier ones may not.
  if (chunkSize < minChunk) {
    return {
      ok: false,
      reason: `TikTok requires chunks of at least ${Math.round(minChunk / 1024 / 1024)} MB.`,
    };
  }

  return { ok: true, plan: { chunkSize, totalChunkCount } };
}

export function validateMediaForPlatform(input: {
  platform: Platform;
  media: MediaInput;
  /** How the bytes would reach the platform; defaults to a direct upload. */
  transfer?: TikTokTransfer;
}): MediaValidationResult {
  const { platform, media } = input;
  const config = PLATFORM_CONFIGS[platform];
  const issues: MediaIssue[] = [];
  const notes: string[] = [];

  if (!config) {
    return {
      valid: false,
      issues: [{ platform, field: "platform", message: "Unknown platform." }],
      notes,
    };
  }

  if (!config.supportedMediaTypes.includes(media.mimeType)) {
    issues.push({
      platform,
      field: "mimeType",
      message: `${media.mimeType} is not accepted by ${config.name}. Allowed: ${config.supportedMediaTypes.join(", ")}.`,
    });
  }

  const isVideo = media.mimeType.startsWith("video/");
  const maxBytes = isVideo
    ? (config.maxVideoSizeMb ?? 0) * 1024 * 1024
    : (config.maxImageSizeMb ?? 0) * 1024 * 1024;

  if (maxBytes > 0 && media.sizeBytes > maxBytes) {
    issues.push({
      platform,
      field: "fileSize",
      message: `${(media.sizeBytes / 1024 / 1024).toFixed(1)} MB exceeds the ${config.name} limit of ${config.maxVideoSizeMb ?? config.maxImageSizeMb} MB.`,
    });
  }

  // Duration: only checked against a real per-account ceiling. Guessing here
  // would reject files the account could actually publish.
  if (media.durationSec !== undefined && media.maxDurationSec !== undefined && media.durationSec > media.maxDurationSec) {
    issues.push({
      platform,
      field: "videoDuration",
      message: `This account may post videos up to ${media.maxDurationSec}s; the file is ${media.durationSec}s.`,
    });
  } else if (media.durationSec === undefined && isVideo) {
    notes.push("Video duration was not supplied, so the account's duration limit could not be checked.");
  }

  if (platform === "TIKTOK") {
    if (input.transfer === "pull_from_url") {
      issues.push({
        platform,
        field: "transfer",
        message:
          "TikTok requires verified ownership of the domain serving PULL_FROM_URL media. Upload the file instead.",
      });
    } else {
      const plan = planTikTokChunks(media.sizeBytes);
      if (!plan.ok) {
        issues.push({ platform, field: "fileSize", message: plan.reason });
      } else if (plan.plan.totalChunkCount > 1) {
        notes.push(
          `Uploads as ${plan.plan.totalChunkCount} chunks of ${(plan.plan.chunkSize / 1024 / 1024).toFixed(0)} MB.`,
        );
      }
    }

    if (media.mimeType === "video/webm") {
      notes.push("TikTok accepts webm, but mp4 is the format its processing pipeline is happiest with.");
    }
  }

  return { valid: issues.length === 0, issues, notes };
}
