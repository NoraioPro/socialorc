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
const MOTION_CSS = `
        /* motion: scroll reveal + hover, skipped entirely under reduced motion */
        @media (prefers-reduced-motion: no-preference) {
          @keyframes pf-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
          @supports (animation-timeline: view()) {
            [data-pf-root] > div > section { animation: pf-rise both; animation-timeline: view(); animation-range: entry 0% cover 26%; }
            .pf-card { animation: pf-rise both; animation-timeline: view(); animation-range: entry 6% cover 30%; }
          }
          .pf-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
          .pf-card:hover { transform: translateY(-3px); border-color: rgba(72,237,133,.4); box-shadow: 0 22px 50px rgba(0,0,0,.55); }
          .pf-card:hover .pf-card-media { transform: scale(1.035); }
          .pf-card-media { transition: transform .45s cubic-bezier(.16,.84,.3,1); }
          .pf-email { transition: opacity .2s ease; }
          .pf-email:hover { opacity: .8; }
        }
        .pf-meta { font-family: var(--font-plex-mono), monospace; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: #9a9aa4; }
        .pf-card { border-radius: 16px; }
        .pf-card img { display: block; }
        @media (max-width: 720px) {
          .pf-card[style*="grid-template-columns"] { grid-template-columns: minmax(0,1fr) !important; }
        }
`;

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
        const display = p.variant === "display";
        return (
          <Tag
            {...common}
            style={{
              margin: 0,
              letterSpacing: display ? "-0.045em" : "-0.02em",
              lineHeight: display ? 0.98 : 1.12,
              fontSize: display ? "clamp(44px, 7vw, 96px)" : undefined,
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
          (typeof p.coverSrc === "string" && p.coverSrc ? { url: p.coverSrc } : undefined) ??
          (p.coverAssetId ? media[text(p.coverAssetId)] : undefined);
        const href = isSafeHref(p.href) ? p.href : undefined;
        const variant = p.variant === "wide" || p.variant === "overlay" ? p.variant : "default";
        const meta = text(p.year) || "Case study";
        const tags = Array.isArray(p.tags) ? (p.tags as string[]) : [];

        const chips = tags.length ? (
          <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6, padding: 0, margin: "12px 0 0" }}>
            {tags.map((tag) => (
              <li key={String(tag)} style={{ fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", color: "#a6a6b0" }}>
                {String(tag)}
              </li>
            ))}
          </ul>
        ) : null;

        const mediaBlock = cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={text(p.title)} className="pf-card-media" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 12, display: "block" }} loading="lazy" />
        ) : (
          <div aria-hidden="true" className="pf-card-media" style={{ aspectRatio: "16 / 9", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", position: "relative", overflow: "hidden", display: "grid", placeItems: "center", background: "radial-gradient(120% 120% at 15% 10%, rgba(72,237,133,0.30) 0%, rgba(16,16,20,1) 58%), repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 9px)" }}>
            <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", color: "rgba(255,255,255,0.16)" }}>{(text(p.title) || "P").trim().slice(0, 2).toUpperCase()}</span>
          </div>
        );

        if (variant === "wide") {
          return (
            <article {...common} className="pf-card" style={{ ...cardBox(style), display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 24, alignItems: "center", padding: 20, width: "100%" }}>
              <div style={{ minWidth: 0, overflow: "hidden", borderRadius: 12 }}>{mediaBlock}</div>
              <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
                <span className="pf-meta">{meta}</span>
                <h3 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{text(p.title)}</h3>
                {text(p.summary) ? <p style={{ margin: 0, color: "#a6a6b0", fontSize: 14.5, lineHeight: 1.6 }}>{text(p.summary)}</p> : null}
                {chips}
                {href ? <a href={href} style={{ color: "#48ed85", fontSize: 13, marginTop: 2 }}>View project →</a> : null}
              </div>
            </article>
          );
        }

        if (variant === "overlay") {
          return (
            <article {...common} className="pf-card pf-card-overlay" style={{ ...cardBox(style), position: "relative", overflow: "hidden", padding: 0, minHeight: 320, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{ position: "absolute", inset: 0 }}>
                <div style={{ position: "absolute", inset: 0, transform: "scale(1.001)" }}>{mediaBlock}</div>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(6,8,10,0.96) 0%, rgba(6,8,10,0.35) 55%, transparent 100%)" }} />
              </div>
              <div style={{ position: "relative", padding: 24, display: "grid", gap: 8 }}>
                <span className="pf-meta">{meta}</span>
                <h3 style={{ margin: 0, fontSize: 24, letterSpacing: "-0.02em" }}>{text(p.title)}</h3>
                {text(p.summary) ? <p style={{ margin: 0, color: "#cfcfd6", fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}>{text(p.summary)}</p> : null}
              </div>
            </article>
          );
        }

        return (
          <article {...common} className="pf-card" style={{ ...cardBox(style), display: "flex", flexDirection: "column", gap: 12, width: "100%", minWidth: 0, padding: 20 }}>
            <div style={{ overflow: "hidden", borderRadius: 12 }}>{mediaBlock}</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <span className="pf-meta">{meta}</span>
              {p.featured === true ? <span style={{ fontSize: 10, color: "#48ed85", letterSpacing: "0.08em", textTransform: "uppercase" }}>featured</span> : null}
            </div>
            <h3 style={{ margin: 0, fontSize: 18, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{text(p.title)}</h3>
            {text(p.summary) ? <p style={{ margin: 0, color: "#a6a6b0", fontSize: 14, lineHeight: 1.55 }}>{text(p.summary)}</p> : null}
            {chips}
            {href ? <a href={href} style={{ color: "#48ed85", fontSize: 13, marginTop: 2 }}>View project →</a> : null}
          </article>
        );
      }
      case "EXPERIENCE_ITEM": {
        const bullets = Array.isArray(p.bullets) ? (p.bullets as string[]) : [];
        const dates = `${text(p.start)} — ${p.current ? "Present" : text(p.end)}`;
        if (p.variant === "card") {
          return (
            <article {...common} className="pf-card" style={{ ...cardBox(style), display: "grid", gap: 6, padding: 20, width: "100%" }}>
              <span className="pf-meta">{dates}</span>
              <strong style={{ fontSize: 18, letterSpacing: "-0.01em" }}>{text(p.title)}</strong>
              <span style={{ fontSize: 14, color: "#a1a1aa" }}>{text(p.org)}</span>
              {bullets.length ? (
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "#d7d7de", fontSize: 13.5, lineHeight: 1.6, listStyle: "disc" }}>
                  {bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
                </ul>
              ) : null}
            </article>
          );
        }
        return (
          <article {...common} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 24, borderLeft: "2px solid rgba(255,255,255,0.12)", padding: "10px 0 10px 24px", position: "relative", borderRadius: 0, ...cssToObject(style) }}>
            <span aria-hidden="true" style={{ position: "absolute", left: -7, top: 16, width: 12, height: 12, borderRadius: 999, background: "#48ed85" }} />
            <span className="pf-meta" style={{ color: "#9df3bd", paddingTop: 2 }}>{dates}</span>
            <div style={{ display: "grid", gap: 4 }}>
              <strong style={{ fontSize: 16.5, letterSpacing: "-0.01em" }}>{text(p.title)}</strong>
              <span style={{ fontSize: 14, color: "#a1a1aa" }}>{text(p.org)}</span>
              {bullets.length ? (
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
        const variant = p.variant === "list" || p.variant === "matrix" ? p.variant : "chips";
        const label = text(p.title) ? <span className="pf-meta">{text(p.title)}</span> : null;

        if (variant === "matrix") {
          return (
            <div {...common} className="pf-card" style={{ ...cardBox(style), padding: 20, display: "grid", gap: 10, width: "100%", height: "100%" }}>
              {label}
              <ul style={{ listStyle: "none", display: "grid", gap: 6, padding: 0, margin: 0 }}>
                {items.map((item) => (
                  <li key={item} style={{ fontSize: 13.5, color: "#ececf2", display: "flex", gap: 8, alignItems: "center" }}>
                    <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 999, background: "#48ed85", flex: "none" }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (variant === "list") {
          return (
            <div {...common} style={{ display: "grid", gap: 8 }}>
              {label}
              <ul style={{ listStyle: "none", display: "grid", gap: 4, padding: 0, margin: 0 }}>
                {items.map((item) => (
                  <li key={item} style={{ fontSize: 14, color: "#d7d7de", fontFamily: "var(--font-plex-mono), monospace" }}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }

        return (
          <div {...common} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {label}
            <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li key={item} style={{ fontSize: 12.5, padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(72,237,133,0.35)", background: "rgba(72,237,133,0.07)", color: "#9df3bd" }}>
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
        const body = (
          <>
            {email ? (
              <a href={`mailto:${email}`} className="pf-email" style={{ color: "#6cf59a", fontSize: 24, letterSpacing: "-0.01em", textDecoration: "none", borderBottom: "1px solid rgba(108,245,154,0.45)", paddingBottom: 3 }}>
                {email}
              </a>
            ) : null}
            <span style={{ fontSize: 14.5, color: "#e2e2e8" }}>{text(p.ctaLabel)}</span>
            {text(p.note) ? <span style={{ fontSize: 13, color: "#b4b4be" }}>{text(p.note)}</span> : null}
          </>
        );
        if (p.variant === "card") {
          return (
            <div {...common} className="pf-card" style={{ ...cardBox(style), padding: 32, display: "grid", gap: 10, justifyItems: "center", textAlign: "center", width: "100%" }}>
              {body}
            </div>
          );
        }
        return <div {...common} style={{ display: "grid", gap: 8, justifyItems: "start" }}>{body}</div>;
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
      <style>{`${css}${MOTION_CSS}`}</style>
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
