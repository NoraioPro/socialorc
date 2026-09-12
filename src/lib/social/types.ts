/**
 * Shared vocabulary for the social connection layer.
 *
 * These types are deliberately platform-neutral: a provider answers the same
 * questions — can I connect, what may I publish, is publishing actually
 * allowed right now — and the platform-specific differences are expressed as
 * data (capabilities, limitations, status), never as branches in the UI.
 *
 * Nothing in this file touches the network, the database or the clock, so it
 * can be imported by a route handler, a worker or a unit test alike.
 */

import type { Platform } from "@prisma/client";

/**
 * A connection is not a boolean. The account can be technically linked while
 * publishing is unavailable (missing scope, app not reviewed, token expired),
 * and the UI has to be able to say which.
 */
export const CONNECTION_STATUSES = [
  "connected",
  "expired",
  "refresh_required",
  "permission_missing",
  "review_required",
  "disconnected",
  "error",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * How a piece of content reaches the platform.
 *
 * - `direct`       publish to the audience once the platform accepts it
 * - `draft_upload` hand the media to the platform's own draft/inbox so a human
 *                  finishes it in the native app (TikTok inbox, for example)
 */
export const PUBLISH_METHODS = ["direct", "draft_upload"] as const;

export type PublishMethod = (typeof PUBLISH_METHODS)[number];

/**
 * What a connected account can actually do. Computed per account from granted
 * scopes, account type and app-review state — never from the platform's name.
 */
export interface AccountCapabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  shortVideo: boolean;
  carousel: boolean;
  directPublish: boolean;
  draftUpload: boolean;
  scheduling: boolean;
  analytics: boolean;
  comments: boolean;
  messaging: boolean;
}

/** Every capability is false until something proves otherwise. */
export const NO_CAPABILITIES: AccountCapabilities = {
  text: false,
  image: false,
  video: false,
  shortVideo: false,
  carousel: false,
  directPublish: false,
  draftUpload: false,
  scheduling: false,
  analytics: false,
  comments: false,
  messaging: false,
};

/**
 * A limitation is a capability the user might reasonably expect that is
 * currently unavailable, plus the reason. It is what turns a bare `false` into
 * an explanation the frontend can render next to the option it disables.
 */
export interface CapabilityLimitation {
  capability: keyof AccountCapabilities;
  code:
    | "NOT_SUPPORTED_BY_PLATFORM"
    | "APP_REVIEW_REQUIRED"
    | "SCOPE_NOT_GRANTED"
    | "ACCOUNT_TYPE_UNSUPPORTED"
    | "NOT_IMPLEMENTED_YET";
  message: string;
}

export interface CapabilityReport {
  platform: Platform;
  capabilities: AccountCapabilities;
  limitations: CapabilityLimitation[];
  /** Free-form, safe to show: the platform scopes this connection actually holds. */
  scopes: string[];
}

/** Everything a provider needs to know about the app-level approvals it may use. */
export interface AppApprovalState {
  /**
   * The developer app is approved for the platform's public-publishing path
   * (TikTok `video.publish` audit, Meta App Review, X access tier…). Absent or
   * false means "do not advertise direct publishing as available".
   */
  directPublish: boolean;
  /**
   * The app is approved for handing media to the platform's draft/inbox flow.
   * Usually easier to obtain than direct publishing.
   */
  draftUpload: boolean;
}

export interface AccountIdentity {
  /** Stable platform-side id (TikTok open_id, YouTube channel id, …). */
  externalAccountId: string;
  /** Parent resource when the account hangs off one (Facebook Page, org page). */
  externalParentId?: string;
  accountType: string;
  username?: string;
  displayName?: string;
  profileImageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string | null;
  /** Absolute expiry, computed from the provider's `expires_in`. */
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  tokenType?: string;
  /** Space- or comma-separated scope string exactly as the provider returned it. */
  scope?: string;
}

export interface AuthorizeInput {
  state: string;
  /** PKCE challenge derived from a verifier that never leaves the server. */
  codeChallenge?: string;
  codeChallengeMethod?: "S256" | "plain";
}

export interface ExchangeInput {
  code: string;
  codeVerifier?: string;
}

export interface PublishInput {
  accessToken: string;
  method: PublishMethod;
  caption?: string;
  title?: string;
  media: PublishMedia;
  /** Platform-level options the caller chose (privacy, duet/comment toggles…). */
  options?: Record<string, unknown>;
  /** Idempotency key so a retried job cannot post twice. */
  idempotencyKey?: string;
}

export interface PublishMedia {
  /** Publicly reachable URL, or a server-side path for FILE_UPLOAD providers. */
  url?: string;
  localPath?: string;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number;
}

export interface PublishResult {
  /** Platform-side id used later for status polling. */
  externalPostId: string;
  /** True when the platform has finished with it, false when it is processing. */
  completed: boolean;
  raw?: unknown;
}

export interface PostStatusResult {
  state: "processing" | "published" | "failed" | "unknown";
  detail?: string;
  externalPostId?: string;
  raw?: unknown;
}

/**
 * The provider contract.
 *
 * `publishPost`/`uploadDraft`/`getPostStatus`/`deletePost`/`getAnalytics` are
 * optional on purpose: a platform that cannot do something must not have a
 * method that pretends it can (see `capabilities` for what to show the user).
 */
export interface SocialProvider {
  platform: Platform;
  getAuthorizationUrl(input: AuthorizeInput): string;
  exchangeAuthorizationCode(input: ExchangeInput): Promise<TokenResult>;
  refreshAccessToken(refreshToken: string): Promise<TokenResult>;
  getConnectedAccount(accessToken: string): Promise<AccountIdentity>;
  getCapabilities(input: {
    scopes: string[];
    accountType?: string | null;
    approval: AppApprovalState;
  }): CapabilityReport;
  disconnect(input: { accessToken: string; refreshToken?: string | null }): Promise<void>;
  publishPost?(input: PublishInput): Promise<PublishResult>;
  uploadDraft?(input: PublishInput): Promise<PublishResult>;
  getPostStatus?(input: { accessToken: string; externalPostId: string }): Promise<PostStatusResult>;
  deletePost?(input: { accessToken: string; externalPostId: string }): Promise<void>;
}
