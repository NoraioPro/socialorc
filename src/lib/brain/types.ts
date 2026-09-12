/**
 * OrcBrain vocabulary.
 *
 * Three kinds of knowledge, kept deliberately distinct (see the brief §13):
 *
 *   profile  — what the user typed. Authoritative.
 *   source   — documents, URLs, social accounts. Retrieved, never assumed.
 *   memory   — what the AI inferred. Carries confidence and needs approval.
 *
 * Nothing here touches the database, the network or the clock.
 */

export type BrainSourceType =
  | "note"
  | "website"
  | "file"
  | "social_account"
  | "post"
  | "brand_form";

/** A source is only `ready` once its text was extracted AND embedded. */
export type BrainSourceStatus = "uploading" | "processing" | "ready" | "failed";

export type MemoryCategory =
  | "voice"
  | "audience"
  | "product"
  | "goal"
  | "competitor"
  | "performance"
  | "other";

export type InsightType =
  | "growth"
  | "timing"
  | "format"
  | "audience"
  | "competitor"
  | "anomaly";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface BrainChunkRecord {
  id: string;
  sourceId: string;
  sourceTitle?: string;
  sourceType?: BrainSourceType;
  chunkIndex: number;
  content: string;
  /** Decoded vector, or null when the chunk has not been embedded yet. */
  embedding: Float32Array | null;
  metadata?: Record<string, unknown>;
}

export interface ScoredChunk {
  chunk: BrainChunkRecord;
  /** Cosine similarity in [-1, 1]; higher is closer. */
  score: number;
  /** Why it was kept — surfaced to the user as a source citation. */
  reason: "semantic" | "keyword" | "pinned";
}

export interface RetrievalOptions {
  /** Max chunks fed into the prompt. Truncation is reported, not hidden. */
  maxChunks?: number;
  /** Rough character budget across the selected chunks. */
  maxChars?: number;
  /** Minimum similarity for a semantic hit to count. */
  minScore?: number;
  /** Source ids to bias upward (e.g. the source the user is looking at). */
  preferSourceIds?: string[];
}

export interface RetrievalResult {
  selected: ScoredChunk[];
  /** Total candidates considered before ranking. */
  considered: number;
  /** True when candidates were dropped to respect the budgets. */
  truncated: boolean;
}

export interface BrainHealthItem {
  key: string;
  label: string;
  /** Weight in the overall score; items sum to 1. */
  weight: number;
  complete: boolean;
  /** Where to send the user to fix it. */
  fixPath: string;
}

export interface BrainHealth {
  /** 0–100, rounded. */
  score: number;
  items: BrainHealthItem[];
  /** The next few things worth doing, most valuable first. */
  suggestions: BrainHealthItem[];
}

/** Every tool the platform can offer an agent. */
export const TOOL_NAMES = [
  // read
  "search_brain",
  "get_brand_profile",
  "get_social_accounts",
  "get_social_analytics",
  "get_recent_posts",
  "search_content_library",
  "get_calendar",
  // create (reversible, in-platform)
  "generate_content",
  "create_draft_post",
  "draft_reply",
  "create_campaign_draft",
  "create_schedule_draft",
  "save_brain_memory",
  "generate_image",
  // outward-facing or destructive — all require confirmation
  "publish_post",
  "schedule_post",
  "reply_comment",
  "generate_video",
  "send_email",
  "create_automation",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** What an agent is allowed to do, expressed as tool names it may call. */
export interface AgentToolPermissions {
  allowed: ToolName[];
  /** Tools the agent may propose but that always require user confirmation. */
  requiresConfirmation: ToolName[];
}


export interface AgentCharter {
  slug: string;
  name: string;
  /** One line shown in the selector. */
  role: string;
  description: string;
  /** Kept short and directive; the shared brain supplies the facts. */
  systemInstructions: string;
  tools: AgentToolPermissions;
  /** Emoji-free avatar hint for the UI (the design pass avoids emoji as icons). */
  avatar: string;
}

/** A retrieval hit as the UI shows it: a claim plus where it came from. */
export interface ContextCitation {
  sourceId: string;
  sourceTitle: string;
  sourceType: BrainSourceType;
  score: number;
}
