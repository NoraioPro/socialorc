import { Fragment } from "react";
import { REGISTRY } from "@/lib/portfolio/registry";
import { inlineMarkdown, isSafeSrc, parseMarkdown } from "@/lib/portfolio/markdown";
import { responsiveRules, styleDeclarations } from "@/lib/portfolio/css";
import type { PortfolioDocument, PortfolioNode, TokenTable } from "@/lib/portfolio/types";

/**
 * The one renderer (P3).
 *
 * The editor canvas, the preview and the public page all call this component
 * with a *parsed* document, so what a user previews is what a visitor gets.
 * Nothing here reads the DOM, a theme context or user HTML: text is escaped by
 * React, links are re-checked against the scheme allowlist, and images come from
 * pinned media (published) or the media library (preview).
 */
export interface RenderMedia {
  url: string;
  width: number | null;
  height: number | null;
  mimeType: string;
}

export interface DocumentRenderProps {
  document: PortfolioDocument;
  /** Published revisions render from pinned media; a preview passes library URLs. */
  media: Record<string, RenderMedia>;
  /** Page slug to render; defaults to the home page. */
  slug?: string;
}


function justifyCss(value: unknown): string {
  switch (value) {
    case "center": return "center";
    case "end": return "flex-end";
    case "between": return "space-between";
    case "around": return "space-around";
    default: return "flex-start";
  }
}

function alignCss(value: unknown): string {
  switch (value) {
    case "start": return "flex-start";
    case "end": return "flex-end";
    case "center": return "center";
    default: return "stretch";
  }
}

function props(node: PortfolioNode): Record<string, unknown> {
  return { ...REGISTRY[node.type].defaults, ...node.props };
}

