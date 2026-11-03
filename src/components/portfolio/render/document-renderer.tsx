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


/** Static presentation rules: hover/focus/motion are CSS-only so the renderer stays hook-free. */
const PF_CSS = `
[data-pf-root]{--pf-accent:#48ed85;--pf-mono:var(--font-plex-mono),ui-monospace,monospace;position:relative;isolation:isolate}
[data-pf-root] h1,[data-pf-root] h2{font-feature-settings:"ss01","cv11"}
[data-pf-root] section[id],[data-pf-root] section{scroll-margin-top:24px}
[data-pf-root] section:not([data-pf-hero]) > [data-pf-node]{position:relative}
[data-pf-root] a:focus-visible,[data-pf-root] [tabindex]:focus-visible{outline:2px solid var(--pf-accent);outline-offset:3px;border-radius:8px}
[data-pf-root]::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.035;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.pf-btn{transition:transform .2s ease,box-shadow .2s ease,background-color .2s ease,border-color .2s ease}
.pf-btn:hover{transform:translateY(-2px)}
.pf-btn--primary{box-shadow:0 8px 24px -8px rgba(72,237,133,.55)}
.pf-btn--primary:hover{box-shadow:0 14px 32px -8px rgba(72,237,133,.7);background:#6bf59d!important}
.pf-btn--secondary:hover{background:rgba(255,255,255,.14)!important}
.pf-btn--ghost:hover{border-color:rgba(72,237,133,.8)!important;background:rgba(72,237,133,.08)!important}
.pf-card{position:relative;overflow:hidden;transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .3s ease,box-shadow .35s ease}
.pf-card:hover,.pf-card:focus-within{transform:translateY(-4px);border-color:rgba(72,237,133,.45)!important;box-shadow:0 24px 48px -24px rgba(0,0,0,.8),0 0 0 1px rgba(72,237,133,.15)!important}
.pf-card__media{position:relative;overflow:hidden;border-radius:10px;aspect-ratio:16/9;background:#101014}
.pf-card__media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.pf-card:hover .pf-card__media img{transform:scale(1.05)}
.pf-card__media::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);pointer-events:none}
.pf-card__link{transition:gap .2s ease,color .2s ease}
.pf-card__link:hover{color:#9df3bd!important}
.pf-card__link::after{content:"";position:absolute;inset:0}
.pf-card--featured{display:grid!important;grid-template-columns:1.35fr 1fr;gap:32px!important;align-items:center;padding:24px!important}
.pf-card--featured .pf-card__title{font-size:28px!important;letter-spacing:-.02em}
.pf-card--featured .pf-card__summary{font-size:15px!important;-webkit-line-clamp:4!important}
.pf-chip{transition:border-color .2s ease,color .2s ease,background-color .2s ease}
.pf-chip:hover{border-color:rgba(72,237,133,.5)!important;color:#d6fbe4!important}
.pf-exp{transition:background-color .25s ease}
.pf-exp::before{content:"";position:absolute;left:-1px;top:0;width:2px;height:0;background:var(--pf-accent);transition:height .4s ease}
.pf-exp:hover::before{height:100%}
.pf-exp__dot{transition:box-shadow .25s ease,transform .25s ease}
.pf-exp:hover .pf-exp__dot{transform:scale(1.2);box-shadow:0 0 0 5px rgba(72,237,133,.18),0 0 18px rgba(72,237,133,.6)!important}
.pf-skill{transition:border-color .3s ease,transform .3s ease,background-color .3s ease}
.pf-skill:hover{border-color:rgba(72,237,133,.35)!important;transform:translateY(-2px);background:rgba(255,255,255,.05)!important}
.pf-social{transition:color .2s ease,border-color .2s ease,transform .2s ease}
.pf-social:hover{color:#fff!important;border-color:rgba(72,237,133,.6)!important;transform:translateY(-1px)}
.pf-mail{transition:background-color .2s ease,transform .2s ease,box-shadow .2s ease}
.pf-mail:hover{background:#6bf59d!important;transform:translateY(-2px);box-shadow:0 16px 36px -10px rgba(72,237,133,.7)!important}
[data-pf-hero] .pf-stack > *{animation:pf-rise .8s cubic-bezier(.2,.7,.2,1) both}
[data-pf-hero] .pf-stack > *:nth-child(2){animation-delay:.08s}
[data-pf-hero] .pf-stack > *:nth-child(3){animation-delay:.16s}
[data-pf-hero] .pf-stack > *:nth-child(4){animation-delay:.24s}
[data-pf-hero] .pf-stack > *:nth-child(5){animation-delay:.32s}
@keyframes pf-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (max-width:900px){.pf-card--featured{grid-template-columns:1fr;gap:14px!important}.pf-card--featured .pf-card__title{font-size:22px!important}.pf-exp{grid-template-columns:1fr!important;gap:6px!important}}
@media (prefers-reduced-motion:reduce){[data-pf-root] *,[data-pf-root] *::before,[data-pf-root] *::after{animation:none!important;transition:none!important}.pf-card:hover,.pf-btn:hover,.pf-skill:hover,.pf-mail:hover{transform:none}.pf-card:hover .pf-card__media img{transform:none}}
`;

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
            {...(typeof p.backgroundSrc === "string" && p.backgroundSrc ? { "data-pf-hero": "" } : {})}
            style={{
              paddingLeft: 24,
              paddingRight: 24,
              position: "relative",
              ...(p.minHeightPx ? { minHeight: `${Number(p.minHeightPx)}px` } : {}),
              ...(typeof p.backgroundSrc === "string" && p.backgroundSrc
                ? {
                    backgroundImage: `radial-gradient(70% 80% at 15% 20%, rgba(72,237,133,0.10) 0%, transparent 60%), linear-gradient(180deg, rgba(10,10,12,0.25) 0%, rgba(10,10,12,0.78) 62%, #0b0b0e 100%), url(${p.backgroundSrc})`,
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
            className="pf-stack"
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
        const btnClass = `pf-btn pf-btn--${typeof p.variant === "string" ? p.variant : "primary"}`;
        return href ? (
          <a {...common} className={btnClass} href={href} style={buttonStyle} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {label}
          </a>
        ) : (
          <span {...common} className={btnClass} style={buttonStyle}>{label}</span>
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
                style={{ width: "100%", height: "auto", display: "block", objectFit: (styleObject(style).objectFit as "cover" | "contain" | "none" | undefined) ?? "cover" }}
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
        const featured = p.featured === true;
        const tags = Array.isArray(p.tags) ? p.tags : [];
        const category = tags.length > 0 ? String(tags[0]) : "";
        const meta = [text(p.year), category].filter(Boolean).join(" · ") || "Case study";
        return (
          <article
            {...common}
            className={featured ? "pf-card pf-card--featured" : "pf-card"}
            style={{ ...cardBox(style), display: "flex", flexDirection: "column", gap: 14, width: "100%", minWidth: 0, padding: 18, boxSizing: "border-box", height: "100%" }}
          >
            <div className="pf-card__media">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover.url} alt={text(p.title)} loading="lazy" decoding="async" />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    width: "100%",
                    height: "100%",
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
              {featured ? (
                <span
                  style={{
                    position: "absolute", top: 12, left: 12, zIndex: 1, fontFamily: "var(--pf-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                    padding: "5px 10px", borderRadius: 999, background: "rgba(11,11,14,0.72)", color: "#48ed85", border: "1px solid rgba(72,237,133,0.4)", backdropFilter: "blur(8px)",
                  }}
                >
                  Featured
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, flex: 1 }}>
              <span style={{ fontFamily: "var(--pf-mono)", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7c7c87" }}>{meta}</span>
              <h3 className="pf-card__title" style={{ margin: 0, fontSize: 20, letterSpacing: "-0.015em", lineHeight: 1.22, fontWeight: 600 }}>{text(p.title)}</h3>
              {text(p.summary) ? (
                <p
                  className="pf-card__summary"
                  style={{ margin: 0, color: "#a6a6b0", fontSize: 14, lineHeight: 1.6, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
                >
                  {text(p.summary)}
                </p>
              ) : null}
              {tags.length > 0 ? (
                <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: 0, margin: "4px 0 0" }}>
                  {tags.map((tag) => (
                    <li
                      key={String(tag)}
                      className="pf-chip"
                      style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", color: "#a6a6b0" }}
                    >
                      {String(tag)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {href ? (
                <a href={href} className="pf-card__link" style={{ display: "inline-block", marginTop: "auto", paddingTop: 8, color: "#48ed85", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  View project →
                </a>
              ) : null}
            </div>
          </article>
        );
      }
      case "EXPERIENCE_ITEM": {
        const bullets = Array.isArray(p.bullets) ? (p.bullets as string[]) : [];
        return (
          <article
            {...common}
            className="pf-exp"
            style={{
              display: "grid",
              gridTemplateColumns: "170px 1fr",
              gap: 28,
              borderLeft: "1px solid rgba(255,255,255,0.12)",
              padding: "6px 0 28px 32px",
              position: "relative",
              borderRadius: 0,
              ...cssToObject(style),
            }}
          >
            <span
              aria-hidden="true"
              className="pf-exp__dot"
              style={{ position: "absolute", left: -6, top: 12, width: 11, height: 11, borderRadius: 999, background: "#48ed85", boxShadow: "0 0 0 4px #131317, 0 0 12px rgba(72,237,133,0.45)" }}
            />
            <span style={{ fontFamily: "var(--pf-mono)", fontSize: 11, letterSpacing: "0.1em", color: "#9df3bd", textTransform: "uppercase", paddingTop: 5 }}>
              {text(p.start)} — {p.current ? "Present" : text(p.end)}
            </span>
            <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
              <strong style={{ fontSize: 19, letterSpacing: "-0.015em", fontWeight: 600, lineHeight: 1.25 }}>{text(p.title)}</strong>
              <span style={{ fontSize: 14, color: "#8f8f99" }}>{text(p.org)}</span>
              {bullets.length > 0 ? (
                <ul style={{ margin: "10px 0 0", padding: 0, color: "#d0d0d8", fontSize: 14.5, lineHeight: 1.7, listStyle: "none", display: "grid", gap: 4 }}>
                  {bullets.map((bullet, index) => (
                    <li key={index} style={{ position: "relative", paddingLeft: 20 }}>
                      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: "0.72em", width: 8, height: 1, background: "#48ed85" }} />
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        );
      }
      case "SKILL_GROUP": {
        const items = Array.isArray(p.items) ? (p.items as string[]) : [];
        return (
          <div
            {...common}
            className="pf-skill"
            style={{ display: "flex", flexDirection: "column", gap: 16, padding: 22, borderRadius: 16, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.025)", height: "100%", boxSizing: "border-box" }}
          >
            {text(p.title) ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--pf-mono)", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#48ed85" }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 2, background: "#48ed85" }} />
                {text(p.title)}
              </span>
            ) : null}
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li
                  key={item}
                  className="pf-chip"
                  style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d0d0d8" }}
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
          <ul {...common} style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 10, padding: 0, margin: 0, justifyContent: "center" }}>
            {links.filter((link) => isSafeHref(link.url)).map((link) => (
              <li key={link.platform}>
                <a
                  href={link.url}
                  className="pf-social"
                  style={{ display: "inline-block", color: "#a6a6b0", fontSize: 12.5, textDecoration: "none", padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", textTransform: "capitalize" }}
                >
                  {link.platform} ↗
                </a>
              </li>
            ))}
          </ul>
        );
      }
      case "CONTACT_BLOCK": {
        const email = text(p.email);
        return (
          <div {...common} style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
            {email ? (
              <a
                href={`mailto:${email}`}
                className="pf-mail"
                style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "#48ed85", color: "#003917", fontSize: 16, fontWeight: 600, textDecoration: "none", padding: "14px 28px", borderRadius: 14, boxShadow: "0 10px 28px -10px rgba(72,237,133,0.6)" }}
              >
                {email} <span aria-hidden="true">→</span>
              </a>
            ) : null}
            {text(p.ctaLabel) ? <span style={{ fontFamily: "var(--pf-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8f8f99" }}>{text(p.ctaLabel)}</span> : null}
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
      <style>{PF_CSS}</style>
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
    maxWidth: `${Number(p.maxWidthPx ?? 1120)}px`,
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
    height: 46,
    padding: "0 24px",
    borderRadius: 12,
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
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 18,
  };
}
