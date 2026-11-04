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

const section = (style: Record<string, unknown>, children: PortfolioNode[], props: Record<string, unknown> = {}): PortfolioNode =>
  n("SECTION", { fullBleed: true, ...props }, style, children);
const container = (children: PortfolioNode[], props: Record<string, unknown> = {}): PortfolioNode =>
  n("CONTAINER", { maxWidthPx: 1120, align: "center", ...props }, {}, children);
const stack = (props: Record<string, unknown>, children: PortfolioNode[]): PortfolioNode =>
  n("STACK", { direction: "column", gapPx: 16, align: "stretch", justify: "start", ...props }, {}, children);
const heading = (value: string, level: 1 | 2 | 3, style: Record<string, unknown> = {}): PortfolioNode =>
  n("HEADING", { text: value, level }, style);
const text = (value: string, style: Record<string, unknown> = {}): PortfolioNode => n("TEXT", { text: value }, style);
const button = (label: string, href: string, variant = "primary"): PortfolioNode =>
  n("BUTTON", { label, href, variant, target: "self" }, {});
const spacer = (heightPx: number): PortfolioNode => n("SPACER", { heightPx, hideOn: [] }, {});
/** The small mono label above a section title (the reference's "02 / PORTFOLIO"). */
const eyebrow = (value: string): PortfolioNode =>
  n("TEXT", { text: value }, {
    fontFamily: { value: "ibm-plex-mono" },
    fontSize: { value: 11 },
    letterSpacing: { value: 0.14 },
    color: { value: "#48ed85" },
  });
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
    // Hero: cover image, display type, availability card.
    section(
      { paddingY: { value: 96 } },
      [
        container([
          n("GRID", { columns: 12, minColumnPx: 280, rowGapPx: 32, columnGapPx: 40 }, {}, [
            n("COLUMN", { span: 7, order: 0, alignV: "center" }, {}, [
              stack({ gapPx: 18 }, [
                n("IMAGE", { assetId: "", src: "/portfolio/avatar.png", alt: "Your Name", aspect: "1:1" }, {
                  width: { value: 96 },
                  radius: { value: 999 },
                  shadow: { value: "0 0 0 3px #131317, 0 0 0 5px rgba(72,237,133,0.6), 0 18px 40px -8px rgba(0,0,0,0.7)" },
                }),
                eyebrow("PORTFOLIO 2026"),
                n("HEADING", { text: "Your Name", level: 1, variant: "display" }, { fontFamily: { value: "source-serif" }, fontWeight: { value: 600 }, color: { value: "#f4f4f7" } }),
                text("Staff product designer building calm interfaces for complicated systems — trading terminals, editors, internal platforms.", { fontSize: { value: 18 }, color: { value: "#a6a6b0" }, maxWidth: { value: 540 }, lineHeight: { value: 1.65 } }),
                button("Get in touch", "mailto:you@example.com"),
              ]),
            ]),
            n("COLUMN", { span: 5, order: 0, alignV: "center" }, {}, [
              n("CONTAINER", { maxWidthPx: 400, align: "left" }, {
                background: { value: "rgba(255,255,255,0.045)" },
                borderWidth: { value: 1 },
                borderColor: { value: "rgba(255,255,255,0.10)" },
                radius: { value: 18 },
                paddingX: { value: 24 },
                paddingY: { value: 24 },
              }, [
                stack({ gapPx: 10 }, [
                  n("TEXT", { text: "AVAILABLE FOR WORK" }, { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 10.5 }, letterSpacing: { value: 0.14 }, color: { value: "#48ed85" } }),
                  heading("Oslo · Remote", 3, { fontSize: { value: 22 }, fontWeight: { value: 600 } }),
                  text("Product design, design systems and front-end. Open to long engagements.", { fontSize: { value: 13.5 }, color: { value: "#a6a6b0" }, lineHeight: { value: 1.6 } }),
                ]),
              ]),
            ]),
          ]),
        ]),
      ],
      { backgroundSrc: "/portfolio/banner.png", minHeightPx: 460 },
    ),

    // Numbers band.
    section({ background: { value: "#0c0c0f" }, paddingY: { value: 32 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 180, rowGapPx: 16, columnGapPx: 16 }, {}, [
          ...[
            ["12", "years designing"],
            ["40+", "shipped projects"],
            ["3", "design systems"],
            ["2", "teams led"],
          ].map(([value, label]) =>
            n("COLUMN", { span: 3, order: 0, alignV: "start" }, {}, [
              stack({ gapPx: 2 }, [
                heading(value, 2, { fontSize: { value: 36 }, fontWeight: { value: 600 }, color: { value: "#48ed85" }, letterSpacing: { value: -0.03 } }),
                n("TEXT", { text: label }, { fontSize: { value: 12 }, color: { value: "#8f8f99" } }),
              ]),
            ]),
          ),
        ]),
      ]),
    ]),

    // About: copy plus imagery, so the page is not text-only.
    section({ background: { value: "#101014" }, paddingY: { value: 80 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 280, rowGapPx: 32, columnGapPx: 40 }, {}, [
          n("COLUMN", { span: 6, order: 0, alignV: "center" }, {}, [
            stack({ gapPx: 14 }, [
              eyebrow("ABOUT"),
              heading("I work where systems and craft meet.", 2, { fontSize: { value: 32 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.025 }, lineHeight: { value: 1.18 } }),
              text("Twelve years of product design, mostly on tools people use all day. I care about typography, motion and the boring details that make software feel calm.", { fontSize: { value: 15.5 }, color: { value: "#b4b4be" }, lineHeight: { value: 1.72 }, maxWidth: { value: 520 } }),
              n("TEXT", { text: "Currently **Staff Product Designer** at Aether — building the design system behind the trading terminal.", markdown: true }, { fontSize: { value: 14.5 }, color: { value: "#d7d7de" }, lineHeight: { value: 1.7 } }),
            ]),
          ]),
          n("COLUMN", { span: 6, order: 0, alignV: "center" }, {}, [
            n("IMAGE", { assetId: "", src: "/portfolio/cover-atlas.jpg", alt: "Studio", aspect: "16:9" }, { radius: { value: 18 }, shadow: { ref: "shadow.lg" } }),
          ]),
        ]),
      ]),
    ]),

    // Selected work: a full 2-up grid plus one wide row, never a lone half card.
    section({ background: { value: "#0f0f13" }, paddingY: { value: 80 } }, [
      container([
        stack({ gapPx: 22 }, [
          eyebrow("01 — SELECTED WORK"),
          heading("Selected work", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.025 } }),
          n("GRID", { columns: 12, minColumnPx: 280, rowGapPx: 24, columnGapPx: 24 }, {}, [
            n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [
              n("PROJECT_CARD", { title: "Aether Protocol", summary: "A liquidity terminal for institutional traders. A design system that keeps dense, real-time data calm under pressure.", year: "2025", href: "https://example.com/aether", tags: ["fintech", "design system"], featured: true, coverSrc: "/portfolio/cover-aether.jpg", variant: "wide" }, { radius: { value: 16 }, shadow: { ref: "shadow.md" } }),
            ]),
            n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [
              n("PROJECT_CARD", { title: "Strata OS", summary: "A canvas where several AI agents collaborate: shared cursor, live task graph, no tab switching.", year: "2024", tags: ["ai", "canvas"], featured: false, coverSrc: "/portfolio/cover-strata.jpg", variant: "overlay" }, { radius: { value: 16 }, shadow: { ref: "shadow.md" } }),
            ]),
            n("COLUMN", { span: 12, order: 0, alignV: "stretch" }, {}, [
              n("PROJECT_CARD", { title: "Nordic Commerce", summary: "Headless retail for a Nordic group: five storefronts, one catalogue, one component API.", year: "2024", tags: ["retail", "platform"], featured: false, coverSrc: "/portfolio/cover-nordic.jpg", variant: "default" }, { radius: { value: 16 }, shadow: { ref: "shadow.md" } }),
            ]),
          ]),
        ]),
      ]),
    ]),

    // Experience: full-width timeline.
    section({ paddingY: { value: 80 } }, [
      container([
        stack({ gapPx: 22 }, [
          eyebrow("02 — EXPERIENCE"),
          heading("Experience", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.025 } }),
          n("EXPERIENCE_ITEM", { title: "Staff Product Designer", org: "Aether", start: "2022-03", current: true, bullets: ["Owned the design system used by four product teams", "Shipped the institutional trading terminal"] }, {}),
          n("EXPERIENCE_ITEM", { title: "Senior Product Designer", org: "Nordic Commerce", start: "2019-01", end: "2022-02", current: false, bullets: ["Built the headless retail engine's interface layer"] }, {}),
          n("EXPERIENCE_ITEM", { title: "Product Designer", org: "Studio North", start: "2016-05", end: "2018-12", current: false, bullets: ["Client work across fintech and media"], variant: "card" }, {}),
        ]),
      ]),
    ]),

    // Skills: three bordered cards.
    section({ background: { value: "#101014" }, paddingY: { value: 80 } }, [
      container([
        stack({ gapPx: 22 }, [
          eyebrow("03 — SKILLS"),
          heading("What I bring", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.025 } }),
          n("GRID", { columns: 12, minColumnPx: 220, rowGapPx: 16, columnGapPx: 20 }, {}, [
            n("COLUMN", { span: 4, order: 0, alignV: "start" }, {}, [
              n("CONTAINER", { maxWidthPx: 400, align: "left" }, { background: { value: "rgba(255,255,255,0.035)" }, borderWidth: { value: 1 }, borderColor: { value: "rgba(255,255,255,0.09)" }, radius: { value: 16 }, paddingX: { value: 20 }, paddingY: { value: 20 } }, [
                n("SKILL_GROUP", { title: "Design", items: ["Design systems", "Motion", "Accessibility", "Prototyping"], variant: "matrix" }, {}),
              ]),
            ]),
            n("COLUMN", { span: 4, order: 0, alignV: "start" }, {}, [
              n("CONTAINER", { maxWidthPx: 400, align: "left" }, { background: { value: "rgba(255,255,255,0.035)" }, borderWidth: { value: 1 }, borderColor: { value: "rgba(255,255,255,0.09)" }, radius: { value: 16 }, paddingX: { value: 20 }, paddingY: { value: 20 } }, [
                n("SKILL_GROUP", { title: "Engineering", items: ["React", "TypeScript", "CSS architecture", "Playwright"], variant: "matrix" }, {}),
              ]),
            ]),
            n("COLUMN", { span: 4, order: 0, alignV: "start" }, {}, [
              n("CONTAINER", { maxWidthPx: 400, align: "left" }, { background: { value: "rgba(255,255,255,0.035)" }, borderWidth: { value: 1 }, borderColor: { value: "rgba(255,255,255,0.09)" }, radius: { value: 16 }, paddingX: { value: 20 }, paddingY: { value: 20 } }, [
                n("SKILL_GROUP", { title: "Tools", items: ["Figma", "Framer", "Storybook", "Linear"], variant: "matrix" }, {}),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]),

    // Contact: a centred band.
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 80 } }, [
      container([
        n("CONTAINER", { maxWidthPx: 760, align: "center" }, {
          background: { value: "radial-gradient(80% 130% at 50% 0%, rgba(72,237,133,0.16) 0%, rgba(17,17,20,1) 65%)" },
          borderWidth: { value: 1 },
          borderColor: { value: "rgba(255,255,255,0.10)" },
          radius: { value: 22 },
          paddingX: { value: 44 },
          paddingY: { value: 52 },
        }, [
          stack({ gapPx: 14, align: "center" }, [
            eyebrow("04 — CONTACT"),
            heading("Let’s build something calm.", 2, { fontSize: { value: 44 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.03 }, textAlign: { value: "center" }, lineHeight: { value: 1.1 } }),
            text("Tell me what you are building. I usually reply within a day.", { fontSize: { value: 15.5 }, color: { value: "#b4b4be" }, textAlign: { value: "center" }, maxWidth: { value: 460 } }),
            n("CONTACT_BLOCK", { email: "you@example.com", ctaLabel: "Book a call", note: "", variant: "card" }, {}),
            n("SOCIAL_LINKS", { links: [{ platform: "linkedin", url: "https://www.linkedin.com/" }, { platform: "github", url: "https://github.com/" }] }, {}),
          ]),
        ]),
      ]),
    ]),
  ]);
}

/** Terminal: mono, dense, list-heavy. */
export function terminalTemplate(): PortfolioDocument {
  return pageDocument([
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 112 } }, [
      container([
        stack({ gapPx: 12 }, [
          heading("~ your-name", 1, { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 38 }, color: { value: "#48ed85" } }),
          text("engineer · designer · builder", { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 13 }, color: { value: "#a6a6b0" } }),
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
    section({ paddingY: { value: 96 } }, [
      container([
        stack({ gapPx: 10 }, [
          eyebrow("VISUAL WORK"),
          heading("Your Name", 1, { fontSize: { value: 64 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.04 } }),
          text("Selected projects, 2019 — today.", { color: { value: "#a6a6b0" }, fontSize: { value: 15 } }),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 16 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 260, rowGapPx: 20, columnGapPx: 20 }, {}, [
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Aether Protocol", summary: "Terminal UI", year: "2025", tags: [], featured: true, coverSrc: "/portfolio/cover-aether.jpg" }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Nordic Commerce", summary: "Retail engine", year: "2024", tags: [], featured: false, coverSrc: "/portfolio/cover-nordic.jpg" }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Strata OS", summary: "Agent canvas", year: "2024", tags: [], featured: false, coverSrc: "/portfolio/cover-strata.jpg" }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Atlas", summary: "Data atlas", year: "2023", tags: [], featured: false, coverSrc: "/portfolio/cover-atlas.jpg" }, { radius: { value: 14 } })]),
        ]),
      ]),
    ]),
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 112 } }, [
      container([
        n("CONTAINER", { maxWidthPx: 720, align: "center" }, {
          borderWidth: { value: 1 },
          borderColor: { value: "rgba(255,255,255,0.10)" },
          radius: { value: 18 },
          paddingX: { value: 36 },
          paddingY: { value: 40 },
        }, [
          stack({ gapPx: 12, align: "center" }, [
            eyebrow("CONTACT"),
            heading("Say hello", 2, { fontSize: { value: 26 }, fontWeight: { value: 600 }, textAlign: { value: "center" } }),
            n("CONTACT_BLOCK", { email: "you@example.com", ctaLabel: "Start a project" }, {}),
          ]),
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
