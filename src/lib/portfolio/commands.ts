/**
 * Document commands (P4 foundation).
 *
 * The editor never mutates a document in place: every user action is a command
 * that returns a **new** document, and the command refuses anything the registry
 * forbids. That is what keeps drag-and-drop from producing an invalid tree, and
 * it is why undo/redo is just a stack of documents.
 *
 * Pure module: no React, no network, no clock. Ids are supplied by the caller so
 * tests (and the browser) are deterministic.
 */
import { REGISTRY, childAllowed, isNodeType } from "./registry";
import { LIMITS, type PortfolioDocument, type PortfolioNode } from "./types";

export type Command =
  | { type: "insert"; parentId: string; index: number; node: PortfolioNode }
  | { type: "delete"; nodeId: string }
  | { type: "duplicate"; nodeId: string; newIds: string[] }
  | { type: "move"; nodeId: string; parentId: string; index: number }
  | { type: "reorder"; nodeId: string; direction: "up" | "down" }
  | { type: "updateProps"; nodeId: string; props: Record<string, unknown> }
  | { type: "updateStyle"; nodeId: string; style: Record<string, unknown> }
  | { type: "updateText"; nodeId: string; field: string; value: string };

export type CommandResult =
  | { ok: true; document: PortfolioDocument }
  | { ok: false; error: string };

interface Located {
  node: PortfolioNode;
  parent: PortfolioNode | null;
  index: number;
  depth: number;
}

function locate(document: PortfolioDocument, id: string): Located | null {
  let found: Located | null = null;
  const walk = (node: PortfolioNode, parent: PortfolioNode | null, index: number, depth: number): void => {
    if (found) return;
    if (node.id === id) {
      found = { node, parent, index, depth };
      return;
    }
    node.children?.forEach((child, childIndex) => walk(child, node, childIndex, depth + 1));
  };
  document.pages.forEach((page) => walk(page.root, null, 0, 1));
  return found;
}

/** Depth of the deepest node under `node` (1 = the node itself). */
function subtreeDepth(node: PortfolioNode): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map(subtreeDepth));
}

function countNodes(node: PortfolioNode): number {
  return 1 + (node.children ?? []).reduce((total, child) => total + countNodes(child), 0);
}

function totalNodes(document: PortfolioDocument): number {
  return document.pages.reduce((total, page) => total + countNodes(page.root), 0);
}

function cloneDocument(document: PortfolioDocument): PortfolioDocument {
  return structuredClone(document);
}

/** Replace one page's root in a copied document (pages are identified by id). */
function withPageRoot(document: PortfolioDocument, pageId: string, root: PortfolioNode): PortfolioDocument {
  const next = cloneDocument(document);
  const page = next.pages.find((candidate) => candidate.id === pageId);
  if (page) page.root = root;
  return next;
}

function pageOf(document: PortfolioDocument, nodeId: string): string | null {
  for (const page of document.pages) {
    const stack: PortfolioNode[] = [page.root];
    while (stack.length) {
      const current = stack.pop() as PortfolioNode;
      if (current.id === nodeId) return page.id;
      current.children?.forEach((child) => stack.push(child));
    }
  }
  return null;
}

function isDescendant(ancestor: PortfolioNode, candidateId: string): boolean {
  if (!ancestor.children?.length) return false;
  for (const child of ancestor.children) {
    if (child.id === candidateId || isDescendant(child, candidateId)) return true;
  }
  return false;
}

function mutate(
  document: PortfolioDocument,
  nodeId: string,
  change: (node: PortfolioNode) => void,
): PortfolioDocument | null {
  const pageId = pageOf(document, nodeId);
  if (!pageId) return null;
  const next = cloneDocument(document);
  const page = next.pages.find((candidate) => candidate.id === pageId);
  if (!page) return null;
  const walk = (node: PortfolioNode): boolean => {
    if (node.id === nodeId) {
      change(node);
      return true;
    }
    return (node.children ?? []).some(walk);
  };
  return walk(page.root) ? next : null;
}

