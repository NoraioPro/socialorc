/**
 * The three starter templates (P7).
 *
 * A template is just a document: starting from one copies it into the user's
 * portfolio, after which nothing links back — editing a template never rewrites
 * anybody's page.
 */
import { DEFAULT_TOKENS } from "./tokens";
import { PORTFOLIO_SCHEMA_VERSION, type PortfolioDocument, type PortfolioNode } from "./types";

let seq = 0;
const id = (prefix: string): string => `${prefix}-${(seq += 1).toString(36)}`;

const n = (
  type: string,
  props: Record<string, unknown> = {},
  style: Record<string, unknown> = {},
  children?: PortfolioNode[],
): PortfolioNode => ({ id: id(type.toLowerCase()), type, props, style, ...(children ? { children } : {}) }) as PortfolioNode;

const section = (style: Record<string, unknown>, children: PortfolioNode[]): PortfolioNode =>
  n("SECTION", { fullBleed: true }, style, children);
const container = (children: PortfolioNode[], props: Record<string, unknown> = {}): PortfolioNode =>
  n("CONTAINER", { maxWidthPx: 1080, align: "center", ...props }, {}, children);
const stack = (props: Record<string, unknown>, children: PortfolioNode[]): PortfolioNode =>
  n("STACK", { direction: "column", gapPx: 16, align: "stretch", justify: "start", ...props }, {}, children);
const heading = (value: string, level: 1 | 2 | 3, style: Record<string, unknown> = {}): PortfolioNode =>
  n("HEADING", { text: value, level }, style);
const text = (value: string, style: Record<string, unknown> = {}): PortfolioNode => n("TEXT", { text: value }, style);
const button = (label: string, href: string, variant = "primary"): PortfolioNode =>
  n("BUTTON", { label, href, variant, target: "self" }, {});
const spacer = (heightPx: number): PortfolioNode => n("SPACER", { heightPx, hideOn: [] }, {});
const divider = (): PortfolioNode =>
  n("DIVIDER", { thicknessPx: 1, colorToken: "color.border-subtle", widthPct: 100, variant: "solid" }, {});

function pageDocument(children: PortfolioNode[], tokens = DEFAULT_TOKENS): PortfolioDocument {
  return {
    schemaVersion: PORTFOLIO_SCHEMA_VERSION,
    tokens,
    pages: [
      {
        id: id("page"),
        slug: "home",
        title: "Home",
        isHome: true,
        seo: { title: "Your name", description: "Portfolio" },
        settings: {},
        root: { id: id("root"), type: "PAGE", props: {}, style: {}, children } as PortfolioNode,
      },
    ],
    meta: { locale: "en", createdAt: new Date().toISOString() },
  };
}

