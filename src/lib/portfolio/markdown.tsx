import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown subset rendered straight to React elements.
 *
 * Supported: `#`/`##`/`###` headings, paragraphs (single newlines become line
 * breaks), **bold**, *italic*, `code`, [links](https://…), `-`/`1.` lists,
 * `>` quotes and `---` dividers. There is no HTML pass-through: every character
 * of user text ends up as a React text node, and links only keep https:,
 * mailto: and #anchor targets.
 */

export function safeHref(url: string): string {
  const u = url.trim();
  return /^(https:\/\/|http:\/\/|mailto:|#)/i.test(u) ? u : "#";
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*)/;

export function renderInline(src: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = src;
  let k = 0;
  while (rest.length) {
    const m = INLINE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) out.push(<code key={key} className="pf-code">{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key} className="pf-strong">{renderInline(tok.slice(2, -2), key)}</strong>);
    else if (m[3]) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(<a key={key} className="pf-link pf-mdlink" href={safeHref(lm[2])}>{renderInline(lm[1], key)}</a>);
    } else out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

const withBreaks = (lines: string[], key: string): ReactNode[] =>
  lines.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...renderInline(l, `${key}-${i}`)] : renderInline(l, `${key}-${i}`)));

export function renderMarkdown(src: string): ReactNode {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  const para: string[] = [];
  let i = 0;
  const flush = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`} className="pf-md-p">{withBreaks(para.slice(), `p${blocks.length}`)}</p>);
      para.length = 0;
    }
  };
  while (i < lines.length) {
    const L = lines[i];
    let m: RegExpExecArray | null;
    if (!L.trim()) { flush(); i++; continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(L))) {
      flush();
      const lv = m[1].length;
      const key = `h${blocks.length}`;
      const Tag = (["h2", "h3", "h4"] as const)[lv - 1];
      blocks.push(<Tag key={key} className={`pf-md-h pf-md-h${lv}`}>{renderInline(m[2], key)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(L.trim())) { flush(); blocks.push(<hr key={`r${blocks.length}`} className="pf-md-hr" />); i++; continue; }
    if (/^>\s?/.test(L)) {
      flush();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, "")); i++; }
      const key = `q${blocks.length}`;
      blocks.push(<blockquote key={key} className="pf-md-quote">{withBreaks(q, key)}</blockquote>);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(L)) {
      flush();
      const ordered = /^\s*\d+\./.test(L);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "")); i++; }
      const key = `l${blocks.length}`;
      const lis = items.map((x, j) => <li key={`${key}-${j}`}>{renderInline(x, `${key}-${j}`)}</li>);
      blocks.push(ordered ? <ol key={key} className="pf-md-list">{lis}</ol> : <ul key={key} className="pf-md-list">{lis}</ul>);
      continue;
    }
    para.push(L);
    i++;
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}
