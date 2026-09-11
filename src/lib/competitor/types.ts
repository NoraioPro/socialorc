export type CompetitorPlatform = "LINKEDIN" | "X" | "INSTAGRAM" | "FACEBOOK" | "TIKTOK";

export type ThreatLevel = "low" | "medium" | "high";

export interface CompetitorCard {
  id: string;
  name: string;
  handle: string;
  platform: CompetitorPlatform;
  threatLevel: ThreatLevel;
  /** 0–100 mock overlap with our content themes */
  overlapScore: number;
  lastMove: string;
  signalSummary: string;
}

export interface CompetitorDigest {
  generatedAt: string;
  source: "mock";
  competitors: CompetitorCard[];
}
