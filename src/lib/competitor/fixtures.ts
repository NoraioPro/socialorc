import type { CompetitorCard } from "./types";

/** Static mock competitors — no scraping, no live network calls. */
export const MOCK_COMPETITORS: CompetitorCard[] = [
  {
    id: "comp-orbit",
    name: "Orbit Social",
    handle: "@orbitsocial",
    platform: "LINKEDIN",
    threatLevel: "high",
    overlapScore: 78,
    lastMove: "Launched AI caption A/B tests for LinkedIn carousels",
    signalSummary: "Pushing thought-leadership volume; cadence up ~40% WoW (mock).",
  },
  {
    id: "comp-pulse",
    name: "PulseStack",
    handle: "@pulsestack",
    platform: "X",
    threatLevel: "medium",
    overlapScore: 61,
    lastMove: "Threaded product teardown series live for 5 days",
    signalSummary: "Engagement clustered on founder threads; replies outpace us (mock).",
  },
  {
    id: "comp-north",
    name: "Northbound HQ",
    handle: "@northboundhq",
    platform: "INSTAGRAM",
    threatLevel: "medium",
    overlapScore: 54,
    lastMove: "Reels pack on scheduling workflows",
    signalSummary: "Visual demos converting well; weak on LinkedIn (mock).",
  },
  {
    id: "comp-relay",
    name: "Relay Labs",
    handle: "@relaylabs",
    platform: "FACEBOOK",
    threatLevel: "low",
    overlapScore: 33,
    lastMove: "Community AMA with agency partners",
    signalSummary: "Local community play; limited multi-network reach (mock).",
  },
];