function isSafeHref(value: unknown): value is string {
  return typeof value === "string" && /^(https:\/\/|mailto:)/.test(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nodesOf(node: PortfolioNode, out: PortfolioNode[] = []): PortfolioNode[] {
  out.push(node);
  node.children?.forEach((child) => nodesOf(child, out));
  return out;
}

/**
 * Walks the page and renders one element per node. Styles are inline for the
 * desktop base and emitted as media-query rules for the overrides, so a node is
 * never duplicated in the DOM for another breakpoint.
 */
export function DocumentRenderer({ document, media, slug }: DocumentRenderProps) {
  const page = document.pages.find((candidate) => candidate.slug === slug) ?? document.pages.find((candidate) => candidate.isHome) ?? document.pages[0];
  if (!page) return null;

  const all = nodesOf(page.root);
  const css = responsiveRules(all, document.tokens);
  const tokens: TokenTable = document.tokens;

  const renderNode = (node: PortfolioNode): React.ReactNode => {
    const style = styleDeclarations(node.style, tokens);
    // `key` is passed at the call site, never spread (React warns otherwise).
    const common = { "data-pf-node": node.id, style: style ? cssToObject(style) : undefined } as const;
    const p = props(node);

    switch (node.type) {
      case "PAGE":
        return (
          <div {...common} data-pf-page="">
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </div>
        );
      case "SECTION":
        return (
          <section
            {...common}
            id={typeof p.anchor === "string" ? p.anchor : undefined}
            style={{
              paddingLeft: 24,
              paddingRight: 24,
              ...(p.minHeightPx ? { minHeight: `${Number(p.minHeightPx)}px` } : {}),
              ...(typeof p.backgroundSrc === "string" && p.backgroundSrc
                ? {
                    backgroundImage: `linear-gradient(180deg, rgba(10,10,12,0.35) 0%, rgba(10,10,12,0.92) 60%, #0b0b0e 100%), url(${p.backgroundSrc})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {}),
              ...cssToObject(style),
            }}
          >
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </section>
        );
      case "CONTAINER":
        return (
          <div {...common} style={{ ...cssToObject(style), ...containerBox(p) }}>
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </div>
        );
      case "STACK":
        return (
          <div
            {...common}
            style={{
              display: "flex",
              flexDirection: p.direction === "row" ? "row" : "column",
              flexWrap: p.wrap === true ? "wrap" : "nowrap",
              gap: `${Number(p.gapPx ?? 16)}px`,
              alignItems: alignCss(p.align),
              justifyContent: justifyCss(p.justify),
              ...cssToObject(style),
            }}
          >
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </div>
        );
      case "GRID":
        return (
          <div
            {...common}
            style={{
              ...cssToObject(style),
              display: "grid",
              gridTemplateColumns: `repeat(${Number(p.columns ?? 12)}, minmax(0, 1fr))`,
              rowGap: `${Number(p.rowGapPx ?? 24)}px`,
              columnGap: `${Number(p.columnGapPx ?? 24)}px`,
            }}
          >
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </div>
        );
      case "COLUMN":
        return (
          <div {...common} style={{ ...cssToObject(style), gridColumn: `span ${Number(p.span ?? 12)}`, order: Number(p.order ?? 0) }}>
            {node.children?.map((child) => (
              <Fragment key={child.id}>{renderNode(child)}</Fragment>
            ))}
          </div>
        );
      case "SPACER":
        return <div {...common} style={{ ...cssToObject(style), height: `${Number(p.heightPx ?? 32)}px` }} aria-hidden="true" />;
      case "DIVIDER":
        return (
          <hr
            {...common}
            style={{ ...cssToObject(style), borderTopWidth: `${Number(p.thicknessPx ?? 1)}px`, borderTopStyle: p.variant === "dashed" ? "dashed" : "solid", width: `${Number(p.widthPct ?? 100)}%` }}
          />
        );
      case "HEADING": {
        const level = Math.min(4, Math.max(1, Number(p.level ?? 2)));
        const Tag = (`h${level}` as unknown) as React.ElementType;
        return (
          <Tag
            {...common}
            style={{
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1.12,
              textWrap: "balance",
              ...cssToObject(style),
            }}
          >
            {text(p.text)}
          </Tag>
        );
      }
      case "TEXT": {
        const raw = text(p.text);
        if (p.markdown === true) {
          return (
            <div {...common} style={cssToObject(style)}>
              {renderMarkdownBlocks(raw)}
            </div>
          );
        }
        return (
          <p {...common} style={{ ...cssToObject(style), whiteSpace: "pre-wrap" }}>
            {raw}
          </p>
        );
      }
      case "BUTTON": {
        const href = isSafeHref(p.href) ? p.href : undefined;
        const external = href?.startsWith("https://") && p.target === "blank";
        const label = text(p.label) || "Learn more";
        const buttonStyle = { ...cssToObject(style), ...buttonBox(p) };
        return href ? (
          <a {...common} href={href} style={buttonStyle} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {label}
          </a>
        ) : (
          <span {...common} style={buttonStyle}>{label}</span>
        );
      }
      case "IMAGE": {
        const direct = typeof p.src === "string" && p.src ? { url: p.src, width: null, height: null, mimeType: "image/png" } : null;
        const key = node.mediaSha ?? text(p.assetId);
        const asset = direct ?? media[key];
        const alt = text(p.alt);
        const caption = text(p.caption);
        return (
          <figure {...common} style={{ ...cssToObject(style), margin: 0 }}>
            {asset ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.url}
                alt={alt}
                width={asset.width ?? undefined}
                height={asset.height ?? undefined}
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "auto", objectFit: (styleObject(style).objectFit as "cover" | "contain" | "none" | undefined) ?? "cover" }}
              />
            ) : (
              <div
                data-pf-image-missing
                style={{
                  aspectRatio: "16 / 9",
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background:
                    "radial-gradient(120% 120% at 20% 0%, rgba(72,237,133,0.22) 0%, rgba(18,18,22,1) 60%), repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)",
                }}
              >
                {alt || "Image"}
              </div>
            )}
            {caption ? <figcaption style={{ fontSize: 12, color: "#a6a6b0", marginTop: 8 }}>{caption}</figcaption> : null}
          </figure>
        );
      }
      case "PROJECT_CARD": {
        const cover =
          (typeof p.coverSrc === "string" && p.coverSrc ? { url: p.coverSrc, width: null, height: null, mimeType: "image/png" } : undefined) ??
          (p.coverAssetId ? media[text(p.coverAssetId)] : undefined);
        const href = isSafeHref(p.href) ? p.href : undefined;
        return (
          <article {...common} style={{ ...cardBox(style), display: "flex", flexDirection: "column", gap: 12, width: "100%", minWidth: 0, padding: 20 }}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover.url}
                alt={text(p.title)}
                style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 10, display: "block" }}
                loading="lazy"
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  aspectRatio: "16 / 9",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  position: "relative",
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  background:
                    "radial-gradient(120% 120% at 15% 10%, rgba(72,237,133,0.30) 0%, rgba(16,16,20,1) 58%), repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 9px)",
                }}
              >
                <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.16)" }}>
                  {(text(p.title) || "Project").trim().slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c7c87" }}>
                {text(p.year) || "Case study"}
              </span>
              {p.featured === true ? <span style={{ fontSize: 10, color: "#48ed85" }}>featured</span> : null}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{text(p.title)}</h3>
            {text(p.summary) ? <p style={{ margin: 0, color: "#a6a6b0", fontSize: 14, lineHeight: 1.55 }}>{text(p.summary)}</p> : null}
            {Array.isArray(p.tags) && p.tags.length > 0 ? (
              <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: 0, margin: "12px 0 0" }}>
                {p.tags.map((tag) => (
                  <li
                    key={String(tag)}
                    style={{
                      fontSize: 10.5,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "3px 9px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.14)",
                      color: "#a6a6b0",
                    }}
                  >
                    {String(tag)}
                  </li>
                ))}
              </ul>
            ) : null}
            {href ? <a href={href} style={{ display: "inline-block", marginTop: 12, color: "#48ed85", fontSize: 13 }}>View project →</a> : null}
          </article>
        );
      }
      case "EXPERIENCE_ITEM": {
        const bullets = Array.isArray(p.bullets) ? (p.bullets as string[]) : [];
        return (
          <article
            {...common}
            style={{
              display: "grid",
              gridTemplateColumns: "150px 1fr",
              gap: 24,
              borderLeft: "2px solid rgba(255,255,255,0.12)",
              padding: "10px 0 10px 24px",
              position: "relative",
              borderRadius: 0,
              ...cssToObject(style),
            }}
          >
            <span
              aria-hidden="true"
              style={{ position: "absolute", left: -7, top: 16, width: 12, height: 12, borderRadius: 999, background: "#48ed85" }}
            />
            <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, letterSpacing: "0.06em", color: "#9df3bd", textTransform: "uppercase", paddingTop: 2 }}>
              {text(p.start)} — {p.current ? "Present" : text(p.end)}
            </span>
            <div style={{ display: "grid", gap: 4 }}>
            <strong style={{ fontSize: 16.5, letterSpacing: "-0.01em" }}>{text(p.title)}</strong>
            <span style={{ fontSize: 14, color: "#a1a1aa" }}>{text(p.org)}</span>
            {bullets.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#d7d7de", fontSize: 13.5, lineHeight: 1.6, listStyle: "disc" }}>
                {bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
              </ul>
            ) : null}
            </div>
          </article>
        );
      }
      case "SKILL_GROUP": {
        const items = Array.isArray(p.items) ? (p.items as string[]) : [];
        return (
          <div {...common} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {text(p.title) ? (
              <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7c7c87" }}>
                {text(p.title)}
              </span>
            ) : null}
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li
                  key={item}
                  style={{
                    fontSize: 12.5,
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(72,237,133,0.35)",
                    background: "rgba(72,237,133,0.07)",
                    color: "#9df3bd",
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      }
      case "SOCIAL_LINKS": {
        const links = Array.isArray(p.links) ? (p.links as { platform: string; url: string }[]) : [];
        return (
          <ul {...common} style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 12, padding: 0, margin: 0 }}>
            {links.filter((link) => isSafeHref(link.url)).map((link) => (
              <li key={link.platform}>
                <a href={link.url} style={{ color: "#a6a6b0", fontSize: 13 }}>{link.platform}</a>
              </li>
            ))}
          </ul>
        );
      }
      case "CONTACT_BLOCK": {
        const email = text(p.email);
        return (
          <div {...common} style={{ display: "grid", gap: 8, justifyItems: "start" }}>
            {email ? (
              <a
                href={`mailto:${email}`}
                style={{ color: "#48ed85", fontSize: 22, letterSpacing: "-0.01em", textDecoration: "none", borderBottom: "1px solid rgba(72,237,133,0.35)", paddingBottom: 2 }}
              >
                {email}
              </a>
            ) : null}
            <span style={{ fontSize: 14, color: "#a6a6b0" }}>{text(p.ctaLabel)}</span>
            {text(p.note) ? <span style={{ fontSize: 13, color: "#8f8f99" }}>{text(p.note)}</span> : null}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div
      data-pf-root=""
      style={{
        background: "#131317",
        color: "#ededf1",
        fontFamily: "var(--font-hanken), system-ui, sans-serif",
        lineHeight: 1.55,
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
      }}
    >
      {css ? <style>{css}</style> : null}
      {renderNode(page.root)}
    </div>
  );
}


/** Markdown blocks as React nodes (TEXT with `markdown: true`). */
function renderMarkdownBlocks(markdown: string): React.ReactNode {
  return parseMarkdown(markdown).map((block, index) => {
    switch (block.kind) {
      case "heading": {
        const sizes: Record<number, number> = { 1: 40, 2: 30, 3: 22, 4: 18 };
        const Tag = (`h${block.level}` as unknown) as React.ElementType;
        return (
          <Tag key={index} style={{ margin: index === 0 ? 0 : "18px 0 0", fontSize: sizes[block.level], fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            {inlineMarkdown(block.text, `h${index}`)}
          </Tag>
        );
      }
      case "paragraph":
        return (
          <p key={index} style={{ margin: index === 0 ? 0 : "12px 0 0", fontSize: 15.5, lineHeight: 1.7, color: "#d7d7de" }}>
            {inlineMarkdown(block.text, `p${index}`)}
          </p>
        );
      case "list": {
        const Tag = (block.ordered ? "ol" : "ul") as unknown as React.ElementType;
        return (
          <Tag key={index} style={{ margin: index === 0 ? 0 : "12px 0 0", paddingLeft: 22, fontSize: 15.5, lineHeight: 1.7, color: "#d7d7de" }}>
            {block.items.map((item, i) => (
              <li key={i} style={{ marginTop: i === 0 ? 0 : 6 }}>{inlineMarkdown(item, `l${index}-${i}`)}</li>
            ))}
          </Tag>
        );
      }
      case "quote":
        return (
          <blockquote
            key={index}
            style={{ margin: index === 0 ? 0 : "14px 0 0", paddingLeft: 16, borderLeft: "2px solid rgba(72,237,133,0.4)", color: "#a6a6b0", fontSize: 15.5, lineHeight: 1.7 }}
          >
            {inlineMarkdown(block.text, `q${index}`)}
          </blockquote>
        );
      case "image":
        return isSafeSrc(block.src) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={block.src} alt={block.alt} style={{ width: "100%", borderRadius: 12, marginTop: index === 0 ? 0 : 16, display: "block" }} loading="lazy" />
        ) : null;
      case "divider":
        return <hr key={index} style={{ margin: "20px 0", border: 0, borderTop: "1px solid rgba(255,255,255,0.12)" }} />;
      default:
        return null;
    }
  });
}

/** Parse `a:b;c:d` back into a React style object (only what we emitted). */
function styleObject(css: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const part of css.split(";")) {
    const index = part.indexOf(":");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const value = part.slice(index + 1).trim();
    if (!value) continue;
    const camel = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    out[camel] = value;
  }
  return out;
}

function cssToObject(css: string): React.CSSProperties {
  return styleObject(css) as React.CSSProperties;
}

function containerBox(p: Record<string, unknown>): React.CSSProperties {
  void p;
  return {
    maxWidth: `${Number(p.maxWidthPx ?? 1080)}px`,
    marginLeft: "auto",
    marginRight: "auto",
    width: "100%",
    paddingLeft: 24,
    paddingRight: 24,
    boxSizing: "border-box",
  };
}

function buttonBox(p: Record<string, unknown>): React.CSSProperties {
  const variant = typeof p.variant === "string" ? p.variant : "primary";
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    flex: "none",
    width: "auto",
    height: 42,
    padding: "0 20px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    textDecoration: "none",
  };
  if (variant === "primary") return { ...base, background: "#48ed85", color: "#003917" };
  if (variant === "secondary") return { ...base, background: "rgba(255,255,255,0.08)", color: "#ededf1" };
  return { ...base, background: "transparent", color: "#48ed85", border: "1px solid rgba(72,237,133,0.4)" };
}

function cardBox(css: string): React.CSSProperties {
  return {
    ...cssToObject(css),
    background: (styleObject(css).background as string | undefined) ?? "#1b1b21",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 20,
  };
}
