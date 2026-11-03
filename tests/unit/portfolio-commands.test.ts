import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appendIndex, applyCommand, countDocumentNodes, locateNode } from "../../src/lib/portfolio/commands";
import { canRedo, canUndo, dispatch, initHistory, redo, undo, HISTORY_LIMIT } from "../../src/lib/portfolio/history";
import { blankDocument } from "../../src/lib/portfolio/blank";
import { DEFAULT_TOKENS } from "../../src/lib/portfolio/tokens";
import { parseDocument } from "../../src/lib/portfolio/validate";
import type { PortfolioDocument, PortfolioNode } from "../../src/lib/portfolio/types";

let counter = 0;
const nid = (): string => `c${(counter += 1)}`;

const node = (type: string, props: Record<string, unknown> = {}, children?: PortfolioNode[]): PortfolioNode =>
  ({ id: nid(), type, props, style: {}, ...(children ? { children } : {}) }) as PortfolioNode;

const page = (children: PortfolioNode[]): PortfolioDocument => ({
  schemaVersion: 1,
  tokens: DEFAULT_TOKENS,
  pages: [
    {
      id: "page-1",
      slug: "home",
      title: "Home",
      isHome: true,
      seo: {},
      settings: {},
      root: { id: "root-1", type: "PAGE", props: {}, style: {}, children } as PortfolioNode,
    },
  ],
  meta: { locale: "en", createdAt: "2026-11-03T00:00:00.000Z" },
});

const valid = (doc: PortfolioDocument): void => {
  const result = parseDocument(doc);
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
};

describe("editor commands", () => {
  it("inserts a legal child and refuses an illegal one", () => {
    const doc = page([node("SECTION", { fullBleed: true }, [])]);
    const sectionId = doc.pages[0].root.children?.[0].id as string;

    const good = applyCommand(doc, { type: "insert", parentId: sectionId, index: 0, node: node("CONTAINER") });
    assert.equal(good.ok, true);
    if (good.ok) valid(good.document);

    const bad = applyCommand(doc, { type: "insert", parentId: sectionId, index: 0, node: node("HEADING", { text: "x" }) });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.error, /not allowed inside SECTION/);
  });

  it("refuses to insert a PAGE or an unknown type", () => {
    const doc = page([node("SECTION", {}, [])]);
    const sectionId = doc.pages[0].root.children?.[0].id as string;
    assert.equal(applyCommand(doc, { type: "insert", parentId: sectionId, index: 0, node: node("PAGE") }).ok, false);
    assert.equal(applyCommand(doc, { type: "insert", parentId: sectionId, index: 0, node: node("CAROUSEL") }).ok, false);
  });

  it("deletes a node but never the page root", () => {
    const target = node("SECTION", {}, []);
    const doc = page([target]);
    const removed = applyCommand(doc, { type: "delete", nodeId: target.id });
    assert.equal(removed.ok, true);
    if (removed.ok) {
      assert.equal(removed.document.pages[0].root.children?.length, 0);
      assert.equal(countDocumentNodes(removed.document), 1);
    }
    assert.equal(applyCommand(doc, { type: "delete", nodeId: "root-1" }).ok, false);
  });

  it("duplicates a subtree with fresh ids and leaves the original alone", () => {
    const child = node("CONTAINER", {}, [node("HEADING", { text: "hi" })]);
    const section = node("SECTION", {}, [child]);
    const doc = page([section]);

    const ids = [nid(), nid()];
    const duplicated = applyCommand(doc, { type: "duplicate", nodeId: child.id, newIds: ids });
    assert.equal(duplicated.ok, true);
    if (!duplicated.ok) return;

    const children = duplicated.document.pages[0].root.children?.[0].children ?? [];
    assert.equal(children.length, 2);
    assert.equal(children[1].id, ids[0]);
    assert.equal(children[1].children?.[0].id, ids[1]);
    assert.notEqual(children[1].children?.[0].id, child.children?.[0].id);
    valid(duplicated.document);
  });

  it("refuses a duplicate without enough ids", () => {
    const child = node("CONTAINER", {}, [node("HEADING")]);
    const doc = page([node("SECTION", {}, [child])]);
    const result = applyCommand(doc, { type: "duplicate", nodeId: child.id, newIds: [nid()] });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /needs 2 new ids/);
  });

  it("moves a node between containers and refuses a move into itself", () => {
    const inner = node("STACK", {}, [node("HEADING", { text: "a" })]);
    const outer = node("STACK", {}, [inner]);
    const doc = page([node("SECTION", {}, [outer, node("CONTAINER", {}, [])])]);
    const containerId = (doc.pages[0].root.children?.[0].children ?? [])[1].id as string;

    const moved = applyCommand(doc, { type: "move", nodeId: inner.id, parentId: containerId, index: 0 });
    assert.equal(moved.ok, true);
    if (moved.ok) valid(moved.document);

    const intoItself = applyCommand(doc, { type: "move", nodeId: outer.id, parentId: inner.id, index: 0 });
    assert.equal(intoItself.ok, false);
    if (!intoItself.ok) assert.match(intoItself.error, /inside itself/);
  });

  it("reorders siblings and reports the edge", () => {
    const first = node("CONTAINER");
    const second = node("STACK", {}, []);
    const doc = page([node("SECTION", {}, [first, second])]);

    const down = applyCommand(doc, { type: "reorder", nodeId: first.id, direction: "down" });
    assert.equal(down.ok, true);
    if (down.ok) {
      const children = down.document.pages[0].root.children?.[0].children ?? [];
      assert.deepEqual(children.map((child) => child.id), [second.id, first.id]);
    }
    const edge = applyCommand(doc, { type: "reorder", nodeId: first.id, direction: "up" });
    assert.equal(edge.ok, false);
  });

  it("updates props and style without touching other nodes", () => {
    const heading = node("HEADING", { text: "old" });
    const doc = page([node("SECTION", {}, [node("STACK", {}, [heading])])]);

    const props = applyCommand(doc, { type: "updateText", nodeId: heading.id, field: "text", value: "new" });
    assert.equal(props.ok, true);
    if (props.ok) {
      const located = locateNode(props.document, heading.id);
      assert.equal(located?.node.props.text, "new");
      assert.equal(props.document.pages[0].root.children?.[0].children?.[0].props.anything, undefined);
    }

    const style = applyCommand(doc, { type: "updateStyle", nodeId: heading.id, style: { fontSize: { value: 48 } } });
    assert.equal(style.ok, true);
    if (style.ok) assert.deepEqual(locateNode(style.document, heading.id)?.node.style.fontSize, { value: 48 });
  });

  it("keeps the document immutable (the input is never mutated)", () => {
    const section = node("SECTION", {}, []);
    const doc = page([section]);
    const snapshot = JSON.stringify(doc);
    applyCommand(doc, { type: "insert", parentId: section.id, index: 0, node: node("CONTAINER") });
    assert.equal(JSON.stringify(doc), snapshot);
  });

  it("starts from a blank canvas that the validator accepts", () => {
    const doc = blankDocument();
    valid(doc);
    const sectionId = doc.pages[0].root.children?.[0].id as string;
    const added = applyCommand(doc, { type: "insert", parentId: sectionId, index: 0, node: node("CONTAINER") });
    assert.equal(added.ok, true);
    if (added.ok) {
      valid(added.document);
      assert.equal(appendIndex(added.document.pages[0].root.children?.[0] as PortfolioNode), 1);
    }
  });
});

