import { Platform } from "@prisma/client";
import {
  PlatformAdapter,
  PlatformConfig,
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostResult,
  PostMediaDescriptor,
  PLATFORM_CONFIGS,
} from "@/types/platform";
import type { AdapterErrorCode } from "./errors";
import { platformOAuthCallbackUri } from "@/lib/social/approval";

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract platform: Platform;
  
  get config(): PlatformConfig {
    return PLATFORM_CONFIGS[this.platform];
  }

  abstract getOAuthUrl(state: string): string;
  
  abstract exchangeCodeForTokens(code: string): Promise<OAuthTokens>;
  
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  
  abstract getAccountInfo(accessToken: string): Promise<AccountInfo>;
  
  abstract createPost(accessToken: string, options: PostOptions): Promise<PostResult>;
  
  abstract validateCredentials(): { valid: boolean; missing: string[] };

  protected getRedirectUri(): string {
    return platformOAuthCallbackUri(this.platform);
  }

  /** Best-effort MIME inference from a URL — used only when the extension is known. */
  protected static inferMimeType(url: string): string | null {
    const clean = url.split("?")[0].split("#")[0].toLowerCase();
    const ext = clean.slice(clean.lastIndexOf(".") + 1);
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      avi: "video/x-msvideo",
    };
    return map[ext] ?? null;
  }

  /**
   * Normalise `mediaUrls` / `media` into one descriptor list. Callers that know
   * the real MIME type and size (the publish paths, from `MediaAsset`) pass
   * `media`; everything else falls back to URL inference.
   */
  protected mediaDescriptors(options: PostOptions): PostMediaDescriptor[] {
    if (options.media && options.media.length > 0) return options.media;
    return (options.mediaUrls ?? []).map((url) => ({ url }));
  }

  /** Which kind of attachment a descriptor is, from its MIME type. */
  protected classifyMedia(descriptor: PostMediaDescriptor): "image" | "video" | "unknown" {
    const mime = descriptor.mimeType ?? BasePlatformAdapter.inferMimeType(descriptor.url);
    if (!mime) return "unknown";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    return "unknown";
  }

  /**
   * Reject content the platform cannot accept, before spending an API call.
   * Rules come from the platform's declared capabilities, so a new connector
   * inherits enforcement by declaring them rather than by copying checks.
   *
   * Capability honesty is the point of this function: if a capability is not
   * declared, the content is refused. It is never accepted-and-then-dropped —
   * a silently discarded attachment is worse than a rejection, because the
   * user believes it was published.
   *
   * Returns the reason and its stable code, or null when the post is valid.
   */
  protected validatePostContent(
    options: PostOptions,
  ): { code: AdapterErrorCode; message: string } | null {
    const { capabilities, name } = this.config;
    const media = this.mediaDescriptors(options);

    // --- Capability honesty -------------------------------------------------
    // No media capability at all (e.g. X/Twitter today): refuse every attachment
    // rather than posting the text and dropping the file.
    if (media.length > 0 && !capabilities.image && !capabilities.video) {
      return {
        code: "UNSUPPORTED_MEDIA",
        message: `${name} does not support media attachments yet — this connector publishes text only. Nothing was published.`,
      };
    }

    const kinds = media.map((m) => this.classifyMedia(m));
    if (kinds.includes("video") && !capabilities.video) {
      return {
        code: "UNSUPPORTED_MEDIA",
        message: `${name} does not support video attachments yet. Remove the video or choose a video-capable platform. Nothing was published.`,
      };
    }
    if (kinds.includes("image") && !capabilities.image) {
      return {
        code: "UNSUPPORTED_MEDIA",
        message: `${name} does not support image attachments yet. Nothing was published.`,
      };
    }

    // --- Requirements -------------------------------------------------------
    if (capabilities.mediaRequired && media.length === 0) {
      return {
        code: "MEDIA_INVALID",
        message: `${name} requires at least one media item — text-only posts are not supported`,
      };
    }

    if (!capabilities.text && media.length === 0) {
      return { code: "MEDIA_INVALID", message: `${name} cannot publish without media` };
    }

    // A post needs *something*: text or media. Whitespace-only text carries no
    // content, so sending it would either be rejected by the platform or
    // published as a blank post that the user then has to find and delete.
    // Checked before the length rules so the message names the real problem.
    if (media.length === 0 && options.text.trim().length === 0) {
      return {
        code: "CONTENT_INVALID",
        message: `${name} needs some text or a media attachment — nothing was published.`,
      };
    }

    if (options.text.length > this.config.maxTextLength) {
      return {
        code: "CONTENT_INVALID",
        message: `Text exceeds maximum length of ${this.config.maxTextLength} characters`,
      };
    }

    if (
      media.length > 0 &&
      capabilities.captionMaxWithMedia !== undefined &&
      options.text.length > capabilities.captionMaxWithMedia
    ) {
      return {
        code: "CONTENT_INVALID",
        message: `Caption exceeds ${capabilities.captionMaxWithMedia} characters when media is attached`,
      };
    }

    // Carousel is checked before the raw count so the message names the real
    // reason ("cannot carousel") rather than a bare limit.
    if (media.length > 1 && !capabilities.carousel) {
      return {
        code: "UNSUPPORTED_MEDIA",
        message: `${name} does not support carousel posts (multiple media items)`,
      };
    }

    if (media.length > this.config.maxMediaCount) {
      return {
        code: "MEDIA_INVALID",
        message: `Too many media items. Maximum is ${this.config.maxMediaCount}`,
      };
    }

    // --- Per-attachment type and size --------------------------------------
    for (const descriptor of media) {
      const mime = descriptor.mimeType ?? BasePlatformAdapter.inferMimeType(descriptor.url);

      // Unknown type fails closed. Previously a null MIME skipped every check,
      // which is exactly how a `data:` URL slipped past validation.
      if (!mime) {
        return {
          code: "UNSUPPORTED_MEDIA",
          message: `Could not determine the media type for ${name}. Re-upload the file so its type is known. Nothing was published.`,
        };
      }

      if (
        this.config.supportedMediaTypes.length > 0 &&
        !this.config.supportedMediaTypes.includes(mime)
      ) {
        return {
          code: "UNSUPPORTED_MEDIA",
          message: `Unsupported media type for ${name}: ${mime}. Supported: ${this.config.supportedMediaTypes.join(", ")}`,
        };
      }

      const kind = this.classifyMedia({ ...descriptor, mimeType: mime });
      const limitMb = kind === "video" ? this.config.maxVideoSizeMb : this.config.maxImageSizeMb;
      if (
        descriptor.sizeBytes !== undefined &&
        limitMb !== undefined &&
        limitMb > 0 &&
        descriptor.sizeBytes > limitMb * 1024 * 1024
      ) {
        return {
          code: "MEDIA_INVALID",
          message: `${name} allows at most ${limitMb} MB per ${kind === "video" ? "video" : "image"}; this file is ${(descriptor.sizeBytes / (1024 * 1024)).toFixed(1)} MB.`,
        };
      }
    }

    return null;
  }
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public rawError?: unknown
  ) {
    super(message);
    this.name = "AdapterError";
  }
}
