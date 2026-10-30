import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./landing.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SocialOrk — Nothing goes out without a yes.",
  description:
    "Write once, get a draft for each channel, approve it, and publish to seven networks from one calendar. Every post carries a record of who approved it and when.",
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${hanken.variable} ${plexMono.variable}`} style={{ minHeight: "100dvh" }}>
      {children}
    </div>
  );
}