describe("undo / redo", () => {
  it("walks back and forward through commands", () => {
    const section = node("SECTION", {}, []);
    const doc = page([section]);
    let state = initHistory(doc);
    assert.equal(canUndo(state), false);

    const inserted = dispatch(state, { type: "insert", parentId: section.id, index: 0, node: node("CONTAINER") });
    assert.equal(inserted.ok, true);
    state = inserted.state;
    assert.equal(canUndo(state), true);
    assert.equal(state.present.pages[0].root.children?.[0].children?.length, 1);

    state = undo(state);
    assert.equal(state.present.pages[0].root.children?.[0].children?.length, 0);
    assert.equal(canRedo(state), true);

    state = redo(state);
    assert.equal(state.present.pages[0].root.children?.[0].children?.length, 1);
  });

  it("a failed command changes nothing", () => {
    const doc = page([node("SECTION", {}, [])]);
    const state = initHistory(doc);
    const failed = dispatch(state, { type: "delete", nodeId: "root-1" });
    assert.equal(failed.ok, false);
    assert.equal(failed.state.past.length, 0);
    assert.equal(failed.state.present, state.present);
  });

  it("caps the undo stack", () => {
    const section = node("SECTION", {}, []);
    let state = initHistory(page([section]));
    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      const result = dispatch(state, { type: "insert", parentId: section.id, index: 0, node: node("CONTAINER") });
      if (!result.ok) break;
      state = result.state;
    }
    assert.ok(state.past.length <= HISTORY_LIMIT, `past ${state.past.length} ≤ ${HISTORY_LIMIT}`);
  });
});
