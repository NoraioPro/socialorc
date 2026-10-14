/**
 * Provider embeddings through the `ai` SDK, paid for by the account's own key.
 *
 * The key and base URL come from the resolved AiCredential (src/lib/ai-config.ts),
 * which has already refused an unsafe base URL; nothing here reads a key from the
 * environment. The model name may come from the environment — it names a model,
 * it does not authorise a charge.
 *
 * Every provider here is treated as OpenAI-compatible, like the generation path
 * (src/lib/ai.ts). One without an embeddings endpoint simply fails the call, and
 * ingestion then stores the source for keyword search and says why.
 */

import { embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { DEFAULT_BASE_URL, type AiConfig } from "@/lib/ai-config";
import type { Embedder } from "./ingest";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function embeddingModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.AI_EMBED_MODEL || env.OPENAI_EMBED_MODEL || DEFAULT_EMBEDDING_MODEL;
}

export interface ProviderEmbedderOptions {
  /** Injected in tests so the SDK path runs without the network. */
  fetch?: typeof globalThis.fetch;
  /** Wall-clock budget for one embed call (all batches). */
  timeoutMs?: number;
  modelId?: string;
}

/** An embedder bound to one account's credential. */
export function providerEmbedder(config: AiConfig, options: ProviderEmbedderOptions = {}): Embedder {
  const modelId = options.modelId ?? embeddingModelId();
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl ?? DEFAULT_BASE_URL,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return async (texts: string[]) => {
    const { embeddings } = await embedMany({
      model: provider.embeddingModel(modelId),
      values: texts,
      maxRetries: 1,
      maxParallelCalls: 2,
      abortSignal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    return { vectors: embeddings.map((vector) => Float32Array.from(vector)), model: modelId };
  };
}
