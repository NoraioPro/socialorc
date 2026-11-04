"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { PortfolioView } from "./render";
import { VIEWPORT_ICON } from "./editor/icons";
import type { PortfolioDTO } from "@/lib/portfolio/server";
import { type Viewport, VIEWPORT_LABEL, VIEWPORT_WIDTH } from "@/lib/portfolio/types";

/** The draft exactly as visitors will see it once published, with no editor UI. */
export function PortfolioPreview() {
  const [p, setP] = useState<PortfolioDTO | null>(null);
  const [error, setError] = useState("");
  const [vp, setVp] = useState<Viewport>("desktop");
  useEffect(() => {
    void fetch("/api/portfolio").then(async (r) => {
      const d = await r.json().catch(() => null);
      if (!r.ok) setError(d?.error ?? "Could not load your portfolio.");
      else if (!d.portfolio) setError("You don’t have a portfolio yet.");
      else setP(d.portfolio);
    }).catch(() => setError("You appear to be offline."));
  }, []);
  if (error) return <div className="pe" style={{ padding: 32 }}><div className="pe-note warn">{error} <Link href="/socialork/portfolio">Back</Link></div></div>;
  if (!p) return <div className="pe" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0B0B0E" }}><Loader2 className="animate-spin" color="#A6A6B0" /></div>;
  const live = p.status === "PUBLISHED";
  return (
    <div className="pe" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: vp === "desktop" ? p.doc.theme.bg : "#121216" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--side)", borderBottom: "1px solid var(--line)", flexWrap: "wrap", color: "var(--text)" }}>
        <Link className="pe-btn" href="/portfolio/edit"><ChevronLeft size={14} />Back to editor</Link>
        <span className="pe-chip warn">Draft preview</span>
        <span style={{ fontSize: 12, color: "var(--text2)", flex: 1, minWidth: 200 }}>{live ? "This is your draft. Visitors still see the published version until you publish again." : "Not published yet. Only you can see this."}</span>
        <div className="pe-seg" role="group" aria-label="Preview width">
          {(["desktop", "tablet", "mobile"] as Viewport[]).map((k) => { const I = VIEWPORT_ICON[k]; return <button type="button" key={k} aria-pressed={vp === k} aria-label={VIEWPORT_LABEL[k]} title={VIEWPORT_LABEL[k]} style={{ padding: "0 10px", flex: "none" }} onClick={() => setVp(k)}><I size={14} /></button>; })}
        </div>
      </div>
      <div style={{ flex: 1, padding: vp === "desktop" ? 0 : "28px 16px" }}>
        <div style={vp === "desktop" ? { width: "100%" } : { width: VIEWPORT_WIDTH[vp], maxWidth: "100%", margin: "0 auto", borderRadius: vp === "mobile" ? 28 : 18, overflow: "clip", boxShadow: "0 0 0 1px rgba(255,255,255,.1), 0 30px 80px rgba(0,0,0,.5)" }}>
          <PortfolioView doc={p.doc} scope="preview" />
        </div>
      </div>
    </div>
  );
}