export function applyCommand(document: PortfolioDocument, command: Command): CommandResult {
  switch (command.type) {
    case "insert": {
      if (!isNodeType(command.node.type)) return { ok: false, error: `Unknown component type ${command.node.type}.` };
      if (command.node.type === "PAGE") return { ok: false, error: "PAGE is the document root and cannot be inserted." };
      const parent = locate(document, command.parentId);
      if (!parent) return { ok: false, error: "Target container not found." };
      if (!REGISTRY[parent.node.type].allowsChildren) {
        return { ok: false, error: `${parent.node.type} cannot contain children.` };
      }
      if (!childAllowed(parent.node.type, command.node.type)) {
        return { ok: false, error: `${command.node.type} is not allowed inside ${parent.node.type}.` };
      }
      if (parent.depth + subtreeDepth(command.node) > LIMITS.maxDepth) {
        return { ok: false, error: `Nesting deeper than ${LIMITS.maxDepth} is not allowed.` };
      }
      if (totalNodes(document) + countNodes(command.node) > LIMITS.maxNodesPerDocument) {
        return { ok: false, error: `The document is limited to ${LIMITS.maxNodesPerDocument} nodes.` };
      }
      const pageId = pageOf(document, command.parentId);
      if (!pageId) return { ok: false, error: "Target container not found." };
      const next = cloneDocument(document);
      const page = next.pages.find((candidate) => candidate.id === pageId);
      if (!page) return { ok: false, error: "Page not found." };
      const walk = (node: PortfolioNode): boolean => {
        if (node.id === command.parentId) {
          const children = node.children ?? [];
          const index = Math.max(0, Math.min(command.index, children.length));
          node.children = [...children.slice(0, index), structuredClone(command.node), ...children.slice(index)];
          return true;
        }
        return (node.children ?? []).some(walk);
      };
      return walk(page.root) ? { ok: true, document: next } : { ok: false, error: "Target container not found." };
    }

    case "delete": {
      const target = locate(document, command.nodeId);
      if (!target) return { ok: false, error: "Node not found." };
      if (target.node.type === "PAGE") return { ok: false, error: "The page root cannot be deleted." };
      const pageId = pageOf(document, command.nodeId);
      if (!pageId) return { ok: false, error: "Node not found." };
      const copy = cloneDocument(document);
      const page = copy.pages.find((candidate) => candidate.id === pageId);
      if (!page) return { ok: false, error: "Page not found." };
      const walk = (node: PortfolioNode): boolean => {
        if (!node.children?.length) return false;
        const index = node.children.findIndex((child) => child.id === command.nodeId);
        if (index >= 0) {
          node.children.splice(index, 1);
          return true;
        }
        return node.children.some(walk);
      };
      return walk(page.root) ? { ok: true, document: copy } : { ok: false, error: "Node not found." };
    }

    case "duplicate": {
      const target = locate(document, command.nodeId);
      if (!target) return { ok: false, error: "Node not found." };
      if (!target.parent) return { ok: false, error: "A page root cannot be duplicated." };
      const needed = countNodes(target.node);
      if (command.newIds.length < needed) {
        return { ok: false, error: `duplicate needs ${needed} new ids.` };
      }
      let cursor = 0;
      const copyWithNewIds = (node: PortfolioNode): PortfolioNode => ({
        ...structuredClone(node),
        id: command.newIds[cursor++] as string,
        ...(node.children ? { children: node.children.map(copyWithNewIds) } : {}),
      });
      const clone = copyWithNewIds(target.node);
      const pageId = pageOf(document, command.nodeId);
      if (!pageId) return { ok: false, error: "Page not found." };
      const next = cloneDocument(document);
      const page = next.pages.find((candidate) => candidate.id === pageId);
      if (!page) return { ok: false, error: "Page not found." };
      const walk = (node: PortfolioNode): boolean => {
        if (!node.children) return false;
        const index = node.children.findIndex((child) => child.id === command.nodeId);
        if (index >= 0) {
          node.children.splice(index + 1, 0, clone);
          return true;
        }
        return node.children.some(walk);
      };
      return walk(page.root) ? { ok: true, document: next } : { ok: false, error: "Node not found." };
    }

    case "move": {
      const target = locate(document, command.nodeId);
      const parent = locate(document, command.parentId);
      if (!target || !parent) return { ok: false, error: "Node or destination not found." };
      if (!target.parent) return { ok: false, error: "A page root cannot be moved." };
      if (isDescendant(target.node, command.parentId)) {
        return { ok: false, error: "A container cannot be moved inside itself." };
      }
      if (!childAllowed(parent.node.type, target.node.type)) {
        return { ok: false, error: `${target.node.type} is not allowed inside ${parent.node.type}.` };
      }
      if (parent.depth + subtreeDepth(target.node) > LIMITS.maxDepth) {
        return { ok: false, error: `Nesting deeper than ${LIMITS.maxDepth} is not allowed.` };
      }
      const sourcePage = pageOf(document, command.nodeId);
      const destPage = pageOf(document, command.parentId);
      if (!sourcePage || !destPage) return { ok: false, error: "Page not found." };
      if (sourcePage !== destPage) return { ok: false, error: "Cross-page moves are not supported yet." };

      const removed = applyCommand(document, { type: "delete", nodeId: command.nodeId });
      if (!removed.ok) return removed;
      return applyCommand(removed.document, {
        type: "insert",
        parentId: command.parentId,
        index: command.index,
        node: target.node,
      });
    }

    case "reorder": {
      const target = locate(document, command.nodeId);
      if (!target?.parent) return { ok: false, error: "This node cannot be reordered." };
      const siblings = target.parent.children ?? [];
      const index = siblings.findIndex((child) => child.id === command.nodeId);
      const nextIndex = command.direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= siblings.length) return { ok: false, error: "Already at the edge." };
      const next = cloneDocument(document);
      const pageId = pageOf(document, command.nodeId);
      const page = next.pages.find((candidate) => candidate.id === pageId);
      if (!page) return { ok: false, error: "Page not found." };
      const walk = (node: PortfolioNode): boolean => {
        if (!node.children) return false;
        const at = node.children.findIndex((child) => child.id === command.nodeId);
        if (at >= 0) {
          const [moved] = node.children.splice(at, 1);
          node.children.splice(nextIndex, 0, moved);
          return true;
        }
        return node.children.some(walk);
      };
      return walk(page.root) ? { ok: true, document: next } : { ok: false, error: "Node not found." };
    }

    case "updateProps": {
      const next = mutate(document, command.nodeId, (node) => {
        node.props = { ...node.props, ...command.props };
      });
      return next ? { ok: true, document: next } : { ok: false, error: "Node not found." };
    }

    case "updateStyle": {
      const next = mutate(document, command.nodeId, (node) => {
        node.style = { ...node.style, ...(command.style as PortfolioNode["style"]) };
      });
      return next ? { ok: true, document: next } : { ok: false, error: "Node not found." };
    }

    case "updateText": {
      const next = mutate(document, command.nodeId, (node) => {
        node.props = { ...node.props, [command.field]: command.value };
      });
      return next ? { ok: true, document: next } : { ok: false, error: "Node not found." };
    }
  }
}

/** Where a new node would land when dropped on a target: last child of that node. */
export function appendIndex(node: PortfolioNode): number {
  return node.children?.length ?? 0;
}

export { locate as locateNode, totalNodes as countDocumentNodes, withPageRoot };
