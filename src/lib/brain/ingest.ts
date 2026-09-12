/**
 * Ingestion — turning a file, a note or a URL into embedded, retrievable chunks.
 *
 * The pipeline is a port, not a Prisma client: `SourceWritePort` is the only way
 * this module touches storage, so the whole ingest path is testable with a fake
 * and the database stays an implementation detail of the API layer.
 *
 * Two rules the brief is strict about, and that this enforces:
 *   • A source is `ready` only after its text was extracted AND embedded.
 *     Anything else is `processing` or `failed` — never a source that looks
 *     indexed but retrieves nothing.
 *   • A failed embed stores no chunks at all: a half-indexed document is worse
 *     than an obviously failed one, because answers would quietly omit it.
 */

import { chunkText } from "./chunk";
import { encodeEmbedding } from "./embed";
import { embedWithPlan } from "./ai";
import type { BrainSourceType } from "./types";

export class UnsupportedFileTypeError extends Error {
  constructor(fileName: string, supported: string[]) {
    super(
      `Cannot extract text from "${fileName}" yet. Supported: ${supported.join(", ")}. ` +
        "A PDF/DOCX parser is not installed, so this source stays unindexed rather than being marked ready.",
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export interface ExtractedText {
  text: string;
  kind: "plain" | "html" | "csv" | "json";
  /** Non-fatal notes for the source record (e.g. how much was stripped). */
  notes?: string[];
}

const PLAIN = ["txt", "md", "markdown", "log", "rtf", "text"];
const TABULAR = ["csv", "tsv"];
const STRUCTURED = ["json", "jsonl", "ndjson"];
const HTML = ["html", "htm", "xhtml"];

export const EXTRACTABLE_EXTENSIONS = [...PLAIN, ...TABULAR, ...STRUCTURED, ...HTML];

function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function decode(data: string | Buffer): string {
  return typeof data === "string" ? data : data.toString("utf8");
}

/** Strip a web page down to its readable text, keeping block structure. */
function htmlToText(html: string): { text: string; stripped: number } {
  let stripped = 0;
  const withoutNoise = html.replace(
    /<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi,
    () => {
      stripped++;
      return " ";
    },
  );

  const withBreaks = withoutNoise
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ");

  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return { text, stripped };
}

/** Flatten JSON into "path: value" lines — retrievable, and honest about depth. */
function jsonToText(json: string): string {
  const trimmed = json.trim();
  const lines = trimmed.split("\n").map((line) => line.trim()).filter(Boolean);

  // ndjson / jsonl: every line is its own document. Detected by shape, not by
  // extension, because a pretty-printed object also spans many lines.
  const looksLikeNdjson =
    lines.length > 1 && lines.every((line) => line.startsWith("{") || line.startsWith("["));

  if (looksLikeNdjson) {
    return lines
      .map((line) => {
        try {
          return flatten(JSON.parse(line));
        } catch {
          return line;
        }
      })
      .join("\n\n");
  }

  try {
    return flatten(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

function flatten(value: unknown, path = "", depth = 0): string {
  if (depth > 4) return "";
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return `${path}: ${String(value)}`.trim();

  if (Array.isArray(value)) {
    return value
      .map((item, index) => flatten(item, path ? `${path}[${index}]` : `[${index}]`, depth + 1))
      .filter(Boolean)
      .join("\n");
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => flatten(item, path ? `${path}.${key}` : key, depth + 1))
    .filter(Boolean)
    .join("\n");
}

/**
 * Extract text from an upload. Unknown and binary formats throw rather than
 * returning an empty string, because an empty string would be indexed as a
 * successful-but-useless source.
 */
export function extractText(fileName: string, data: string | Buffer): ExtractedText {
  const ext = extensionOf(fileName);
  const raw = decode(data);

  if (PLAIN.includes(ext)) return { text: raw, kind: "plain" };

  if (TABULAR.includes(ext)) {
    const separator = ext === "tsv" ? "\t" : ",";
    const notes: string[] = [];
    // Quote-aware split: a naive split mangles "Norway, Oslo" into two cells.
    const rows = raw.split(/\r?\n/).filter((line) => line.trim());
    const header = rows.length > 0 ? splitRow(rows[0], separator) : [];
    const body = rows.slice(1).map((line) => {
      const cells = splitRow(line, separator);
      return header.length === cells.length
        ? header.map((h, i) => `${h}: ${cells[i]}`).join(", ")
        : cells.join(", ");
    });
    if (rows.length > 0 && body.length === 0) notes.push("Only a header row was found.");
    return { text: [`${ext.toUpperCase()} export`, ...body].join("\n"), kind: "csv", notes };
  }

  if (STRUCTURED.includes(ext)) return { text: jsonToText(raw), kind: "json" };

  if (HTML.includes(ext)) {
    const { text, stripped } = htmlToText(raw);
    return { text, kind: "html", notes: stripped > 0 ? [`Removed ${stripped} non-content blocks.`] : [] };
  }

  throw new UnsupportedFileTypeError(fileName || "(unnamed file)", EXTRACTABLE_EXTENSIONS);
}

function splitRow(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export interface SourceChunkRow {
  workspaceId: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  embedding: string;
  embeddingModel: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

/** The only storage surface ingestion needs. Implemented over Prisma by the API. */
export interface SourceWritePort {
  createSource(input: {
    workspaceId: string;
    type: BrainSourceType;
    title: string;
    sourceUrl?: string;
    blobUrl?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    extractedText?: string;
    metadata?: Record<string, unknown>;
    createdBy?: string;
  }): Promise<{ id: string }>;
  storeChunks(rows: SourceChunkRow[]): Promise<void>;
  markReady(sourceId: string, info: { chunkCount: number; embeddingModel: string; degraded: boolean }): Promise<void>;
  markFailed(sourceId: string, message: string): Promise<void>;
}

export interface IngestInput {
  workspaceId: string;
  title: string;
  text: string;
  type?: BrainSourceType;
  sourceUrl?: string;
  blobUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  /** Max chunks per source, so one 400-page PDF cannot flood retrieval. */
  maxChunks?: number;
  env?: NodeJS.ProcessEnv;
}

export interface IngestResult {
  sourceId: string;
  chunkCount: number;
  embeddingModel: string;
  degraded: boolean;
}

export class EmptySourceError extends Error {
  constructor() {
    super("This source produced no extractable text, so it was not indexed.");
    this.name = "EmptySourceError";
  }
}

/**
 * Ingest text into a source. Creates the source first so a failure has a row to
 * report on, then chunks, embeds and stores — and only then marks it ready.
 */
export async function ingestText(
  port: SourceWritePort,
  input: IngestInput,
  embed: typeof embedWithPlan = embedWithPlan,
): Promise<IngestResult> {
  const source = await port.createSource({
    workspaceId: input.workspaceId,
    type: input.type ?? "note",
    title: input.title,
    sourceUrl: input.sourceUrl,
    blobUrl: input.blobUrl,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    metadata: input.metadata,
    createdBy: input.createdBy,
  });

  try {
    const chunks = chunkText(input.text);
    const limited = input.maxChunks ? chunks.slice(0, input.maxChunks) : chunks;

    if (limited.length === 0) {
      await port.markFailed(source.id, "No extractable text.");
      throw new EmptySourceError();
    }

    const { vectors, model, degraded } = await embed(limited.map((chunk) => chunk.content), input.env);

    await port.storeChunks(
      limited.map((chunk, index) => ({
        workspaceId: input.workspaceId,
        sourceId: source.id,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: encodeEmbedding(vectors[index]),
        embeddingModel: model,
        tokenCount: chunk.tokenEstimate,
        metadata: { ...input.metadata, degraded },
      })),
    );

    await port.markReady(source.id, { chunkCount: limited.length, embeddingModel: model, degraded });

    return { sourceId: source.id, chunkCount: limited.length, embeddingModel: model, degraded };
  } catch (error) {
    if (error instanceof EmptySourceError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    await port.markFailed(source.id, message);
    throw error;
  }
}
