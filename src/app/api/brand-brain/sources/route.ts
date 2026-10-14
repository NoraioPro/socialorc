import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { requireWorkspace, tenantCan } from "@/lib/tenancy/guard";
import { resolveAiConfigForUser, type AiConfig } from "@/lib/ai-config";
import { enforceRateLimit } from "@/lib/rate-limit-guard";
import {
  KnowledgeLimitError,
  MAX_SOURCE_CHARS,
  addKnowledgeSource,
  listKnowledgeSources,
} from "@/lib/brand-knowledge";
import { embeddingModelId } from "@/lib/brain/embedder";
import { EmptySourceError } from "@/lib/brain/ingest";
import { UrlFetchError, fetchPublicPage, knowledgeUrlProblem, pageToText } from "@/lib/brain/fetch-url";

/**
 * Brand Brain knowledge sources: pasted text and public web pages that
 * generation draws on (see src/lib/brand-knowledge.ts).
 *
 * Reading is open to every member (brains:read); adding and deleting change what
 * every future generation is grounded in, so they need brains:manage — the same
 * rule as editing the Brand Brain itself.
 */

const addSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    title: z.string().trim().min(1, "Give the source a title.").max(200),
    text: z.string().trim().min(1, "Paste some text.").max(MAX_SOURCE_CHARS, `At most ${MAX_SOURCE_CHARS} characters.`),
  }),
  z.object({
    kind: z.literal("url"),
    url: z.string().trim().min(1).max(2048),
    title: z.string().trim().max(200).optional(),
  }),
]);

/** A stored key that cannot be read is treated as no key: ingest still works, by keyword. */
async function aiConfigOrNull(userId: string): Promise<AiConfig | null> {
  try {
    return await resolveAiConfigForUser(userId);
  } catch {
    return null;
  }
}

export async function GET() {
  const tenant = await requireWorkspace("brains:read");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const [sources, aiConfig] = await Promise.all([
    listKnowledgeSources(tenant.workspaceId),
    aiConfigOrNull(tenant.userId),
  ]);

  return NextResponse.json({
    sources,
    canManage: tenantCan(tenant, "brains:manage"),
    // What a source added now would get: real embeddings with the account's own
    // key, otherwise keyword (BM25) search. Never presented as semantic when it is not.
    indexing: aiConfig
      ? { mode: "semantic", model: embeddingModelId() }
      : { mode: "lexical", model: null },
  });
}

export async function POST(req: NextRequest) {
  const tenant = await requireWorkspace("brains:manage");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Embedding spends the account's key and a URL makes the server fetch: both
  // share the AI budget.
  const limited = await enforceRateLimit("ai", `user:${tenant.userId}`);
  if (limited) return limited;

  const input = parsed.data;
  let title: string;
  let text: string;
  let sourceUrl: string | undefined;

  if (input.kind === "url") {
    const problem = knowledgeUrlProblem(input.url);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    try {
      const page = await fetchPublicPage(input.url);
      const extracted = pageToText(page);
      title = input.title || extracted.title;
      text = extracted.text.slice(0, MAX_SOURCE_CHARS);
      sourceUrl = page.url;
    } catch (error) {
      if (error instanceof UrlFetchError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }
  } else {
    title = input.title;
    text = input.text;
  }

  try {
    const result = await addKnowledgeSource(
      {
        workspaceId: tenant.workspaceId,
        userId: tenant.userId,
        title,
        text,
        type: input.kind === "url" ? "website" : "note",
        sourceUrl,
      },
      await aiConfigOrNull(tenant.userId),
    );
    return NextResponse.json({ source: result }, { status: 201 });
  } catch (error) {
    if (error instanceof EmptySourceError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof KnowledgeLimitError) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    console.error("Adding a knowledge source failed:", error);
    return NextResponse.json({ error: "Failed to add the knowledge source" }, { status: 500 });
  }
}
