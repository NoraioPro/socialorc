import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";

/**
 * The portfolio's own fonts. The editor (/portfolio/*) and the public page
 * (/p/*) sit outside the /socialork shell, which is where these are otherwise
 * loaded, so they set them up here. Geist and Geist Mono come from the root
 * layout.
 */
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const portfolioFontVars = `${hanken.variable} ${plexMono.variable}`;
