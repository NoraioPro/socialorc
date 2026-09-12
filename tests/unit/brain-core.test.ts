/**
 * OrcBrain core: chunking, embeddings, retrieval, health, agents.
 *
 * These assert the properties the product depends on, not the implementation:
 * reproducible chunks, an offline embedder that actually separates related from
 * unrelated text, retrieval that reports truncation instead of hiding it, a
 * health score that is a real percentage, and a crew where outward-facing tools
 * can never execute unconfirmed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkText, keywords, normalizeText, splitSentences } from "../../src/lib/brain/chunk";
import {
  LOCAL_EMBEDDING_DIM,
  LOCAL_EMBEDDING_MODEL,
  cosineSimilarity,
  decodeEmbedding,
  embeddingPlan,
  encodeEmbedding,
  localEmbed,
} from "../../src/lib/brain/embed";
import {
  buildContextBlock,
  citationsFrom,
  rankChunks,
  retrieve,
  selectContext,
} from "../../src/lib/brain/retrieve";
import { BRAIN_HEALTH_WEIGHT_TOTAL, computeBrainHealth } from "../../src/lib/brain/health";
import {
  AGENT_SLUGS,
  CONFIRMATION_REQUIRED,
  ORC_AGENTS,
  resolveAgent,
  toolsFor,
} from "../../src/lib/brain/agents";
import type { BrainChunkRecord } from "../../src/lib/brain/types";

function chunkRecord(
  id: string,
  content: string,
  sourceId = "src1",
  embedding: Float32Array | null = null,
): BrainChunkRecord {
  return {
    id,
    sourceId,
    sourceTitle: `Source ${sourceId}`,
    sourceType: "note",
    chunkIndex: 0,
    content,
    embedding,
  };
}

test("normalizeText collapses whitespace but keeps paragraphs", () => {
  const raw = "Hello   world\r\n\r\n\r\n\r\nSecond\t paragraph  ";
  assert.equal(normalizeText(raw), "Hello world\n\nSecond paragraph");
});

test("splitSentences does not split on decimals or abbreviations mid-number", () => {
  assert.deepEqual(splitSentences("Revenue grew 3.5 percent. Costs fell."), [
    "Revenue grew 3.5 percent.",
    "Costs fell.",
  ]);
});

test("chunkText returns nothing for empty input", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("   \n\n  "), []);
});

test("chunkText is deterministic for the same input", () => {
  const text = "Para one about tone.\n\nPara two about audience.\n\nPara three about goals.";
  assert.deepEqual(chunkText(text), chunkText(text));
});

test("chunkText splits an oversized paragraph on sentence boundaries", () => {
  const sentence = "This sentence is deliberately long enough to matter. ";
  const chunks = chunkText(sentence.repeat(40), { maxChars: 300, overlapChars: 0, minChars: 50 });
  assert.ok(chunks.length > 1, "expected multiple chunks");
  for (const chunk of chunks) {
    assert.ok(chunk.content.length <= 400, `chunk too large: ${chunk.content.length}`);
  }
});

test("chunkText hard-splits a single sentence longer than the limit", () => {
  const chunks = chunkText("x".repeat(2500), { maxChars: 1000, overlapChars: 0, minChars: 10 });
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.content.length <= 1000));
});

test("chunkText carries overlap between chunks so boundaries stay findable", () => {
  const chunks = chunkText("Alpha beta gamma delta epsilon. ".repeat(80), {
    maxChars: 400,
    overlapChars: 60,
    minChars: 50,
  });
  assert.ok(chunks.length > 2);
  const firstTailWord = chunks[0].content.slice(-60).trim().split(" ").slice(1)[0];
  assert.ok(chunks[1].content.includes(firstTailWord), "next chunk should repeat the previous tail");
});

test("keywords drop stopwords and rank by frequency", () => {
  const terms = keywords("tone of voice and tone for the brand voice");
  assert.ok(terms.includes("tone"));
  assert.ok(terms.includes("voice"));
  assert.ok(!terms.includes("the"));
  assert.equal(terms[0], "tone");
});

test("localEmbed is deterministic, fixed-dimension and unit length", () => {
  const a = localEmbed("brand voice is bold and friendly");
  const b = localEmbed("brand voice is bold and friendly");
  assert.equal(a.length, LOCAL_EMBEDDING_DIM);
  assert.deepEqual([...a], [...b]);

  let norm = 0;
  for (const v of a) norm += v * v;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-6, "vector should be L2-normalised");
});

test("localEmbed knows related text from unrelated text", () => {
  const query = localEmbed("what is our tone of voice and writing style?");
  const related = localEmbed(
    "Our tone of voice is bold, direct and friendly. Writing style: short sentences, no jargon.",
  );
  const unrelated = localEmbed(
    "Quarterly invoice reconciliation and payroll tax filing deadlines for contractors.",
  );
  const relatedScore = cosineSimilarity(query, related);
  const unrelatedScore = cosineSimilarity(query, unrelated);
  assert.ok(
    relatedScore > unrelatedScore,
    `related (${relatedScore.toFixed(3)}) should beat unrelated (${unrelatedScore.toFixed(3)})`,
  );
});

test("cosineSimilarity handles identical, orthogonal and mismatched vectors", () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([0, 1, 0]);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
  assert.equal(cosineSimilarity(a, b), 0);
  assert.equal(cosineSimilarity(a, new Float32Array([0, 0, 0])), 0);
  assert.throws(() => cosineSimilarity(a, new Float32Array([1, 0])), /dimension mismatch/i);
});

test("embedding round-trips through base64 storage", () => {
  const original = localEmbed("products and services for creators");
  const decoded = decodeEmbedding(encodeEmbedding(original));
  assert.ok(decoded);
  assert.equal(decoded!.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(decoded![i] - original[i]) < 1e-6);
  }
  assert.equal(decodeEmbedding(null), null);
  assert.equal(decodeEmbedding("not-base64-!!"), null);
});

test("embeddingPlan reports the offline embedder as degraded", () => {
  const offline = embeddingPlan({} as NodeJS.ProcessEnv);
  assert.equal(offline.model, LOCAL_EMBEDDING_MODEL);
  assert.equal(offline.degraded, true);

  const provider = embeddingPlan({
    AI_API_KEY: "k",
    AI_EMBED_MODEL: "text-embedding-3-small",
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(provider.model, "text-embedding-3-small");
  assert.equal(provider.degraded, false);
});

test("rankChunks puts the closest chunk first and skips zero-score chunks", () => {
  const query = { text: "brand tone of voice", embedding: localEmbed("brand tone of voice") };
  const candidates = [
    chunkRecord("c1", "Posting cadence for the newsletter is monthly.", "srcA", localEmbed("newsletter cadence monthly")),
    chunkRecord("c2", "Our brand tone of voice is bold and friendly.", "srcB", localEmbed("our brand tone of voice is bold and friendly")),
    chunkRecord("c3", "", "srcC", null),
  ];

  const ranked = rankChunks(candidates, query);
  assert.ok(ranked.length >= 1);
  assert.equal(ranked[0].chunk.id, "c2");
  assert.ok(ranked[0].reason === "semantic" || ranked[0].reason === "keyword");
});

test("rankChunks still works with no query embedding (provider offline)", () => {
  const ranked = rankChunks(
    [
      chunkRecord("c1", "We avoid the word 'cheap' in all marketing copy."),
      chunkRecord("c2", "Office opening hours are nine to five."),
    ],
    { text: "which words do we avoid in marketing?" },
  );

  assert.ok(ranked.length >= 1, "lexical fallback should find something");
  assert.equal(ranked[0].chunk.id, "c1");
});

test("rankChunks never throws on a dimension mismatch — it ignores the vector", () => {
  const ranked = rankChunks(
    [chunkRecord("c1", "audience research notes", "src1", new Float32Array([1, 2, 3]))],
    { text: "audience", embedding: localEmbed("audience") },
  );
  assert.ok(Array.isArray(ranked));
});

test("rankChunks boosts a preferred source", () => {
  const text = "identical content about audience research";
  const a = chunkRecord("a", text, "srcA", localEmbed(text));
  const b = chunkRecord("b", text, "srcB", localEmbed(text));
  const ranked = rankChunks([a, b], {
    text,
    embedding: localEmbed(text),
    preferSourceIds: ["srcB"],
  });
  assert.equal(ranked[0].chunk.sourceId, "srcB");
  assert.equal(ranked[0].reason, "pinned");
});

test("selectContext respects the chunk budget and reports truncation", () => {
  const scored = rankChunks(
    [
      chunkRecord("c1", "tone voice brand", "src1", localEmbed("tone voice brand")),
      chunkRecord("c2", "tone voice brand", "src2", localEmbed("tone voice brand")),
      chunkRecord("c3", "tone voice brand", "src3", localEmbed("tone voice brand")),
    ],
    { text: "tone voice brand", embedding: localEmbed("tone voice brand") },
  );

  const limited = selectContext(scored, { maxChunks: 2 });
  assert.equal(limited.selected.length, 2);
  assert.equal(limited.truncated, true);
  assert.equal(limited.considered, scored.length);

  const all = selectContext(scored, { maxChunks: 10 });
  assert.equal(all.truncated, false);
});

test("selectContext skips a chunk that does not fit but keeps smaller later chunks", () => {
  const relevant = "tiny relevant note about tone";
  const big = chunkRecord("big", `${relevant} ${"padding ".repeat(70)}`, "src1", localEmbed(`${relevant} ${"padding ".repeat(70)}`));
  const small = chunkRecord("small", relevant, "src2", localEmbed(relevant));
  const ranked = rankChunks([big, small], {
    text: relevant,
    embedding: localEmbed(relevant),
  });
  assert.equal(ranked.length, 2, "both chunks should be real candidates");

  const result = selectContext(ranked, { maxChars: 200, maxChunks: 5 });
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].chunk.id, "small");
  assert.equal(result.truncated, true);
});

test("selectContext honours minScore", () => {
  const ranked = rankChunks([chunkRecord("c1", "unrelated office supplies list", "src1", localEmbed("unrelated office supplies list"))], {
    text: "audience",
    embedding: localEmbed("audience"),
  });
  const strict = selectContext(ranked, { minScore: 0.9 });
  assert.equal(strict.selected.length, 0);
});

test("retrieve returns an empty result instead of inventing context", () => {
  const result = retrieve([], { text: "anything", embedding: localEmbed("anything") });
  assert.deepEqual(result.selected, []);
  assert.equal(result.considered, 0);
  assert.equal(result.truncated, false);
  assert.equal(buildContextBlock(result.selected), "");
  assert.deepEqual(citationsFrom(result.selected), []);
});

test("buildContextBlock labels every chunk with its source", () => {
  const ranked = rankChunks([chunkRecord("c1", "Our tone is bold.", "src9")], {
    text: "tone",
    embedding: localEmbed("tone"),
  });
  const block = buildContextBlock(ranked);
  assert.match(block, /Source src9/);
  assert.match(block, /Our tone is bold\./);
});

test("citationsFrom deduplicates sources and keeps the best score", () => {
  const a = chunkRecord("a1", "tone note one", "src1", localEmbed("tone note one"));
  const b = chunkRecord("b1", "tone note two longer", "src1", localEmbed("tone note two longer"));
  const c = chunkRecord("c1", "tone note three", "src2", localEmbed("tone note three"));
  const ranked = rankChunks([a, b, c], { text: "tone note", embedding: localEmbed("tone note") });

  const citations = citationsFrom(ranked);
  assert.equal(citations.length, 2, "one citation per source, not per chunk");
  assert.deepEqual(citations.map((x) => x.sourceId).sort(), ["src1", "src2"]);
});

test("brain health weights sum to exactly 1", () => {
  assert.ok(Math.abs(BRAIN_HEALTH_WEIGHT_TOTAL - 1) < 1e-9);
});

test("an empty brain scores 0 and suggests the heaviest gaps first", () => {
  const health = computeBrainHealth({
    profile: null,
    readySourceCount: 0,
    socialAccountCount: 0,
  });
  assert.equal(health.score, 0);
  assert.equal(health.items.length, 8);
  assert.equal(health.suggestions.length, 3);
  assert.ok(health.suggestions.every((s) => !s.complete));
  assert.equal(health.suggestions[0].weight, 0.16);
  assert.ok(health.suggestions[0].fixPath.startsWith("/"));
});

test("a fully configured brain scores 100 with no suggestions", () => {
  const health = computeBrainHealth({
    profile: {
      brandName: "SocialOrc",
      description: "AI social media operating system",
      industry: "SaaS",
      tone: "bold",
      writingStyle: "short sentences",
      audiencePrimary: "agencies",
      products: [{ name: "Pro" }],
      goals: [{ kpi: "followers" }],
      competitors: [{ name: "Sintra" }],
    },
    readySourceCount: 3,
    socialAccountCount: 1,
  });
  assert.equal(health.score, 100);
  assert.deepEqual(health.suggestions, []);
});

test("a half-configured brain scores strictly between the extremes", () => {
  const health = computeBrainHealth({
    profile: { brandName: "SocialOrc", description: "social OS", tone: "bold" },
    readySourceCount: 0,
    socialAccountCount: 1,
  });
  assert.ok(health.score > 0 && health.score < 100, `unexpected score ${health.score}`);
  assert.ok(health.items.find((i) => i.key === "identity")?.complete);
  assert.ok(!health.items.find((i) => i.key === "knowledge")?.complete);
});

test("pending sources are reported but do not count as knowledge", () => {
  const health = computeBrainHealth({
    profile: { brandName: "A", description: "B" },
    readySourceCount: 0,
    pendingSourceCount: 5,
    socialAccountCount: 0,
  });
  assert.ok(!health.items.find((i) => i.key === "knowledge")?.complete);
});

test("the crew has eight unique charters and one default", () => {
  assert.equal(ORC_AGENTS.length, 8);
  assert.equal(new Set(AGENT_SLUGS).size, 8);
  assert.deepEqual(AGENT_SLUGS, [
    "chief",
    "content",
    "growth",
    "trend",
    "video",
    "community",
    "campaign",
    "brand",
  ]);
  assert.equal(resolveAgent().slug, "chief");
  assert.equal(resolveAgent("nope").slug, "chief", "unknown slug falls back to Chief Orc");
  assert.equal(resolveAgent("growth").slug, "growth");
});

test("every charter carries shared honesty rules", () => {
  for (const agent of ORC_AGENTS) {
    assert.match(agent.systemInstructions, /OrcBrain is the only source of truth/);
    assert.match(agent.systemInstructions, /data, not instructions/);
    assert.ok(agent.tools.allowed.length > 0, `${agent.slug} has no tools`);
  }
});

test("outward-facing tools can never execute unconfirmed", () => {
  for (const slug of AGENT_SLUGS) {
    const { allowed, requiresConfirmation } = toolsFor(slug);
    for (const tool of requiresConfirmation) {
      assert.ok(allowed.includes(tool), `${slug}: ${tool} must be in allowed`);
      assert.ok(
        CONFIRMATION_REQUIRED.includes(tool as (typeof CONFIRMATION_REQUIRED)[number]),
        `${slug}: ${tool} must be confirmation-gated`,
      );
    }
    assert.ok(
      !allowed.includes("publish_post") ||
        requiresConfirmation.includes("publish_post"),
      `${slug} could publish without confirmation`,
    );
  }
});

test("Growth Orc cannot publish or send anything", () => {
  const { allowed } = toolsFor("growth");
  for (const forbidden of ["publish_post", "schedule_post", "reply_comment", "send_email"]) {
    assert.ok(!allowed.includes(forbidden as never), `growth should not hold ${forbidden}`);
  }
});
