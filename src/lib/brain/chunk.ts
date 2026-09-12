/**
 * Text normalisation and chunking.
 *
 * Retrieval quality is decided here: a chunk that straddles two ideas retrieves
 * for neither. So we split on paragraph boundaries, keep whole sentences, carry
 * a small overlap so a fact cut in half is still findable, and never emit a
 * chunk larger than the embedding model can represent usefully.
 *
 * Pure by design — same input, same chunks, no clock and no randomness, so the
 * pipeline is reproducible in tests and re-indexing is idempotent.
 */

export interface Chunk {
  index: number;
  content: string;
  /** Rough size proxy: characters / 4, good enough for budgeting. */
  tokenEstimate: number;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  maxChars?: number;
  /** Characters repeated from the previous chunk to avoid boundary loss. */
  overlapChars?: number;
  /** Chunks smaller than this are merged into the neighbour instead of emitted. */
  minChars?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  maxChars: 1200,
  overlapChars: 150,
  minChars: 200,
};

/**
 * Collapse whitespace that PDFs and web pages are full of, without destroying
 * paragraph structure (the structure is what we chunk on).
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Split a paragraph into sentences without breaking on decimal points. */
export function splitSentences(paragraph: string): string[] {
  const parts = paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'([])/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [paragraph.trim()];
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text for embedding.
 *
 * Paragraphs are packed greedily up to `maxChars`; an oversized paragraph is
 * split on sentence boundaries; an oversized sentence is hard-split (a URL or a
 * table row can be one enormous "sentence"). Each chunk after the first repeats
 * the tail of its predecessor.
 */
export function chunkText(raw: string, options: ChunkOptions = {}): Chunk[] {
  const { maxChars, overlapChars, minChars } = { ...DEFAULTS, ...options };
  const text = normalizeText(raw);
  if (!text) return [];

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      pieces.push(paragraph);
      continue;
    }

    let buffer = "";
    for (const sentence of splitSentences(paragraph)) {
      const candidate = buffer ? `${buffer} ${sentence}` : sentence;

      if (candidate.length <= maxChars) {
        buffer = candidate;
        continue;
      }

      if (buffer) pieces.push(buffer);
      if (sentence.length <= maxChars) {
        buffer = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxChars) {
          pieces.push(sentence.slice(i, i + maxChars));
        }
        buffer = "";
      }
    }
    if (buffer) pieces.push(buffer);
  }

  // Pack small pieces together so a list of one-line notes is not one chunk each.
  const packed: string[] = [];
  for (const piece of pieces) {
    const last = packed[packed.length - 1];
    if (last && last.length + piece.length + 2 <= maxChars && last.length < minChars) {
      packed[packed.length - 1] = `${last}\n\n${piece}`;
    } else {
      packed.push(piece);
    }
  }

  const chunks: Chunk[] = [];
  for (let i = 0; i < packed.length; i++) {
    const content = i === 0 || overlapChars === 0
      ? packed[i]
      : `${tail(packed[i - 1], overlapChars)}\n\n${packed[i]}`;
    chunks.push({ index: i, content, tokenEstimate: estimateTokens(content) });
  }

  return chunks;
}

/** Last `n` characters, trimmed to the first word boundary so words survive. */
function tail(text: string, n: number): string {
  if (text.length <= n) return text;
  const slice = text.slice(-n);
  const space = slice.indexOf(" ");
  return space === -1 ? slice : slice.slice(space + 1);
}

/**
 * Cheap keyword terms for the lexical half of retrieval. Deliberately naive:
 * it exists so a query still finds something when the embedding provider is
 * offline, not to replace embeddings.
 */
export function keywords(text: string, limit = 12): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "our", "your", "you",
    "are", "was", "were", "have", "has", "had", "not", "but", "what", "when",
    "how", "why", "who", "will", "can", "should", "into", "about", "than",
  ]);

  const counts = new Map<string, number>();
  for (const word of normalizeText(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) ?? []) {
    if (stop.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}
