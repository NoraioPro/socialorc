import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { DesignLanding } from "@/components/socialork/design-landing";
import "./design-landing.css";

const hanken = Hanken_Grotesk({
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
    "Write once, get a draft for each channel, approve it, and publish to seven networks from one calendar.",
};

export default function HomePage() {
  return (
    <div className={`${hanken.className} ${plexMono.variable}`}>
      <DesignLanding />
    </div>
  );
}
