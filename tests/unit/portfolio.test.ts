import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TEMPLATES, personalise, templateById } from "../../src/lib/portfolio/templates";
import { parsePortfolioDoc } from "../../src/lib/portfolio/schema";
import { checkDrop, countNodes, dropNode, duplicateNode, insertNode, locate, makeNode, moveSibling, removeNode } from "../../src/lib/portfolio/model";
import { compilePortfolioCss, PortfolioView } from "../../src/components/portfolio/render";
import { renderMarkdown, safeHref } from "../../src/lib/portfolio/markdown";
import { publishChecks } from "../../src/lib/portfolio/checks";
import { applyMarkdown } from "../../src/components/portfolio/editor/markdown-editor";
import type { PortfolioDoc } from "../../src/lib/portfolio/types";

const stone = () => templateById("stone")!.make();

test("every template is a valid document and renders", () => {
  for (const t of TEMPLATES) {
    const doc = t.make();
    const r = parsePortfolioDoc(JSON.stringify(doc));
    assert.ok(r.ok, `${t.id}: ${r.ok ? "" : r.error}`);
    const html = renderToStaticMarkup(createElement(PortfolioView, { doc, scope: t.id }));
    assert.match(html, /class="pf-root/);
  }
});

test("template builds are deterministic (server and client render the same ids)", () => {
  assert.deepEqual(stone(), stone());
});

test("the schema refuses documents that break the page structure", () => {
  const doc = stone();
  const bad = JSON.parse(JSON.stringify(doc)) as PortfolioDoc;
  bad.root.push(makeNode("heading", { text: "Loose", level: 2 }));
  assert.equal(parsePortfolioDoc(bad).ok, false, "a non-section at page level is refused");
  const nested = JSON.parse(JSON.stringify(doc)) as PortfolioDoc;
  nested.root[0].kids.push(makeNode("section"));
  assert.equal(parsePortfolioDoc(nested).ok, false, "a section inside a section is refused");
  const evil = JSON.parse(JSON.stringify(doc)) as PortfolioDoc;
  evil.theme.bg = "red;}body{display:none";
  assert.equal(parsePortfolioDoc(evil).ok, false, "theme colours must be colours");
  assert.equal(parsePortfolioDoc("{not json").ok, false);
});

test("compiled CSS cascades desktop → tablet → phone and only repeats what changes", () => {
  const doc = stone();
  const css = compilePortfolioCss(doc, "t");
  assert.match(css, /@container pf \(max-width:1023px\)\{/);
  assert.match(css, /@container pf \(max-width:639px\)\{/);
  // The hero heading has an explicit phone size of 42px.
  const h1 = doc.root.flatMap(function all(n): typeof doc.root { return [n, ...n.kids.flatMap(all)]; }).find((n) => n.type === "heading" && n.props.level === 1)!;
  const phone = css.slice(css.indexOf("@container pf (max-width:639px)"));
  assert.match(phone, new RegExp(`\\.n-${h1.id}\\{[^}]*font-size:42px`));
  // Grids drop to one column on phones by default.
  assert.match(phone, /grid-template-columns:repeat\(1,minmax\(0,1fr\)\)/);
});

test("hiding an element per device is reversible at a smaller size", () => {
  const doc = stone();
  const sec = doc.root[0];
  sec.hide = { desktop: true };
  const css = compilePortfolioCss(doc, "h");
  assert.match(css, new RegExp(`\\.n-${sec.id}\\{display:none`));
  assert.match(css, new RegExp(`max-width:1023px\\)\\{[^@]*\\.n-${sec.id}\\{display:block`));
});

test("style values that aren't colours never reach the stylesheet", () => {
  const doc = stone();
  doc.root[0].style.bg = "red;}*{display:none}";
  const css = compilePortfolioCss(doc, "x");
  assert.doesNotMatch(css, /red;/);
  assert.doesNotMatch(css, /<\/style/i);
});

test("markdown renders a safe subset and neutralises dangerous links", () => {
  const html = renderToStaticMarkup(renderMarkdown("## Hi\n\n**bold** and *it* [x](javascript:alert(1)) <script>alert(1)</script>\n\n- a\n- b\n\n> quote"));
  assert.match(html, /<h3 class="pf-md-h pf-md-h2">Hi<\/h3>/);
  assert.match(html, /<strong class="pf-strong">bold<\/strong>/);
  assert.match(html, /<em>it<\/em>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<ul class="pf-md-list"><li>a<\/li><li>b<\/li><\/ul>/);
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("mailto:a@b.c"), "mailto:a@b.c");
});

test("markdown toolbar wraps the selection and toggles line prefixes", () => {
  assert.deepEqual(applyMarkdown("bold", "say hi", 4, 6), { text: "say **hi**", start: 6, end: 8 });
  assert.equal(applyMarkdown("ul", "a\nb", 0, 3).text, "- a\n- b");
  assert.equal(applyMarkdown("ul", "- a\n- b", 0, 7).text, "a\nb");
  assert.equal(applyMarkdown("ol", "a\nb", 0, 3).text, "1. a\n2. b");
});

test("tree edits: insert, move, duplicate, remove and drop rules", () => {
  const doc = stone();
  const n0 = countNodes(doc);
  const lone = insertNode(doc, makeNode("heading", { text: "New", level: 2 }), null, (k) => makeNode("section", {}, {}, [k]));
  assert.equal(countNodes(lone.doc), n0 + 2, "a component with nothing selected gets its own section");
  const first = doc.root[0];
  const moved = moveSibling(doc, first.id, 1);
  assert.equal(moved.root[1].id, first.id);
  const dup = duplicateNode(doc, first.id);
  assert.ok(dup.newId && dup.newId !== first.id);
  assert.equal(countNodes(dup.doc), n0 + 1 + (countNodes({ ...doc, root: [first] }) - 1));
  assert.equal(locate(removeNode(doc, first.id), first.id), null);
  const grid = doc.root.flatMap(function all(n): typeof doc.root { return [n, ...n.kids.flatMap(all)]; }).find((n) => n.type === "grid")!;
  assert.equal(checkDrop(doc, { type: "section" }, grid.id, "into").ok, false);
  assert.equal(checkDrop(doc, { id: first.id, type: "section" }, first.kids[0].id, "into").ok, false);
  assert.equal(checkDrop(doc, { type: "heading" }, grid.id, "into").ok, true);
  const dropped = dropNode(doc, { node: makeNode("text", { text: "x" }) }, grid.id, "into");
  assert.equal(locate(dropped, grid.id)!.n.kids.length, grid.kids.length + 1);
});

test("personalise swaps the template's sample name for the person's own", () => {
  const t = templateById("bold")!;
  const doc = personalise(t.make(), t.persona, "Sara Haugen");
  assert.equal(doc.owner.initials, "SH");
  assert.equal(doc.root[0].kids[0].kids[0].props.text, "SARA\nHAUGEN");
});

test("publish checks block an empty page and data: images in production", () => {
  const blank = templateById("blank")!.make();
  assert.ok(publishChecks(blank).some((c) => c.level === "block"));
  const doc = stone();
  const img = doc.root.flatMap(function all(n): typeof doc.root { return [n, ...n.kids.flatMap(all)]; }).find((n) => n.type === "image")!;
  img.props.src = "data:image/png;base64,AAAA";
  assert.ok(publishChecks(doc, true).some((c) => c.level === "block" && c.nodeId === img.id));
  assert.ok(!publishChecks(doc, false).some((c) => c.level === "block"));
});
