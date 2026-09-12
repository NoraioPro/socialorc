/**
 * Retrieval — turning stored chunks into the few paragraphs worth spending
 * prompt tokens on.
 *
 * Pure and deterministic: it takes candidates and a query vector (or the query
 * text, for the lexical half) and returns a ranked, budgeted selection. The
 * database and the embedding provider stay outside, which is what makes the
 * workspace-isolation and truncation behaviour testable without them.
 *
 * Two properties matter and are asserted in tests:
 *   1. Nothing outside the caller's workspace can ever appear — candidates are
 *      the caller's responsibility, and the result reports how many were seen.
 *   2. Dropping candidates is *reported* (`truncated`), never silent, because a
 *      confident answer from half the evidence is the failure mode to avoid.
 */

import { keywords } from "./chunk";
import { cosineSimilarity, sameDimensions } from "./embed";
import type {
  BrainChunkRecord,
  ContextCitation,
  RetrievalOptions,
  RetrievalResult,
  ScoredChunk,
} from "./types";

const DEFAULTS: Required<Pick<RetrievalOptions, "maxChunks" | "maxChars" | "minScore">> = {
  maxChunks: 8,
  maxChars: 6000,
  minScore: 0.05,
};

/** How much a lexical (keyword) hit adds on top of the semantic score. */
const KEYWORD_BOOST = 0.15;
const PREFERRED_SOURCE_BOOST = 0.2;

/**
 * Score candidates against a query.
 *
 * Hybrid on purpose: embeddings miss exact strings (product names, hashtags,
 * error codes) and keywords miss paraphrase. When `queryEmbedding` is null —
 * no provider configured, or the chunk set predates the current model — the
 * lexical half still returns something useful rather than nothing.
 */
export function rankChunks(
  candidates: BrainChunkRecord[],
  query: {
    text: string;
    embedding?: Float32Array | null;
    preferSourceIds?: string[];
  },
): ScoredChunk[] {
  const queryTerms = new Set(keywords(query.text, 20));
  const preferred = new Set(query.preferSourceIds ?? []);
  const scored: ScoredChunk[] = [];

  for (const chunk of candidates) {
    let semantic = 0;
    let hasSemantic = false;

    if (query.embedding && chunk.embedding && sameDimensions(query.embedding, chunk.embedding)) {
      semantic = cosineSimilarity(query.embedding, chunk.embedding);
      hasSemantic = true;
    }

    const chunkTerms = new Set(keywords(chunk.content, 40));
    let hits = 0;
    for (const term of queryTerms) if (chunkTerms.has(term)) hits++;
    const lexical = queryTerms.size > 0 ? hits / queryTerms.size : 0;

    let score = hasSemantic ? semantic + lexical * KEYWORD_BOOST : lexical;
    const pinned = preferred.has(chunk.sourceId);
    if (pinned) score += PREFERRED_SOURCE_BOOST;

    if (score <= 0) continue;

    // Most salient reason wins: an explicit preference beats similarity, which
    // beats a plain keyword hit. The UI shows this next to the citation.
    const reason: ScoredChunk["reason"] = pinned
      ? "pinned"
      : hasSemantic
        ? "semantic"
        : "keyword";

    scored.push({ chunk, score, reason });
  }

  // Deterministic ordering: score, then source order, then index — never
  // dependent on object identity or insertion accidents.
  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.chunk.sourceId !== b.chunk.sourceId) return a.chunk.sourceId.localeCompare(b.chunk.sourceId);
    return a.chunk.chunkIndex - b.chunk.chunkIndex;
  });
}

/**
 * Apply the budgets. Keeps the best chunks until either the chunk count or the
 * character budget is hit; the next chunk that does not fit is skipped rather
 * than ending the loop (a short chunk may still fit and be useful).
 */
export function selectContext(
  scored: ScoredChunk[],
  options: RetrievalOptions = {},
): RetrievalResult {
  const { maxChunks, maxChars, minScore } = { ...DEFAULTS, ...options };
  const selected: ScoredChunk[] = [];
  let used = 0;

  for (const hit of scored) {
    if (selected.length >= maxChunks) break;
    if (hit.score < minScore) continue;
    if (used + hit.chunk.content.length > maxChars) continue;
    selected.push(hit);
    used += hit.chunk.content.length;
  }

  return {
    selected,
    considered: scored.length,
    truncated: selected.length < scored.length,
  };
}

/** Convenience: rank then budget. */
export function retrieve(
  candidates: BrainChunkRecord[],
  query: { text: string; embedding?: Float32Array | null },
  options: RetrievalOptions = {},
): RetrievalResult {
  const ranked = rankChunks(candidates, { ...query, preferSourceIds: options.preferSourceIds });
  return selectContext(ranked, options);
}

/**
 * Render the selected chunks as the knowledge block of a prompt.
 *
 * Every chunk is labelled with its source title so the model can cite it and so
 * an operator reading the assembled prompt can see where a claim came from.
 */
export function buildContextBlock(selected: ScoredChunk[]): string {
  if (selected.length === 0) return "";
  return selected
    .map((hit, i) => {
      const title = hit.chunk.sourceTitle ?? "Untitled source";
      return `[${i + 1}] ${title} (${hit.chunk.sourceType ?? "knowledge"}, match ${hit.score.toFixed(2)})\n${hit.chunk.content}`;
    })
    .join("\n\n---\n\n");
}

/** The deduplicated source list shown as citations under an answer. */
export function citationsFrom(selected: ScoredChunk[]): ContextCitation[] {
  const bySource = new Map<string, ContextCitation>();
  for (const hit of selected) {
    const existing = bySource.get(hit.chunk.sourceId);
    if (!existing) {
      bySource.set(hit.chunk.sourceId, {
        sourceId: hit.chunk.sourceId,
        sourceTitle: hit.chunk.sourceTitle ?? "Untitled source",
        sourceType: hit.chunk.sourceType ?? "note",
        score: hit.score,
      });
    } else if (hit.score > existing.score) {
      existing.score = hit.score;
    }
  }
  return [...bySource.values()].sort((a, b) => b.score - a.score);
}
