import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inlineMarkdown, isSafeHref, isSafeSrc, markdownToNodes, parseMarkdown } from "../../src/lib/portfolio/markdown";
import { parseDocument } from "../../src/lib/portfolio/validate";
import { blankDocument } from "../../src/lib/portfolio/blank";

let counter = 0;
const nextId = (kind: string): string => `${kind}-md${(counter += 1)}`;

describe("markdown parser", () => {
  it("splits headings, paragraphs, lists, quotes, images and rules", () => {
    const blocks = parseMarkdown(
      [
        "# Title",
        "",
        "A paragraph with **bold** and *italic*.",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "2. second",
        "",
        "> a quote",
        "",
        "![Cover](/portfolio/cover-aether.png)",
        "",
        "---",
      ].join("\n"),
    );
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ["heading", "paragraph", "list", "list", "quote", "image", "divider"],
    );
    const lists = blocks.filter((block) => block.kind === "list");
    assert.equal(lists[0].kind === "list" && lists[0].ordered, false);
    assert.equal(lists[1].kind === "list" && lists[1].ordered, true);
  });

  it("keeps unknown syntax as text instead of dropping it", () => {
    const blocks = parseMarkdown("```js\nconst x = 1\n```");
    assert.ok(blocks.length > 0);
    assert.equal(blocks.every((block) => block.kind === "paragraph"), true);
  });

  it("refuses an image with an unsafe source", () => {
    const blocks = parseMarkdown("![x](javascript:alert(1))");
    assert.equal(blocks[0].kind, "paragraph");
    assert.equal(isSafeSrc("javascript:alert(1)"), false);
    assert.equal(isSafeSrc("https://blob.example/x.png"), true);
    assert.equal(isSafeSrc("/portfolio/avatar.png"), true);
  });
});

describe("inline marks", () => {
  it("recognises the supported marks", () => {
    const nodes = inlineMarkdown("a **b** *c* `d`");
    const kinds = nodes.map((node) => (typeof node === "string" ? "text" : (node as { type: string }).type));
    assert.deepEqual(kinds, ["text", "strong", "text", "em", "text", "code"]);
  });

  it("never links an unsafe href", () => {
    const nodes = inlineMarkdown("[click](javascript:alert(1))");
    assert.equal(nodes.some((node) => typeof node !== "string" && (node as { type: string }).type === "a"), false);
    assert.equal(isSafeHref("mailto:a@b.co"), true);
    assert.equal(isSafeHref("javascript:alert(1)"), false);
  });
});

describe("markdown → components", () => {
  it("produces a valid section with one component per block", () => {
    const nodes = markdownToNodes("# Hi\n\nText\n\n- a\n- b\n\n![x](/portfolio/avatar.png)", nextId);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, "SECTION");
    const stack = nodes[0].children?.[0]?.children?.[0];
    assert.equal(stack?.type, "STACK");
    assert.deepEqual(stack?.children?.map((child) => child.type), ["HEADING", "TEXT", "TEXT", "IMAGE"]);

    const base = blankDocument();
    const candidate = { ...base, pages: [{ ...base.pages[0], root: { ...base.pages[0].root, children: nodes } }] };
    const result = parseDocument(candidate);
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
  });

  it("a markdown page is a document the validator accepts", () => {
    const doc = blankDocument();
    const page = doc.pages[0];
    const section = markdownToNodes("## About\n\nBuilt with **care**.\n\n1. one\n2. two", nextId)[0];
    const candidate = { ...doc, pages: [{ ...page, root: { ...page.root, children: [section] } }] };
    const result = parseDocument(candidate);
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
  });

  it("keeps ids unique across two conversions", () => {
    const first = markdownToNodes("# A\n\nx", nextId);
    const second = markdownToNodes("# B\n\ny", nextId);
    const ids = new Set<string>();
    const collect = (node: { id: string; children?: { id: string; children?: unknown }[] }): void => {
      ids.add(node.id);
      (node.children ?? []).forEach((child) => collect(child as never));
    };
    first.forEach((node) => collect(node as never));
    second.forEach((node) => collect(node as never));
    assert.equal(ids.size, 10);
  });
});
