"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Overlays (drawers, dialogs, toasts) render into the shell root. The page
 * itself scrolls inside a container that pins "fixed" children to the scrolled
 * content rather than the window, so a drawer opened halfway down a long page
 * would appear off-screen. The shell root carries the theme variables and fonts;
 * <body> is the fallback.
 */
export function Portal({ children, dir }: { children: ReactNode; dir?: "rtl" | "ltr" }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.querySelector<HTMLElement>(".so-root") ?? document.body), []);
  if (!el) return null;
  return createPortal(<div dir={dir}>{children}</div>, el);
}