/** Editorial: wide, warm, type-led. */
export function editorialTemplate(): PortfolioDocument {
  return pageDocument([
    section({ background: { value: "#131317" }, paddingY: { value: 96 } }, [
      container([
        stack({ gapPx: 20 }, [
          heading("Your Name", 1, { fontSize: { value: 64 }, fontWeight: { value: 600 }, color: { value: "#ededf1" }, lineHeight: { value: 1.05 } }),
          text("Staff product designer. I build calm interfaces for complicated systems.", { fontSize: { value: 20 }, color: { value: "#a6a6b0" }, maxWidth: { value: 640 } }),
          button("Get in touch", "mailto:you@example.com"),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 72 } }, [
      container([
        stack({ gapPx: 24 }, [
          heading("Selected work", 2, { fontSize: { value: 32 } }),
          divider(),
          n("PROJECT_CARD", { title: "Aether Protocol", summary: "A liquidity terminal for institutional traders.", year: "2025", tags: ["fintech", "design system"] }, {}),
          n("PROJECT_CARD", { title: "Strata OS", summary: "A canvas where several AI agents collaborate.", year: "2024", tags: ["ai", "canvas"] }, {}),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 72 } }, [
      container([
        stack({ gapPx: 20 }, [
          heading("Experience", 2, { fontSize: { value: 32 } }),
          n("EXPERIENCE_ITEM", { title: "Staff Product Designer", org: "Aether", start: "2022-03", current: true, bullets: ["Led the design system", "Shipped the trading terminal"] }, {}),
          n("EXPERIENCE_ITEM", { title: "Senior Designer", org: "Nordic Commerce", start: "2019-01", end: "2022-02", current: false, bullets: ["Headless retail engine"] }, {}),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 72 } }, [
      container([
        stack({ gapPx: 20 }, [
          heading("Skills", 2, { fontSize: { value: 32 } }),
          n("SKILL_GROUP", { title: "Design", items: ["Design systems", "Motion", "Accessibility", "Prototyping"], variant: "chips" }, {}),
          n("SKILL_GROUP", { title: "Engineering", items: ["React", "TypeScript", "CSS architecture"], variant: "chips" }, {}),
        ]),
      ]),
    ]),
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 80 } }, [
      container([
        stack({ gapPx: 16, align: "start" }, [
          heading("Let’s talk", 2, { fontSize: { value: 28 } }),
          n("CONTACT_BLOCK", { email: "you@example.com", ctaLabel: "Book a call", note: "Usually replies within a day." }, {}),
          n("SOCIAL_LINKS", { links: [{ platform: "linkedin", url: "https://www.linkedin.com/" }, { platform: "github", url: "https://github.com/" }] }, {}),
        ]),
      ]),
    ]),
  ]);
}

/** Terminal: mono, dense, list-heavy. */
export function terminalTemplate(): PortfolioDocument {
  return pageDocument([
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 64 } }, [
      container([
        stack({ gapPx: 12 }, [
          heading("~ your-name", 1, { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 40 }, color: { value: "#48ed85" } }),
          text("engineer · designer · builder", { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 14 }, color: { value: "#a6a6b0" } }),
          spacer(8),
          n("EXPERIENCE_ITEM", { title: "Staff Engineer", org: "Aether", start: "2021-06", current: true, bullets: ["platform", "tooling"] }, { fontFamily: { value: "ibm-plex-mono" } }),
          n("EXPERIENCE_ITEM", { title: "Engineer", org: "Strata", start: "2018-02", end: "2021-05", current: false, bullets: ["agents", "canvas"] }, { fontFamily: { value: "ibm-plex-mono" } }),
          divider(),
          n("SKILL_GROUP", { title: "stack", items: ["typescript", "react", "postgres", "prisma"], variant: "list" }, { fontFamily: { value: "ibm-plex-mono" } }),
          n("SOCIAL_LINKS", { links: [{ platform: "github", url: "https://github.com/" }, { platform: "x", url: "https://x.com/" }] }, { fontFamily: { value: "ibm-plex-mono" } }),
        ]),
      ], { maxWidthPx: 820 }),
    ]),
  ]);
}

/** Gallery: image-led, two-column grid. */
export function galleryTemplate(): PortfolioDocument {
  return pageDocument([
    section({ paddingY: { value: 56 } }, [
      container([
        stack({ gapPx: 12 }, [
          heading("Your Name", 1, { fontSize: { value: 44 } }),
          text("Visual work, 2019 — today.", { color: { value: "#a6a6b0" } }),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 24 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 260, rowGapPx: 24, columnGapPx: 24 }, {}, [
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Aether Protocol", summary: "Terminal UI", year: "2025", tags: [], featured: true }, {})]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Nordic Commerce", summary: "Retail engine", year: "2024", tags: [], featured: false }, {})]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Strata OS", summary: "Agent canvas", year: "2024", tags: [], featured: false }, {})]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Atlas", summary: "Data atlas", year: "2023", tags: [], featured: false }, {})]),
        ]),
      ]),
    ]),
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 64 } }, [
      container([
        stack({ gapPx: 12, align: "start" }, [
          heading("Contact", 2, { fontSize: { value: 24 } }),
          n("CONTACT_BLOCK", { email: "you@example.com", ctaLabel: "Say hello" }, {}),
        ]),
      ]),
    ]),
  ]);
}

export interface TemplateEntry {
  key: string;
  name: string;
  description: string;
  build: () => PortfolioDocument;
}

export const TEMPLATES: TemplateEntry[] = [
  { key: "editorial", name: "Editorial", description: "Wide, type-led, warm.", build: editorialTemplate },
  { key: "terminal", name: "Terminal", description: "Mono, dense, list-heavy.", build: terminalTemplate },
  { key: "gallery", name: "Gallery", description: "Image-led two-column grid.", build: galleryTemplate },
];

export function templateByKey(key: string): TemplateEntry | undefined {
  return TEMPLATES.find((template) => template.key === key);
}
