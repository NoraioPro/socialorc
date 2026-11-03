/**
 * Markdown for portfolio content (P7).
 *
 * Two jobs:
 *  1. `parseMarkdown()` turns a Markdown document into portfolio nodes, so a user
 *     can write a page as text and get real, editable components out of it.
 *  2. `inlineMarkdown()` renders the small inline subset a TEXT node supports
 *     (bold, italic, code, links) as React nodes — never as HTML.
 *
 * There is no HTML pass-through anywhere: the parser only recognises the syntax
 * it understands, and everything else stays text.
 */
import type { ReactNode } from "react";
import type { PortfolioNode } from "./types";

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "divider" };

const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;
const SAFE_SRC = /^(\/|https:\/\/)/;
const SAFE_HREF = /^(https:\/\/|mailto:|\/)/;

export function isSafeSrc(value: string): boolean {
  return SAFE_SRC.test(value);
}

export function isSafeHref(value: string): boolean {
  return SAFE_HREF.test(value);
}

/** Split a Markdown document into blocks. Unknown syntax becomes a paragraph. */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (): void => {
    if (list && list.items.length > 0) blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2].trim() });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      blocks.push({ kind: "divider" });
      continue;
    }

    const image = IMAGE.exec(line.trim());
    if (image) {
      if (isSafeSrc(image[2])) {
        flushList();
        blocks.push({ kind: "image", alt: image[1].trim(), src: image[2] });
      } else {
        flushList();
        blocks.push({ kind: "paragraph", text: line.trim() });
      }
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1].trim());
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line.trim());
    if (ordered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1].trim());
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line.trim());
    if (quote) {
      flushList();
      blocks.push({ kind: "quote", text: quote[1].trim() });
      continue;
    }

    flushList();
    blocks.push({ kind: "paragraph", text: line.trim() });
  }

  flushList();
  return blocks;
}

/** Inline marks → React nodes. Links are re-validated; anything else is text. */
export function inlineMarkdown(text: string, keyPrefix = "md"): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={key}
          style={{
            fontFamily: "var(--font-plex-mono), monospace",
            fontSize: "0.92em",
            padding: "1px 5px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.07)",
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link && isSafeHref(link[2])) {
        out.push(
          <a key={key} href={link[2]} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {link[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function markdownHasContent(markdown: string): boolean {
  return parseMarkdown(markdown).length > 0;
}

/**
 * Turn a Markdown document into real portfolio nodes: one SECTION containing a
 * CONTAINER and a STACK, with a component per block. The result is ordinary
 * document content — every piece stays editable in the canvas afterwards.
 */
export function markdownToNodes(markdown: string, nextId: (kind: string) => string): PortfolioNode[] {
  const blocks = parseMarkdown(markdown);
  const children: PortfolioNode[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        children.push({ id: nextId("heading"), type: "HEADING", props: { text: block.text, level: block.level }, style: {} } as PortfolioNode);
        break;
      case "paragraph":
        children.push({ id: nextId("text"), type: "TEXT", props: { text: block.text, markdown: true }, style: {} } as PortfolioNode);
        break;
      case "list":
        children.push({
          id: nextId("text"),
          type: "TEXT",
          props: { text: block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${item}`).join("\n"), markdown: true },
          style: {},
        } as PortfolioNode);
        break;
      case "quote":
        children.push({ id: nextId("text"), type: "TEXT", props: { text: `> ${block.text}`, markdown: true }, style: {} } as PortfolioNode);
        break;
      case "image":
        children.push({ id: nextId("image"), type: "IMAGE", props: { assetId: "", src: block.src, alt: block.alt || "Image" }, style: {} } as PortfolioNode);
        break;
      case "divider":
        children.push({ id: nextId("divider"), type: "DIVIDER", props: { thicknessPx: 1, colorToken: "color.border-subtle", widthPct: 100, variant: "solid" }, style: {} } as PortfolioNode);
        break;
    }
  }

  return [
    {
      id: nextId("section"),
      type: "SECTION",
      props: { fullBleed: true },
      style: { paddingY: { value: 64 } },
      children: [
        {
          id: nextId("container"),
          type: "CONTAINER",
          props: { maxWidthPx: 820, align: "center" },
          style: {},
          children: [
            { id: nextId("stack"), type: "STACK", props: { direction: "column", gapPx: 18, align: "stretch", justify: "start" }, style: {}, children },
          ],
        },
      ],
    } as PortfolioNode,
  ];
}
