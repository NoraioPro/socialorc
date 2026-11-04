import { makeNode } from "./model";
import type { NodeType, PNode } from "./types";

/**
 * New components (what "Add" inserts) and the small samples shown in the
 * component library's preview pane.
 */
const N = makeNode;

export function newComponent(type: NodeType, ownerEmail = ""): PNode {
  switch (type) {
    case "section": return N("section", { label: "New section", anchor: "" });
    case "container": return N("container", {}, { padY: 28, padX: 28, bg: "surface" });
    case "stack": return N("stack");
    case "grid": return N("grid");
    case "column": return N("column");
    case "spacer": return N("spacer", {}, { height: 48 });
    case "divider": return N("divider");
    case "heading": return N("heading", { text: "A clear, specific heading", level: 2 });
    case "text": return N("text", { text: "Write in **Markdown**: add *emphasis*, [links](https://), lists and quotes." }, { color: "muted" });
    case "button": return N("button", { label: "Get in touch", href: ownerEmail ? `mailto:${ownerEmail}` : "#contact", variant: "filled" });
    case "image": return N("image", { src: null, alt: "", ratio: "4/3", shape: "rect" });
    case "project": return N("project", { variant: "card", ratio: "4/3", title: "Project title", role: "Your role", year: String(new Date().getFullYear()), summary: "The problem, what you did, and what changed because of it.", tags: ["Tag"], href: "", img: null });
    case "experience": return N("experience", { variant: "row", role: "Role", company: "Company", period: "2024 — now", location: "", desc: "What you owned, and what changed because of it." });
    case "skills": return N("skills", { title: "Skills", items: ["First skill", "Second skill", "Third skill"], variant: "chips" });
    case "social": return N("social", { links: [{ label: "LinkedIn", url: "https://linkedin.com/in/" }, { label: "Website", url: "https://" }], variant: "text" });
    case "contact": return N("contact", { variant: "card", heading: "Get in touch", text: "", email: ownerEmail, location: "", availability: "Open to new projects", button: "Email me" });
  }
}

export function previewSample(type: NodeType): PNode {
  const id = (s: string) => `prev-${type}-${s}`;
  const sec = (kids: PNode[], st = {}) => N("section", { label: "" }, { padY: 16, padX: 16, gap: 8, ...st }, kids, id("s"));
  switch (type) {
    case "section": return sec([N("heading", { text: "Selected work", level: 2 }, { size: 22 }, [], id("h")), N("text", { text: "A full-width band of your page." }, { color: "muted", size: 13 }, [], id("t"))]);
    case "container": return sec([N("container", {}, { padY: 16, padX: 16, bg: "surface", gap: 6 }, [N("heading", { text: "Grouped content", level: 3 }, { size: 16 }, [], id("h")), N("text", { text: "With its own padding and background." }, { color: "muted", size: 13 }, [], id("t"))], id("c"))]);
    case "stack": return sec([N("stack", {}, { gap: 8 }, [N("button", { label: "Primary", href: "#", variant: "filled" }, { size: 13 }, [], id("b1")), N("button", { label: "Secondary", href: "#", variant: "outline" }, { size: 13 }, [], id("b2"))], id("k"))]);
    case "grid": return sec([N("grid", {}, { cols: 3, gap: 8 }, [1, 2, 3].map((i) => N("container", {}, { padY: 26, bg: "surface" }, [], id("g" + i))), id("g"))]);
    case "column": return sec([N("column", {}, { gap: 4 }, [N("heading", { text: "Column", level: 3 }, { size: 16 }, [], id("h")), N("text", { text: "Items stack vertically." }, { color: "muted", size: 13 }, [], id("t"))], id("c"))]);
    case "spacer": return sec([N("text", { text: "Above" }, { size: 13, color: "muted" }, [], id("a")), N("container", {}, { padY: 16, border: 1, borderColor: "line", radius: 4 }, [], id("c")), N("text", { text: "Below" }, { size: 13, color: "muted" }, [], id("b"))], { gap: 0 });
    case "divider": return sec([N("text", { text: "Above" }, { size: 13, color: "muted" }, [], id("a")), N("divider", {}, {}, [], id("d")), N("text", { text: "Below" }, { size: 13, color: "muted" }, [], id("b"))], { gap: 12 });
    case "heading": return sec([N("heading", { text: "I turn complicated products into stories.", level: 2 }, { size: 24 }, [], id("h"))]);
    case "text": return sec([N("text", { text: "Eight years in **B2B content**. I build calendars that *survive* deadlines.\n\n- One weekly brief\n- One approval step" }, { size: 14, color: "muted" }, [], id("t"))]);
    case "button": return sec([N("stack", {}, { gap: 10 }, [N("button", { label: "Email me", href: "#", variant: "filled" }, { size: 13 }, [], id("b1")), N("button", { label: "Read more", href: "#", variant: "link" }, { size: 13 }, [], id("b2"))], id("k"))]);
    case "image": return sec([N("image", { src: "pipeline", alt: "", ratio: "16/9" }, { width: 180 }, [], id("i"))]);
    case "project": return sec([N("project", { title: "From 2 to 11 posts a week", role: "Fjord Co", year: "2025", img: "pipeline", variant: "overlay", ratio: "21/9" }, { size: 13 }, [], id("p"))]);
    case "experience": return sec([N("experience", { role: "Content lead", company: "Fjord Co", period: "2023 — now", desc: "Own the content calendar across seven channels.", variant: "stacked" }, { size: 13 }, [], id("e"))]);
    case "skills": return sec([N("skills", { title: "Writing", items: ["Long-form", "Product copy", "Editing"], variant: "chips" }, { size: 13 }, [], id("k"))]);
    case "social": return sec([N("social", { links: [{ label: "LinkedIn", url: "#" }, { label: "Substack", url: "#" }, { label: "Instagram", url: "#" }], variant: "pills" }, { size: 13 }, [], id("l"))]);
    case "contact": return sec([N("contact", { heading: "Have a story to tell?", email: "you@example.com", location: "Oslo", variant: "plain" }, { size: 12 }, [], id("c"))]);
  }
}
