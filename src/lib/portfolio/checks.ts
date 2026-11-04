import { countH1, walk } from "./model";
import type { PortfolioDoc } from "./types";

export interface PublishCheck { level: "ok" | "info" | "warn" | "block"; text: string; nodeId?: string }

/** What the publish dialog shows. A `block` stops publishing. */
export function publishChecks(doc: PortfolioDoc, production = process.env.NODE_ENV === "production"): PublishCheck[] {
  const out: PublishCheck[] = [];
  if (!doc.root.length) out.push({ level: "block", text: "Your page is empty. Add at least one section before publishing." });
  out.push(doc.seo.title.trim() ? { level: "ok", text: "Page title and description are set" } : { level: "warn", text: "No page title yet. Search results will show your address only." });
  let noAlt: string | undefined;
  let noImg = 0;
  let dataImg: string | undefined;
  walk(doc.root, (n) => {
    const src = n.type === "image" ? n.props.src : n.type === "project" ? n.props.img : null;
    if (n.type === "image" && src && !n.props.alt && !noAlt) noAlt = n.id;
    if (n.type === "project" && !n.props.img && n.props.variant !== "list" && n.props.variant !== "outline") noImg++;
    if (src && src.startsWith("data:") && !dataImg) dataImg = n.id;
  });
  out.push(noAlt ? { level: "warn", text: "An image has no alt text.", nodeId: noAlt } : { level: "ok", text: "Images have alt text" });
  if (noImg) out.push({ level: "info", text: `${noImg} project card${noImg > 1 ? "s have" : " has"} no image. Visitors see a typographic cover.` });
  const h1 = countH1(doc);
  if (doc.root.length && h1 !== 1) out.push({ level: "warn", text: h1 ? `There are ${h1} H1 headings; one is recommended.` : "No H1 heading. Add a main title for search engines." });
  if (dataImg && production) out.push({ level: "block", text: "An image is stored only in your browser session. Upload it again before publishing.", nodeId: dataImg });
  return out;
}

