/**
 * The AI provider layer.
 *
 * One abstraction over whatever model vendor is configured, because OrcBrain,
 * chat, titles, summaries and embeddings must not each know a vendor SDK. The
 * existing `src/lib/ai.ts` builds a module-level OpenAI client with a hardcoded
 * model; this replaces that pattern with lazy construction (so importing this
 * module never throws when no key is set, and it is testable without the SDK)
 * and with errors the UI can act on.
 *
 * Secrets stay server-side: nothing here reads or exposes a `NEXT_PUBLIC_*` var.
 */

import { localEmbed, LOCAL_EMBEDDING_MODEL, embeddingPlan } from "./embed";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiConfig {
  apiKey: string;
  baseUrl?: string;
  chatModel: string;
  embedModel?: string;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider is configured. Set AI_API_KEY (or OPENAI_API_KEY) in the server environment.",
    );
    this.name = "AiNotConfiguredError";
  }
}

export class AiRequestError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AiRequestError";
    this.cause = cause;
  }
}

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

/**
 * Resolve configuration from the environment, preferring the platform-neutral
 * `AI_*` names and falling back to the pre-existing `OPENAI_*` ones so nothing
 * that already works has to be re-keyed.
 */
export function resolveAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY || env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = env.AI_BASE_URL || env.OPENAI_BASE_URL || undefined;
  const chatModel = env.AI_CHAT_MODEL || env.OPENAI_MODEL || DEFAULT_CHAT_MODEL;
  const embedModel = env.AI_EMBED_MODEL || env.OPENAI_EMBED_MODEL || undefined;

  return { apiKey, baseUrl, chatModel, embedModel };
}

export function isAiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveAiConfig(env) !== null;
}

/** The model name to store on a message row, for auditability. */
export function activeModelName(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAiConfig(env)?.chatModel ?? "none";
}

interface OpenAiLike {
  chat: {
    completions: {
      create(body: Record<string, unknown>): Promise<AsyncIterable<{
        choices: Array<{ delta?: { content?: string | null } }>;
      }> & { choices: Array<{ message?: { content?: string | null } }> }>;
    };
  };
  embeddings: {
    create(body: Record<string, unknown>): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
}

/**
 * Lazy client. Imported at call time so this module is usable (and unit-testable)
 * in a tree where the SDK is not installed or no key exists.
 */
async function client(config: AiConfig): Promise<OpenAiLike> {
  const mod = (await import("openai")) as unknown as {
    default: new (opts: { apiKey: string; baseURL?: string }) => OpenAiLike;
  };
  return new mod.default({ apiKey: config.apiKey, baseURL: config.baseUrl });
}

/** Wraps client construction so a missing SDK reads as an actionable error. */
async function openClient(config: AiConfig): Promise<OpenAiLike> {
  try {
    return await client(config);
  } catch (cause) {
    throw new AiRequestError(
      "The AI SDK is not installed in this checkout (run npm install), so the assistant cannot respond.",
      cause,
    );
  }
}

/** Stream a chat completion chunk by chunk. Callers render as they arrive. */
export async function* streamChat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; env?: NodeJS.ProcessEnv } = {},
): AsyncGenerator<string> {
  const config = resolveAiConfig(options.env ?? process.env);
  if (!config) throw new AiNotConfiguredError();

  const openai = await openClient(config);
  try {
    const stream = await openai.chat.completions.create({
      model: config.chatModel,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    });

    for await (const part of stream) {
      const delta = part.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  } catch (cause) {
    throw new AiRequestError(
      `The AI provider rejected the request: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }
}

/** Non-streaming completion, for titles, summaries and internal tool calls. */
export async function completeText(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const config = resolveAiConfig(options.env ?? process.env);
  if (!config) throw new AiNotConfiguredError();

  const openai = await openClient(config);
  try {
    const response = await openai.chat.completions.create({
      model: config.chatModel,
      messages,
      temperature: options.temperature ?? 0.3,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    });
    return response.choices?.[0]?.message?.content ?? "";
  } catch (cause) {
    throw new AiRequestError(
      `The AI provider rejected the request: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }
}

/**
 * Ask for JSON and parse it. Models wrap JSON in prose or fences often enough
 * that extracting the first object is part of the contract, not a nicety.
 */
export async function completeJson<T>(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<T> {
  const text = await completeText(messages, options);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiRequestError("The model did not return JSON.");
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (cause) {
    throw new AiRequestError("The model returned malformed JSON.", cause);
  }
}

/**
 * Embed texts. With no provider configured this returns the offline vectors and
 * says `degraded: true` — callers store the model name so a later re-index is
 * possible and the UI can label the index honestly.
 */
export async function embedWithPlan(
  texts: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ vectors: Float32Array[]; model: string; degraded: boolean }> {
  const plan = embeddingPlan(env);
  const config = resolveAiConfig(env);

  if (plan.degraded || !config?.embedModel) {
    return { vectors: texts.map((text) => localEmbed(text)), model: LOCAL_EMBEDDING_MODEL, degraded: true };
  }

  const openai = await openClient(config);
  try {
    const response = await openai.embeddings.create({
      model: config.embedModel,
      input: texts,
    });
    return {
      vectors: response.data.map((row) => Float32Array.from(row.embedding)),
      model: config.embedModel,
      degraded: false,
    };
  } catch (cause) {
    throw new AiRequestError(
      `Embedding failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    );
  }
}

/**
 * A title without spending a request. Deterministic, so tests and offline mode
 * still produce sensible conversation names; `suggestTitle` upgrades it when a
 * provider is available.
 */
export function titleFromText(text: string, maxWords = 6, maxChars = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";

  const words = clean.split(" ").slice(0, maxWords).join(" ");
  const title = words.length > maxChars ? `${words.slice(0, maxChars)}` : words;
  const trimmed = title.replace(/[.,;:!?]+$/, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** LLM title when configured; falls back to the deterministic one on any error. */
export async function suggestTitle(
  firstUserMessage: string,
  firstAssistantMessage = "",
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (!isAiConfigured(env)) return titleFromText(firstUserMessage);

  try {
    const raw = await completeText(
      [
        {
          role: "system",
          content:
            "Name this conversation in at most five words. Reply with the title only: no quotes, no punctuation at the end.",
        },
        { role: "user", content: `${firstUserMessage}\n\n${firstAssistantMessage}`.slice(0, 1500) },
      ],
      { maxTokens: 24, env },
    );
    const title = raw.replace(/["\n]/g, " ").replace(/\s+/g, " ").trim();
    return title ? title.slice(0, 60) : titleFromText(firstUserMessage);
  } catch {
    // A failed title must never cost the user their answer.
    return titleFromText(firstUserMessage);
  }
}

/** Rolling summary for long conversations (brief §21). */
export async function summarizeConversation(
  transcript: string,
  previousSummary: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (!isAiConfigured(env)) {
    throw new AiNotConfiguredError();
  }
  return completeText(
    [
      {
        role: "system",
        content:
          "Summarise this conversation for continuity. Keep decisions, brand facts, numbers the user stated, and open questions. Drop pleasantries. At most 200 words.",
      },
      {
        role: "user",
        content: `${previousSummary ? `Existing summary:\n${previousSummary}\n\n` : ""}New messages:\n${transcript}`,
      },
    ],
    { maxTokens: 400, env },
  );
}
