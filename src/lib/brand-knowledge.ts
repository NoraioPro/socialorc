/**
 * Brand Brain knowledge sources: storage, ingestion and retrieval for generation.
 *
 * Knowledge belongs to the workspace (BrainSource/BrainChunk carry
 * `workspaceId`); every query here is scoped by the workspace the caller's
 * route resolved through `requireWorkspace`. Vectors live base64-encoded in
 * `BrainChunk.embedding` — no pgvector, because the production database's
 * extensions are unknown — and similarity is computed in the app over at most
 * MAX_CANDIDATE_CHUNKS of the workspace's chunks.
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AiConfig } from "@/lib/ai-config";
import { decodeEmbedding } from "@/lib/brain/embed";
import { embeddingModelId, providerEmbedder } from "@/lib/brain/embedder";
import { ingestText, type Embedder, type IngestResult, type SourceWritePort } from "@/lib/brain/ingest";
import {
  KNOWLEDGE_BUDGET,
  knowledgePromptSection,
  knowledgeUsage,
  rankKnowledge,
  type KnowledgeBudget,
  type KnowledgeCandidate,
  type KnowledgeUsage,
} from "@/lib/brain/knowledge";

/** Pasted text larger than this is refused rather than silently truncated. */
export const MAX_SOURCE_CHARS = 100_000;
/** One source cannot flood retrieval. */
export const MAX_CHUNKS_PER_SOURCE = 120;
/** Per-workspace source cap: keeps in-app similarity over a bounded set. */
export const MAX_SOURCES_PER_WORKSPACE = 100;
/** Chunks scored per generation (newest first). */
export const MAX_CANDIDATE_CHUNKS = 2000;

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** The ingest port over Prisma. */
export function prismaSourcePort(): SourceWritePort {
  return {
    async createSource(input) {
      return prisma.brainSource.create({
        data: {
          workspaceId: input.workspaceId,
          type: input.type,
          title: input.title,
          sourceUrl: input.sourceUrl ?? null,
          fileName: input.fileName ?? null,
          fileType: input.fileType ?? null,
          fileSize: input.fileSize ?? null,
          extractedText: input.extractedText ?? null,
          metadata: input.metadata ? asJson(input.metadata) : undefined,
          createdBy: input.createdBy ?? null,
          status: "processing",
        },
        select: { id: true },
      });
    },
    async storeChunks(rows) {
      await prisma.brainChunk.createMany({
        data: rows.map((row) => ({
          workspaceId: row.workspaceId,
          sourceId: row.sourceId,
          chunkIndex: row.chunkIndex,
          content: row.content,
          embedding: row.embedding,
          embeddingModel: row.embeddingModel,
          tokenCount: row.tokenCount,
          metadata: row.metadata ? asJson(row.metadata) : undefined,
        })),
      });
    },
    async markReady(sourceId, info) {
      const current = await prisma.brainSource.findUnique({
        where: { id: sourceId },
        select: { metadata: true },
      });
      const previous =
        current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
          ? (current.metadata as Record<string, unknown>)
          : {};
      await prisma.brainSource.update({
        where: { id: sourceId },
        data: {
          status: "ready",
          errorMessage: null,
          lastSyncedAt: new Date(),
          metadata: asJson({ ...previous, ...info }),
        },
      });
    },
    async markFailed(sourceId, message) {
      await prisma.brainSource.update({
        where: { id: sourceId },
        data: { status: "failed", errorMessage: message.slice(0, 500) },
      });
    },
  };
}

export class KnowledgeLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeLimitError";
  }
}

