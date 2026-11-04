"use client";

import { useEffect, useRef, useState } from "react";
import { PortfolioView } from "./render";
import { type PortfolioDoc, type Viewport, VIEWPORT_WIDTH } from "@/lib/portfolio/types";

/** A portfolio drawn at full size and scaled down to fit its box (template cards, dashboard). */
export function PortfolioThumb({ doc, scope, vp = "desktop", className = "" }: { doc: PortfolioDoc; scope: string; vp?: Viewport; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const W = VIEWPORT_WIDTH[vp];
  return (
    <div ref={ref} className={className} style={{ overflow: "hidden", position: "relative", width: "100%", height: "100%", background: doc.theme.bg }} aria-hidden="true">
      {w > 0 && (
        <div style={{ width: W, zoom: w / W, pointerEvents: "none" }} inert>
          <PortfolioView doc={doc} scope={scope} />
        </div>
      )}
    </div>
  );
}
