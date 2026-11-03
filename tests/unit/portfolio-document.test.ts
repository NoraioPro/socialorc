import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_TOKENS } from "../../src/lib/portfolio/tokens";
import { REGISTRY, USER_INSERTABLE_TYPES } from "../../src/lib/portfolio/registry";
import { mergeStyle, resolveStyle } from "../../src/lib/portfolio/responsive";
import { countNodes, findNode, parseDocument, referencedTokens } from "../../src/lib/portfolio/validate";
import type { PortfolioDocument, PortfolioNode } from "../../src/lib/portfolio/types";

let counter = 0;
const nid = (): string => `n${(counter += 1)}`;

interface NodeInit {
  props?: Record<string, unknown>;
  style?: Record<string, unknown>;
  responsive?: Record<string, unknown>;
  children?: unknown[];
  position?: unknown;
  mediaSha?: string;
}

const node = (type: string, init: NodeInit = {}): Record<string, unknown> => ({
  id: nid(),
  type,
  props: init.props ?? {},
  style: init.style ?? {},
  ...(init.responsive ? { responsive: init.responsive } : {}),
  ...(init.children ? { children: init.children } : {}),
  ...(init.position ? { position: init.position } : {}),
  ...(init.mediaSha ? { mediaSha: init.mediaSha } : {}),
});

const section = (children: unknown[], init: NodeInit = {}): Record<string, unknown> =>
  node("SECTION", { ...init, children });

const stack = (children: unknown[], init: NodeInit = {}): Record<string, unknown> =>
  node("STACK", { ...init, children });

const container = (children: unknown[], init: NodeInit = {}): Record<string, unknown> =>
  node("CONTAINER", { ...init, children });

const page = (children: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: nid(),
  slug: "home",
  title: "Home",
  isHome: true,
  seo: {},
  settings: {},
  root: { id: nid(), type: "PAGE", props: {}, style: {}, children },
  ...extra,
});

const documentOf = (pages: unknown[]): Record<string, unknown> => ({
  schemaVersion: 1,
  tokens: DEFAULT_TOKENS,
  pages,
  meta: { locale: "en", createdAt: "2026-11-01T00:00:00.000Z" },
});

/** The six-section page the architecture uses as its example. */
const sixSectionPage = (): Record<string, unknown> =>
  page([
    section([container([stack([node("HEADING", { props: { text: "Alex Morgan", level: 1 } })])])]),
    section([container([node("TEXT", { props: { text: "About" } })])]),
    section([container([node("PROJECT_CARD", { props: { title: "Aether Protocol" } })])]),
    section([container([node("EXPERIENCE_ITEM", { props: { title: "Staff Designer", org: "Aether", start: "2022-03", current: true } })])]),
    section([container([node("SKILL_GROUP", { props: { title: "Systems", items: ["tokens"] } })])]),
    section([container([node("CONTACT_BLOCK", { props: { email: "a@morgan.design" } })])]),
  ]);

const codes = (input: unknown): string[] => {
  const result = parseDocument(input);
  assert.equal(result.ok, false, "expected the document to be rejected");
  if (result.ok) return [];
  return result.issues.map((issue) => issue.code);
};

const paths = (input: unknown): string[] => {
  const result = parseDocument(input);
  if (result.ok) return [];
  return result.issues.map((issue) => issue.path);
};

