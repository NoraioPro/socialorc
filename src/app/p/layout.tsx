import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./../socialork.css";

/**
 * Public portfolio layout.
 *
 * The portfolio pages live outside the authenticated shell, so the fonts and the
 * dark surface have to be established here: without this the renderer's
 * `var(--font-hanken)` is undefined and the page falls back to Geist, which makes
 * the public page look different from the editor it was designed in.
 */
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A professional portfolio built with SocialOrk.",
};

export default function PublicPortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${hanken.variable} ${plexMono.variable}`} style={{ background: "#0b0b0e", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
