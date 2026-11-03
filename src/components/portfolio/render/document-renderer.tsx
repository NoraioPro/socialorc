import { REGISTRY } from "@/lib/portfolio/registry";
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
    const common = { key: node.id, "data-pf-node": node.id, style: style ? cssToObject(style) : undefined } as const;
    const p = props(node);

    switch (node.type) {
      case "PAGE":
        return (
          <div {...common} data-pf-page="">
            {node.children?.map(renderNode)}
          </div>
        );
      case "SECTION":
        return (
          <section {...common} id={typeof p.anchor === "string" ? p.anchor : undefined}>
            {node.children?.map(renderNode)}
          </section>
        );
      case "CONTAINER":
        return (
          <div {...common} style={{ ...cssToObject(style), ...containerBox(p) }}>
            {node.children?.map(renderNode)}
          </div>
        );
      case "STACK":
        return (
          <div {...common} style={{ ...cssToObject(style), display: "flex" }}>
            {node.children?.map(renderNode)}
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
            {node.children?.map(renderNode)}
          </div>
        );
      case "COLUMN":
        return (
          <div {...common} style={{ ...cssToObject(style), gridColumn: `span ${Number(p.span ?? 12)}`, order: Number(p.order ?? 0) }}>
            {node.children?.map(renderNode)}
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
        return <Tag {...common}>{text(p.text)}</Tag>;
      }
      case "TEXT":
        return (
          <p {...common} style={{ ...cssToObject(style), whiteSpace: "pre-wrap" }}>
            {text(p.text)}
          </p>
        );
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
        const key = node.mediaSha ?? text(p.assetId);
        const asset = media[key];
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
              <div data-pf-image-missing style={{ padding: 24, border: "1px dashed rgba(255,255,255,0.2)", color: "#a6a6b0", fontSize: 13 }}>
                {alt || "Image unavailable"}
              </div>
            )}
            {caption ? <figcaption style={{ fontSize: 12, color: "#a6a6b0", marginTop: 8 }}>{caption}</figcaption> : null}
          </figure>
        );
      }
      case "PROJECT_CARD": {
        const cover = p.coverAssetId ? media[text(p.coverAssetId)] : undefined;
        const href = isSafeHref(p.href) ? p.href : undefined;
        return (
          <article {...common} style={cardBox(style)}>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt={text(p.title)} style={{ width: "100%", height: "auto", borderRadius: 8, marginBottom: 12 }} loading="lazy" />
            ) : null}
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{text(p.title)}</h3>
              {text(p.year) ? <span style={{ fontSize: 12, color: "#a6a6b0" }}>{text(p.year)}</span> : null}
            </div>
            {text(p.summary) ? <p style={{ margin: "8px 0 0", color: "#a6a6b0", fontSize: 14 }}>{text(p.summary)}</p> : null}
            {Array.isArray(p.tags) && p.tags.length > 0 ? (
              <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: 0, margin: "12px 0 0" }}>
                {p.tags.map((tag) => (
                  <li key={String(tag)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: "rgba(255,255,255,0.08)" }}>{String(tag)}</li>
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
          <article {...common} style={{ ...cardBox(style), display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 16 }}>{text(p.title)}</strong>
              <span style={{ fontSize: 12, color: "#a6a6b0" }}>
                {text(p.start)} — {p.current ? "Present" : text(p.end)}
              </span>
            </div>
            <span style={{ fontSize: 13, color: "#a6a6b0" }}>{text(p.org)}</span>
            {bullets.length > 0 ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#ededf1", fontSize: 14 }}>
                {bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
              </ul>
            ) : null}
          </article>
        );
      }
      case "SKILL_GROUP": {
        const items = Array.isArray(p.items) ? (p.items as string[]) : [];
        return (
          <div {...common}>
            {text(p.title) ? <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{text(p.title)}</h3> : null}
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li key={item} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(72,237,133,0.12)", color: "#48ed85" }}>{item}</li>
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
            {email ? <a href={`mailto:${email}`} style={{ color: "#48ed85", fontSize: 16 }}>{email}</a> : null}
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
    <div data-pf-root="" style={{ background: "#131317", color: "#ededf1", fontFamily: "var(--font-hanken), system-ui, sans-serif" }}>
      {css ? <style>{css}</style> : null}
      {renderNode(page.root)}
    </div>
  );
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
  const align = typeof p.align === "string" ? p.align : "center";
  return {
    maxWidth: `${Number(p.maxWidthPx ?? 1080)}px`,
    marginLeft: align === "right" ? "auto" : align === "center" ? "auto" : "0",
    marginRight: align === "left" ? "auto" : "auto",
    width: "100%",
  };
}

function buttonBox(p: Record<string, unknown>): React.CSSProperties {
  const variant = typeof p.variant === "string" ? p.variant : "primary";
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 18px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
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