describe("portfolio document — valid documents", () => {
  it("accepts a six-section page and counts its nodes", () => {
    const result = parseDocument(documentOf([sixSectionPage()]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // PAGE 1 + hero (SECTION + CONTAINER + STACK + HEADING = 4) + 5 × (SECTION + CONTAINER + leaf = 3)
    assert.equal(countNodes(result.document), 20);
  });

  it("accepts every registered component type in a legal position", () => {
    const all = section([
      container([
        stack([
          node("HEADING", { props: { text: "H" } }),
          node("TEXT", { props: { text: "T" } }),
          node("BUTTON", { props: { label: "Go", href: "https://example.com" } }),
          node("IMAGE", { props: { assetId: "asset_1" } }),
          node("DIVIDER"),
          node("SPACER"),
          node("PROJECT_CARD", { props: { title: "P" } }),
          node("EXPERIENCE_ITEM", { props: { title: "E", org: "O", start: "2020-01", current: true } }),
          node("SKILL_GROUP", { props: { title: "S", items: [] } }),
          node("SOCIAL_LINKS", { props: { links: [] } }),
          node("CONTACT_BLOCK", { props: { email: "a@b.co" } }),
          node("GRID", {
            props: { columns: 12 },
            children: [node("COLUMN", { props: { span: 6 }, children: [container([node("HEADING", { props: { text: "cell" } })])] })],
          }),
        ]),
      ]),
    ]);
    const result = parseDocument(documentOf([page([all])]));
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
    const used = new Set(USER_INSERTABLE_TYPES.filter((type) => JSON.stringify(all).includes(`"${type}"`)));
    assert.equal(used.size, USER_INSERTABLE_TYPES.length);
  });

  it("accepts position { mode: 'FLOW' }", () => {
    const doc = documentOf([page([section([container([node("HEADING", { props: { text: "x" }, position: { mode: "FLOW" } })])])])]);
    assert.equal(parseDocument(doc).ok, true);
  });

  it("exposes helpers: findNode and referencedTokens", () => {
    const heading = node("HEADING", { props: { text: "x" }, style: { color: { ref: "color.brand" } } });
    const result = parseDocument(documentOf([page([section([container([heading])])])]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const found = findNode(result.document, String(heading.id));
    assert.ok(found);
    assert.deepEqual([...referencedTokens(result.document)], ["color.brand"]);
  });
});

describe("portfolio document — structure", () => {
  it("rejects a SECTION inside a SECTION", () => {
    const doc = documentOf([page([section([section([container([node("HEADING")])])])])]);
    assert.ok(codes(doc).includes("child_type_not_allowed"));
  });

  it("rejects a GRID child that is not a COLUMN", () => {
    const doc = documentOf([page([section([container([node("GRID", { children: [node("HEADING")] })])])])]);
    assert.ok(codes(doc).includes("child_type_not_allowed"));
  });

  it("rejects children on a leaf component", () => {
    const doc = documentOf([page([section([container([node("HEADING", { children: [node("TEXT")] })])])])]);
    assert.ok(codes(doc).includes("children_not_allowed"));
  });

  it("rejects an unknown component type", () => {
    const doc = documentOf([page([section([container([node("CAROUSEL")])])])]);
    assert.ok(codes(doc).includes("node_type_unknown"));
  });

  it("rejects a PAGE root that is not a PAGE node", () => {
    const doc = documentOf([
      {
        id: "p1",
        slug: "home",
        title: "Home",
        isHome: true,
        seo: {},
        settings: {},
        root: { id: "r1", type: "SECTION", props: {}, style: {}, children: [] },
      },
    ]);
    assert.ok(codes(doc).includes("page_root_wrong_type"));
  });

  it("rejects a page with no sections", () => {
    const doc = documentOf([page([])]);
    assert.ok(codes(doc).includes("page_root_empty"));
  });

  it("rejects duplicate node ids (and therefore cycles)", () => {
    const duplicate = node("HEADING", { props: { text: "a" } });
    const doc = documentOf([page([section([container([duplicate, duplicate])])])]);
    assert.ok(codes(doc).includes("node_id_duplicate"));
  });

  it("rejects nesting deeper than the limit", () => {
    let inner: unknown = node("HEADING", { props: { text: "deep" } });
    for (let i = 0; i < 13; i += 1) inner = stack([inner]);
    const doc = documentOf([page([section([container([inner])])])]);
    assert.ok(codes(doc).includes("too_deep"));
  });

  it("rejects more pages than the limit", () => {
    const pages = Array.from({ length: 25 }, (_, index) =>
      page([section([container([node("TEXT")])])], { slug: `p-${index}`, isHome: index === 0 }),
    );
    assert.ok(codes(documentOf(pages)).includes("too_many_pages"));
  });

  it("rejects two home pages", () => {
    const doc = documentOf([
      page([section([container([node("TEXT")])])], { isHome: true }),
      page([section([container([node("TEXT")])])], { slug: "second", isHome: true }),
    ]);
    assert.ok(codes(doc).includes("pages_multiple_home"));
  });

  it("rejects an unsupported absolute position", () => {
    const doc = documentOf([page([section([container([node("HEADING", { position: { mode: "ABSOLUTE", x: 10 } })])])])]);
    assert.ok(codes(doc).includes("position_not_allowed"));
  });
});

describe("portfolio document — props", () => {
  it("rejects an unknown prop", () => {
    const doc = documentOf([page([section([container([node("HEADING", { props: { text: "a", glow: true } })])])])]);
    assert.ok(codes(doc).some((code) => code.startsWith("props_")));
  });

  it("rejects a missing required prop (contact email)", () => {
    const doc = documentOf([page([section([container([node("CONTACT_BLOCK", { props: {} })])])])]);
    assert.ok(codes(doc).some((code) => code.startsWith("props_")));
  });

  it("rejects a missing required prop (experience start)", () => {
    const doc = documentOf([page([section([container([node("EXPERIENCE_ITEM", { props: { title: "x", org: "y" } })])])])]);
    assert.ok(codes(doc).some((code) => code.startsWith("props_")));
  });

  it("rejects a non-allowlisted link scheme", () => {
    const doc = documentOf([page([section([container([node("BUTTON", { props: { label: "x", href: "javascript:alert(1)" } })])])])]);
    assert.ok(codes(doc).some((code) => code.startsWith("props_")));
  });

  it("rejects mediaSha outside an IMAGE node and a malformed digest", () => {
    const misplaced = documentOf([page([section([container([node("HEADING", { mediaSha: "a".repeat(64) })])])])]);
    assert.ok(codes(misplaced).includes("media_sha_misplaced"));
    const malformed = documentOf([page([section([container([node("IMAGE", { mediaSha: "abc" })])])])]);
    assert.ok(codes(malformed).includes("media_sha_invalid"));
  });
});

describe("portfolio document — styles and tokens", () => {
  it("rejects an unknown style key", () => {
    const doc = documentOf([page([section([container([node("HEADING", { style: { transform: { value: "scale(2)" } } })])])])]);
    assert.ok(codes(doc).includes("style_unknown_key"));
  });

  it("rejects out-of-range numbers", () => {
    const doc = documentOf([
      page([
        section(
          [container([node("HEADING", { style: { fontSize: { value: 400 }, opacity: { value: 3 } } })])],
          { style: { gap: { value: 900 } } },
        ),
      ]),
    ]);
    const out = codes(doc);
    assert.ok(out.filter((code) => code === "style_out_of_bounds").length >= 3);
  });

  it("rejects an unresolved token reference with its exact path", () => {
    const doc = documentOf([page([section([container([node("HEADING", { style: { color: { ref: "color.nope" } } })])])])]);
    const issuePaths = paths(doc);
    assert.ok(issuePaths.some((path) => path.endsWith(".style.color")));
    assert.ok(codes(doc).includes("token_missing"));
  });

  it("rejects a token from the wrong family", () => {
    const doc = documentOf([page([section([container([node("HEADING", { style: { color: { ref: "space.4" } } })])])])]);
    assert.ok(codes(doc).includes("token_family_mismatch"));
  });

  it("rejects a raw CSS string in place of a style value", () => {
    const doc = documentOf([page([section([container([node("HEADING", { style: { color: "#fff" } })])])])]);
    assert.ok(codes(doc).includes("style_value_shape"));
  });

  it("rejects a font family outside the allowlist", () => {
    const doc = documentOf([page([section([container([node("HEADING", { style: { fontFamily: { value: "Comic Sans" } } })])])])]);
    assert.ok(codes(doc).includes("style_font_family"));
  });
});

describe("portfolio document — responsive", () => {
  it("rejects an unknown breakpoint", () => {
    const doc = documentOf([page([section([container([node("HEADING", { responsive: { desktop: {} } })])])])]);
    assert.ok(codes(doc).includes("responsive_unknown_breakpoint"));
  });

  it("validates overrides with the same rules as the base style", () => {
    const doc = documentOf([page([section([container([node("HEADING", { responsive: { mobile: { fontSize: { value: 900 } } } })])])])]);
    assert.ok(codes(doc).includes("style_out_of_bounds"));
  });

  it("resolves mobile over tablet over desktop, per property", () => {
    const target = {
      style: { gap: { value: 8 }, paddingY: { value: 16 }, color: { ref: "color.brand" } },
      responsive: { tablet: { gap: { value: 24 } }, mobile: { gap: { value: 32 }, paddingY: { value: 4 } } },
    } as unknown as Pick<PortfolioNode, "style" | "responsive">;

    const desktop = resolveStyle(target, DEFAULT_TOKENS, "desktop");
    const tablet = resolveStyle(target, DEFAULT_TOKENS, "tablet");
    const mobile = resolveStyle(target, DEFAULT_TOKENS, "mobile");

    assert.equal(desktop.gap, 8);
    assert.equal(desktop.paddingY, 16);
    assert.equal(tablet.gap, 24);
    assert.equal(tablet.paddingY, 16, "an untouched property keeps the desktop value");
    assert.equal(mobile.gap, 32);
    assert.equal(mobile.paddingY, 4);
    assert.equal(mobile.color, "#48ed85", "token references resolve to their literal");
  });

  it("a literal beats its token at every viewport", () => {
    const target = { style: { color: { value: "#ff0000" } } } as unknown as Pick<PortfolioNode, "style" | "responsive">;
    assert.equal(resolveStyle(target, DEFAULT_TOKENS, "desktop").color, "#ff0000");
    assert.equal(mergeStyle(target, "mobile").color && resolveStyle(target, DEFAULT_TOKENS, "mobile").color, "#ff0000");
  });
});

describe("portfolio document — envelope and determinism", () => {
  it("rejects an unsupported schema version", () => {
    const doc = { ...documentOf([page([section([container([node("TEXT")])])])]), schemaVersion: 2 };
    assert.ok(codes(doc).includes("schema_version_unsupported"));
  });

  it("rejects malformed input without throwing", () => {
    for (const bad of [null, undefined, "nope", 42, [], {}]) {
      const result = parseDocument(bad);
      assert.equal(result.ok, false);
    }
  });

  it("returns the same issues for the same input (deterministic)", () => {
    const bad = documentOf([
      page([
        section([
          container([
            node("HEADING", { props: { glow: true }, style: { fontSize: { value: 400 } } }),
            node("GRID", { children: [node("TEXT")] }),
          ]),
        ]),
      ]),
    ]);
    const first = parseDocument(bad);
    const second = parseDocument(JSON.parse(JSON.stringify(bad)) as unknown);
    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    if (first.ok || second.ok) return;
    assert.deepEqual(first.issues, second.issues);
    assert.ok(first.issues.length >= 3);
  });

  it("keeps the registry closed: PAGE is not user-insertable", () => {
    assert.equal(USER_INSERTABLE_TYPES.includes("PAGE" as never), false);
    assert.equal(USER_INSERTABLE_TYPES.length, 16);
    assert.deepEqual(REGISTRY.PAGE.allowedChildren, ["SECTION"]);
    assert.deepEqual(REGISTRY.GRID.allowedChildren, ["COLUMN"]);
    assert.equal(REGISTRY.HEADING.allowsChildren, false);
  });
});

describe("portfolio document — document type shape", () => {
  it("parsed documents are typed and assignable", () => {
    const result = parseDocument(documentOf([sixSectionPage()]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const doc: PortfolioDocument = result.document;
    assert.equal(doc.pages.length, 1);
    assert.equal(doc.pages[0].root.type, "PAGE");
  });
});
