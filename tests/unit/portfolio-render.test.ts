import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DocumentRenderer } from "../../src/components/portfolio/render/document-renderer";
import { DEFAULT_TOKENS } from "../../src/lib/portfolio/tokens";
import { parseDocument } from "../../src/lib/portfolio/validate";
import type { PortfolioDocument, PortfolioNode } from "../../src/lib/portfolio/types";

let counter = 0;
const nid = (): string => `r${(counter += 1)}`;

const node = (type: string, props: Record<string, unknown> = {}, extra: Partial<PortfolioNode> = {}): PortfolioNode =>
  ({ id: nid(), type, props, style: {}, ...extra }) as PortfolioNode;

const pageDocument = (children: PortfolioNode[]): PortfolioDocument => ({
  schemaVersion: 1,
  tokens: DEFAULT_TOKENS,
  pages: [
    {
      id: "page-1",
      slug: "home",
      title: "Home",
      isHome: true,
      seo: { title: "Alex Morgan", description: "Portfolio" },
      settings: {},
      root: { id: nid(), type: "PAGE", props: {}, style: {}, children } as PortfolioNode,
    },
  ],
  meta: { locale: "en", createdAt: "2026-11-03T00:00:00.000Z" },
});

const render = (doc: PortfolioDocument, media: Record<string, { url: string; width: number | null; height: number | null; mimeType: string }> = {}): string =>
  renderToStaticMarkup(createElement(DocumentRenderer, { document: doc, media }));

const sectionWith = (children: PortfolioNode[]): PortfolioNode =>
  node("SECTION", { fullBleed: true }, { children: [node("STACK", {}, { children })] });

const assertParses = (doc: PortfolioDocument): PortfolioDocument => {
  const result = parseDocument(doc);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
  return result.ok ? result.document : doc;
};

describe("public renderer", () => {
  it("renders the six-section page with its text and structure", () => {
    const section = (children: PortfolioNode[]): PortfolioNode =>
      node("SECTION", { fullBleed: true }, { children: [node("CONTAINER", {}, { children })] });
    const doc = assertParses(
      pageDocument([
        section([node("HEADING", { text: "Alex Morgan", level: 1 })]),
        section([node("TEXT", { text: "Design philosophy" })]),
        section([node("PROJECT_CARD", { title: "Aether Protocol", year: "2025", tags: ["fintech"] })]),
        section([node("EXPERIENCE_ITEM", { title: "Staff Designer", org: "Aether", start: "2022-03", current: true, bullets: ["Led design systems"] })]),
        section([node("SKILL_GROUP", { title: "Systems", items: ["Tokens", "Motion"] })]),
        section([node("CONTACT_BLOCK", { email: "a@morgan.design", ctaLabel: "Book a call" })]),
      ]),
    );

    const html = render(doc);
    for (const expected of ["Alex Morgan", "Design philosophy", "Aether Protocol", "Staff Designer", "Tokens", "a@morgan.design"]) {
      assert.ok(html.includes(expected), `expected ${expected} in the output`);
    }
    assert.ok(html.includes("data-pf-root"), "the renderer marks its root");
    assert.equal((html.match(/data-pf-page/g) ?? []).length >= 1, true);
  });

  it("escapes user text instead of rendering HTML", () => {
    const doc = assertParses(pageDocument([sectionWith([node("TEXT", { text: "<script>alert(1)</script>" })])]));
    const html = render(doc);
    assert.ok(html.includes("&lt;script&gt;"), "the tag is escaped");
    assert.equal(html.includes("<script>alert(1)</script>"), false, "no raw script tag");
  });

  it("never emits a javascript: link, even if a node bypasses the registry", () => {
    // Deliberately bypasses parseDocument: the validator would reject this, and the
    // renderer must still be inert if a bad document ever reached it.
    const doc = pageDocument([sectionWith([node("BUTTON", { label: "x", href: "javascript:alert(1)" })])]);
    const html = render(doc);
    assert.equal(/javascript:/i.test(html), false);
    assert.ok(html.includes("x"), "the label still renders, as inert text");
  });

  it("renders pinned media with its frozen dimensions, and a fallback when missing", () => {
    const image = node("IMAGE", { assetId: "asset-1", alt: "Cover" }, { mediaSha: "a".repeat(64) } as Partial<PortfolioNode>);
    const doc = assertParses(pageDocument([sectionWith([image])]));

    const withMedia = render(doc, { ["a".repeat(64)]: { url: "https://blob.example/pinned.png", width: 1200, height: 800, mimeType: "image/png" } });
    assert.ok(withMedia.includes("https://blob.example/pinned.png"));
    assert.ok(withMedia.includes('width="1200"') && withMedia.includes('height="800"'));

    const withoutMedia = render(doc, {});
    assert.ok(withoutMedia.includes("data-pf-image-missing"), "a missing asset renders a labelled fallback");
    assert.ok(withoutMedia.includes("Cover"), "the alt text is the fallback label");
  });

  it("emits responsive overrides as media queries, not duplicated DOM", () => {
    const heading = node("HEADING", { text: "Hi", level: 1 }, { style: { fontSize: { value: 72 } }, responsive: { tablet: { fontSize: { value: 48 } }, mobile: { fontSize: { value: 32 } } } } as Partial<PortfolioNode>);
    const doc = assertParses(pageDocument([sectionWith([heading])]));
    const html = render(doc);

    assert.ok(html.includes("font-size:72px"), "desktop base is inline");
    assert.ok(html.includes("@media (max-width:1024px)"), "tablet rule exists");
    assert.ok(html.includes("@media (max-width:720px)"), "mobile rule exists");
    assert.ok(html.includes("font-size:48px") && html.includes("font-size:32px"));
    assert.equal((html.match(/<h1/g) ?? []).length, 1, "the heading is not duplicated per breakpoint");
  });

  it("resolves token references to literals in the output", () => {
    const doc = assertParses(
      pageDocument([node("SECTION", { fullBleed: true }, { style: { background: { ref: "color.surface-raised" } }, children: [node("STACK", {}, { children: [node("TEXT", { text: "x" })] })] })]),
    );
    const html = render(doc);
    assert.ok(html.includes("#1b1b21"), "the token was resolved to its literal");
  });
});
