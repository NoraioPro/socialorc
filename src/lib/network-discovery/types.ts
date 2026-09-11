export type EmergingNetworkId =
  | "bluesky"
  | "threads"
  | "mastodon"
  | "lemmy"
  | "nostr";

export type ExperimentPriority = "experiment-early" | "watch" | "defer";

export interface EmergingNetworkCard {
  id: EmergingNetworkId;
  name: string;
  handleHint: string;
  audienceFit: number; // 0–100 mock
  growthSignal: number; // 0–100 mock
  maturity: "nascent" | "growing" | "crowded";
  priority: ExperimentPriority;
  whyNow: string;
  experimentIdea: string;
}

export interface NetworkDiscoveryDigest {
  generatedAt: string;
  source: "mock";
  networks: EmergingNetworkCard[];
  headlineRec: string;
}
