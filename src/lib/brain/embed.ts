/**
 * Embeddings and vector math.
 *
 * Pure: no network, no clock, no randomness (the local embedder is a
 * deterministic feature hash), so retrieval is reproducible and testable offline.
 * Provider-backed embeddings live in `./ai.ts`; this module only decides what a
 * vector *is* and how to compare two of them.
 *
 * Vectors are stored in SQLite as base64 Float32 — the database has no vector
 * type — and compared with brute-force cosine, which is honest for the
 * thousands-of-chunks scale this product is at. The retrieval service reports
 * when it had to truncate; the migration path to Postgres + pgvector is a
 * storage swap behind this same interface.
 */

/** Dimensions of the offline embedder. Provider vectors keep their own size. */
export const LOCAL_EMBEDDING_DIM = 256;

export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";

function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/** Deterministic 32-bit hash (FNV-1a) — stable across processes and releases. */
function hash32(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]}_${words[i + 1]}`);
  return [...words, ...bigrams];
}

/**
 * Offline embedder: signed feature hashing with sublinear term weighting.
 *
 * It is not a semantic model and the UI says so — it exists so ingestion,
 * retrieval, workspace-isolation tests and the whole pipeline work with no API
 * key configured. Two texts sharing vocabulary land close together, which is
 * enough for "does this document mention tone of voice?" and never fabricates
 * understanding it does not have.
 */
export function localEmbed(text: string, dim = LOCAL_EMBEDDING_DIM): Float32Array {
  const vec = new Float32Array(dim);
  const counts = new Map<string, number>();

  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of counts) {
    const h = hash32(token);
    const index = h % dim;
    // Sign bit from a different hash so collisions subtract as often as they add.
    const sign = (hash32(`${token}#sign`) & 1) === 0 ? 1 : -1;
    vec[index] += sign * (1 + Math.log(count));
  }

  return l2Normalize(vec);
}

/** Cosine similarity. Returns 0 for zero vectors; throws on a dimension mismatch. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}. Re-index the source with the current model.`,
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function sameDimensions(a: { length: number }, b: { length: number }): boolean {
  return a.length === b.length;
}

/** base64 of the little-endian Float32 bytes — compact enough for SQLite TEXT. */
export function encodeEmbedding(vector: Float32Array): string {
  const buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
  return buffer.toString("base64");
}

/** Canonical base64 only — Node decodes garbage leniently, and a corrupt
 *  embedding string must read as "not embedded", never as a random vector. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function decodeEmbedding(encoded: string | null | undefined): Float32Array | null {
  if (!encoded || !BASE64.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  if (buffer.byteLength === 0 || buffer.byteLength % 4 !== 0) return null;
  if (buffer.toString("base64") !== encoded) return null;
  // Node pools Buffer allocations, so `buffer.buffer` is generally NOT 4-byte
  // aligned and a Float32Array view over it throws. Copy into a fresh, aligned
  // ArrayBuffer instead of hoping.
  const aligned = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(aligned).set(buffer);
  return new Float32Array(aligned);
}

/**
 * Which embedder to use, and what the UI should call it.
 *
 * `degraded` is surfaced in the Brain UI: a local-hash index is not semantic
 * search and the user deserves to know which one they have.
 */
export function embeddingPlan(env: NodeJS.ProcessEnv = process.env): {
  model: string;
  dim: number;
  degraded: boolean;
} {
  const model = env.AI_EMBED_MODEL || env.OPENAI_EMBED_MODEL;
  if (model && (env.AI_API_KEY || env.OPENAI_API_KEY)) {
    return { model, dim: 0, degraded: false };
  }
  return { model: LOCAL_EMBEDDING_MODEL, dim: LOCAL_EMBEDDING_DIM, degraded: true };
}