export interface AddSourceInput {
  workspaceId: string;
  userId: string;
  title: string;
  text: string;
  type: "note" | "website";
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Store a source and index it. With an AI key the chunks are embedded with that
 * key; with none (or when the provider refuses) they are stored for keyword
 * search, and the source's metadata says so.
 */
export async function addKnowledgeSource(
  input: AddSourceInput,
  aiConfig: AiConfig | null,
  deps: { embedder?: Embedder | null; port?: SourceWritePort } = {},
): Promise<IngestResult> {
  if (input.text.length > MAX_SOURCE_CHARS) {
    throw new KnowledgeLimitError(
      `This source is ${input.text.length.toLocaleString("en")} characters; the limit is ${MAX_SOURCE_CHARS.toLocaleString("en")}. Split it into smaller sources.`,
    );
  }
  const count = await prisma.brainSource.count({ where: { workspaceId: input.workspaceId } });
  if (count >= MAX_SOURCES_PER_WORKSPACE) {
    throw new KnowledgeLimitError(
      `This workspace already has ${MAX_SOURCES_PER_WORKSPACE} knowledge sources. Delete one before adding another.`,
    );
  }

  const embedder = deps.embedder !== undefined ? deps.embedder : aiConfig ? providerEmbedder(aiConfig) : null;
  return ingestText(
    deps.port ?? prismaSourcePort(),
    {
      workspaceId: input.workspaceId,
      title: input.title,
      text: input.text,
      type: input.type,
      sourceUrl: input.sourceUrl,
      metadata: input.metadata,
      createdBy: input.userId,
      maxChunks: MAX_CHUNKS_PER_SOURCE,
    },
    embedder,
    { onEmbedError: "lexical" },
  );
}

export interface KnowledgeSourceView {
  id: string;
  type: string;
  title: string;
  sourceUrl: string | null;
  status: string;
  errorMessage: string | null;
  /** semantic | lexical | local-hash — how this source can be found. */
  index: string | null;
  embeddingModel: string | null;
  embeddingError: string | null;
  chunkCount: number;
  characters: number;
  createdAt: string;
}

function metaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export async function listKnowledgeSources(workspaceId: string): Promise<KnowledgeSourceView[]> {
  const rows = await prisma.brainSource.findMany({
    where: { workspaceId, type: { in: ["note", "website"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      title: true,
      sourceUrl: true,
      status: true,
      errorMessage: true,
      metadata: true,
      extractedText: true,
      createdAt: true,
      _count: { select: { chunks: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    sourceUrl: row.sourceUrl,
    status: row.status,
    errorMessage: row.errorMessage,
    index: metaString(row.metadata, "index"),
    embeddingModel: metaString(row.metadata, "embeddingModel"),
    embeddingError: metaString(row.metadata, "embeddingError"),
    chunkCount: row._count.chunks,
    characters: row.extractedText?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Deletes a source (chunks cascade). False when it is not this workspace's. */
export async function deleteKnowledgeSource(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.brainSource.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}

/** The workspace's searchable chunks, newest first, capped. */
export async function loadKnowledgeCandidates(
  workspaceId: string,
  cap = MAX_CANDIDATE_CHUNKS,
): Promise<KnowledgeCandidate[]> {
  const rows = await prisma.brainChunk.findMany({
    where: { workspaceId, source: { status: "ready" } },
    orderBy: [{ createdAt: "desc" }, { chunkIndex: "asc" }],
    take: cap,
    select: {
      id: true,
      sourceId: true,
      chunkIndex: true,
      content: true,
      embedding: true,
      embeddingModel: true,
      source: { select: { title: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    sourceTitle: row.source.title,
    chunkIndex: row.chunkIndex,
    content: row.content,
    embedding: decodeEmbedding(row.embedding),
    embeddingModel: row.embeddingModel,
  }));
}

export interface BrandKnowledge {
  /** Prompt section, or "" when nothing relevant was found. */
  section: string;
  usage: KnowledgeUsage | null;
}

const NO_KNOWLEDGE: BrandKnowledge = { section: "", usage: null };

/**
 * The knowledge section for one generation.
 *
 * Embeds the query only when the stored chunks were embedded with the current
 * model and the account has a key; otherwise ranks lexically and says so.
 * Never throws: missing knowledge must not fail a generation.
 */
export async function retrieveBrandKnowledge(
  workspaceId: string,
  query: string,
  aiConfig: AiConfig | null,
  deps: { embedder?: Embedder | null; budget?: KnowledgeBudget } = {},
): Promise<BrandKnowledge> {
  try {
    const candidates = await loadKnowledgeCandidates(workspaceId);
    if (candidates.length === 0 || !query.trim()) return NO_KNOWLEDGE;

    const model = embeddingModelId();
    let queryEmbedding: Float32Array | null = null;
    const embedder = deps.embedder !== undefined ? deps.embedder : aiConfig ? providerEmbedder(aiConfig) : null;
    if (embedder && candidates.some((c) => c.embedding && c.embeddingModel === model)) {
      try {
        const { vectors, model: used } = await embedder([query]);
        if (used === model) queryEmbedding = vectors[0] ?? null;
      } catch (error) {
        console.warn("Brand knowledge: query embedding failed, ranking by keyword instead:", error);
      }
    }

    const result = rankKnowledge(
      candidates,
      { text: query, embedding: queryEmbedding, model },
      deps.budget ?? KNOWLEDGE_BUDGET,
    );
    return { section: knowledgePromptSection(result), usage: knowledgeUsage(result) };
  } catch (error) {
    console.error("Brand knowledge retrieval failed; generating without it:", error);
    return NO_KNOWLEDGE;
  }
}
