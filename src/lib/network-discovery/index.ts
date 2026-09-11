import { MOCK_EMERGING_NETWORKS } from "./fixtures";
import type {
  EmergingNetworkCard,
  ExperimentPriority,
  NetworkDiscoveryDigest,
} from "./types";

export type {
  EmergingNetworkCard,
  EmergingNetworkId,
  ExperimentPriority,
  NetworkDiscoveryDigest,
} from "./types";
export { MOCK_EMERGING_NETWORKS } from "./fixtures";

const PRIORITY_RANK: Record<ExperimentPriority, number> = {
  "experiment-early": 3,
  watch: 2,
  defer: 1,
};

export function listEmergingNetworks(): EmergingNetworkCard[] {
  return [...MOCK_EMERGING_NETWORKS];
}

export function getNetworkDiscoveryDigest(): NetworkDiscoveryDigest {
  const networks = listEmergingNetworks();
  const early = networks.filter((n) => n.priority === "experiment-early");
  const names = early.map((n) => n.name).join(" + ") || "none yet";
  return {
    generatedAt: new Date(0).toISOString(),
    source: "mock",
    networks,
    headlineRec: `Experiment early on ${names} — low saturation, high mock growth signal.`,
  };
}

export function rankForExperiments(
  networks: EmergingNetworkCard[] = MOCK_EMERGING_NETWORKS
): EmergingNetworkCard[] {
  return [...networks].sort((a, b) => {
    const p = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (p !== 0) return p;
    const growth = b.growthSignal - a.growthSignal;
    if (growth !== 0) return growth;
    return b.audienceFit - a.audienceFit;
  });
}

export function experimentEarlyRecs(limit = 2): EmergingNetworkCard[] {
  return rankForExperiments()
    .filter((n) => n.priority === "experiment-early")
    .slice(0, Math.max(0, limit));
}

export function averageGrowthSignal(
  networks: EmergingNetworkCard[] = MOCK_EMERGING_NETWORKS
): number {
  if (networks.length === 0) return 0;
  const sum = networks.reduce((acc, n) => acc + n.growthSignal, 0);
  return Math.round(sum / networks.length);
}
