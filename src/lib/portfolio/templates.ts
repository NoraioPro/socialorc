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
/** The small mono label above a section title (the reference's "02 / PORTFOLIO"). */
const eyebrow = (value: string): PortfolioNode =>
  n("TEXT", { text: value }, {
    fontFamily: { value: "ibm-plex-mono" },
    fontSize: { value: 11 },
    letterSpacing: { value: 0.12 },
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
    section(
      {
        background: { value: "radial-gradient(70% 90% at 85% 0%, rgba(72,237,133,0.16) 0%, rgba(12,12,14,1) 60%)" },
        paddingY: { value: 80 },
      },
      [
        container([
          n("GRID", { columns: 12, minColumnPx: 280, rowGapPx: 28, columnGapPx: 40 }, {}, [
            n("COLUMN", { span: 7, order: 0, alignV: "center" }, {}, [
              stack({ gapPx: 16 }, [
                eyebrow("PORTFOLIO 2026"),
                heading("Your Name", 1, { fontSize: { value: 58 }, fontWeight: { value: 600 }, color: { value: "#ededf1" }, lineHeight: { value: 1.04 }, letterSpacing: { value: -0.03 } }),
                text("Staff product designer. I build calm interfaces for complicated systems.", { fontSize: { value: 19 }, color: { value: "#a6a6b0" }, maxWidth: { value: 520 }, lineHeight: { value: 1.6 } }),
                button("Get in touch", "mailto:you@example.com"),
              ]),
            ]),
            n("COLUMN", { span: 5, order: 0, alignV: "center" }, {}, [
              n("CONTAINER", { maxWidthPx: 380, align: "left" }, {
                background: { value: "rgba(255,255,255,0.04)" },
                borderWidth: { value: 1 },
                borderColor: { value: "rgba(255,255,255,0.10)" },
                radius: { value: 16 },
                paddingX: { value: 22 },
                paddingY: { value: 22 },
              }, [
                stack({ gapPx: 10 }, [
                  n("TEXT", { text: "AVAILABLE FOR WORK" }, { fontFamily: { value: "ibm-plex-mono" }, fontSize: { value: 10.5 }, letterSpacing: { value: 0.12 }, color: { value: "#48ed85" } }),
                  heading("Oslo · Remote", 3, { fontSize: { value: 20 }, fontWeight: { value: 600 } }),
                  text("Product design, design systems and front-end. Open to long engagements.", { fontSize: { value: 13.5 }, color: { value: "#a6a6b0" }, lineHeight: { value: 1.55 } }),
                ]),
              ]),
            ]),
          ]),
        ]),
      ],
    ),
    section({ background: { value: "#0c0c0f" }, paddingY: { value: 36 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 180, rowGapPx: 16, columnGapPx: 16 }, {}, [
          n("COLUMN", { span: 3, order: 0, alignV: "start" }, {}, [
            stack({ gapPx: 2 }, [
              heading("12", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, color: { value: "#48ed85" }, letterSpacing: { value: -0.02 } }),
              n("TEXT", { text: "years designing" }, { fontSize: { value: 12 }, color: { value: "#7c7c87" } }),
            ]),
          ]),
          n("COLUMN", { span: 3, order: 0, alignV: "start" }, {}, [
            stack({ gapPx: 2 }, [
              heading("40+", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, color: { value: "#48ed85" }, letterSpacing: { value: -0.02 } }),
              n("TEXT", { text: "shipped projects" }, { fontSize: { value: 12 }, color: { value: "#7c7c87" } }),
            ]),
          ]),
          n("COLUMN", { span: 3, order: 0, alignV: "start" }, {}, [
            stack({ gapPx: 2 }, [
              heading("3", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, color: { value: "#48ed85" }, letterSpacing: { value: -0.02 } }),
              n("TEXT", { text: "design systems" }, { fontSize: { value: 12 }, color: { value: "#7c7c87" } }),
            ]),
          ]),
          n("COLUMN", { span: 3, order: 0, alignV: "start" }, {}, [
            stack({ gapPx: 2 }, [
              heading("2", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, color: { value: "#48ed85" }, letterSpacing: { value: -0.02 } }),
              n("TEXT", { text: "teams led" }, { fontSize: { value: 12 }, color: { value: "#7c7c87" } }),
            ]),
          ]),
        ]),
      ]),
    ]),

    section({ background: { value: "#0f0f13" }, paddingY: { value: 64 } }, [
      container([
        stack({ gapPx: 16 }, [
          eyebrow("01"),
          heading("Selected work", 2, { fontSize: { value: 28 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.02 } }),
          n("GRID", { columns: 12, minColumnPx: 280, rowGapPx: 20, columnGapPx: 20 }, {}, [
            n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [
              n("PROJECT_CARD", { title: "Aether Protocol", summary: "A liquidity terminal for institutional traders.", year: "2025", tags: ["fintech", "design system"], featured: true }, { radius: { value: 14 }, shadow: { ref: "shadow.md" } }),
            ]),
            n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [
              n("PROJECT_CARD", { title: "Strata OS", summary: "A canvas where several AI agents collaborate.", year: "2024", tags: ["ai", "canvas"], featured: false }, { radius: { value: 14 }, shadow: { ref: "shadow.md" } }),
            ]),
          ]),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 64 } }, [
      container([
        stack({ gapPx: 16 }, [
          eyebrow("02"),
          heading("Experience", 2, { fontSize: { value: 28 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.02 } }),
          n("EXPERIENCE_ITEM", { title: "Staff Product Designer", org: "Aether", start: "2022-03", current: true, bullets: ["Led the design system", "Shipped the trading terminal"] }, {}),
          n("EXPERIENCE_ITEM", { title: "Senior Designer", org: "Nordic Commerce", start: "2019-01", end: "2022-02", current: false, bullets: ["Headless retail engine"] }, {}),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 64 } }, [
      container([
        stack({ gapPx: 16 }, [
          eyebrow("03"),
          heading("Skills", 2, { fontSize: { value: 28 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.02 } }),
          n("GRID", { columns: 12, minColumnPx: 240, rowGapPx: 16, columnGapPx: 24 }, {}, [
            n("COLUMN", { span: 6, order: 0, alignV: "start" }, {}, [
              n("SKILL_GROUP", { title: "Design", items: ["Design systems", "Motion", "Accessibility", "Prototyping"], variant: "chips" }, {}),
            ]),
            n("COLUMN", { span: 6, order: 0, alignV: "start" }, {}, [
              n("SKILL_GROUP", { title: "Engineering", items: ["React", "TypeScript", "CSS architecture"], variant: "chips" }, {}),
            ]),
          ]),
        ]),
      ]),
    ]),
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 64 } }, [
      container([
        n("CONTAINER", { maxWidthPx: 760, align: "center" }, {
          background: { value: "radial-gradient(80% 120% at 50% 0%, rgba(72,237,133,0.14) 0%, rgba(17,17,20,1) 65%)" },
          borderWidth: { value: 1 },
          borderColor: { value: "rgba(255,255,255,0.10)" },
          radius: { value: 20 },
          paddingX: { value: 40 },
          paddingY: { value: 48 },
        }, [
          stack({ gapPx: 14, align: "center" }, [
            eyebrow("04"),
            heading("Let’s talk", 2, { fontSize: { value: 34 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.02 }, textAlign: { value: "center" } }),
            text("Tell me what you are building. I usually reply within a day.", { fontSize: { value: 14.5 }, color: { value: "#a6a6b0" }, textAlign: { value: "center" }, maxWidth: { value: 460 } }),
            n("CONTACT_BLOCK", { email: "you@example.com", ctaLabel: "Book a call", note: "" }, {}),
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
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 64 } }, [
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
    section({ paddingY: { value: 56 } }, [
      container([
        stack({ gapPx: 10 }, [
          eyebrow("VISUAL WORK"),
          heading("Your Name", 1, { fontSize: { value: 42 }, fontWeight: { value: 600 }, letterSpacing: { value: -0.03 } }),
          text("Selected projects, 2019 — today.", { color: { value: "#a6a6b0" }, fontSize: { value: 15 } }),
        ]),
      ]),
    ]),
    section({ paddingY: { value: 16 } }, [
      container([
        n("GRID", { columns: 12, minColumnPx: 260, rowGapPx: 20, columnGapPx: 20 }, {}, [
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Aether Protocol", summary: "Terminal UI", year: "2025", tags: [], featured: true }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Nordic Commerce", summary: "Retail engine", year: "2024", tags: [], featured: false }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Strata OS", summary: "Agent canvas", year: "2024", tags: [], featured: false }, { radius: { value: 14 } })]),
          n("COLUMN", { span: 6, order: 0, alignV: "stretch" }, {}, [n("PROJECT_CARD", { title: "Atlas", summary: "Data atlas", year: "2023", tags: [], featured: false }, { radius: { value: 14 } })]),
        ]),
      ]),
    ]),
    section({ background: { value: "#0b0b0e" }, paddingY: { value: 64 } }, [
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
