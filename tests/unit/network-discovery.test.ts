import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOCK_EMERGING_NETWORKS,
  averageGrowthSignal,
  experimentEarlyRecs,
  getNetworkDiscoveryDigest,
  listEmergingNetworks,
  rankForExperiments,
} from "../../src/lib/network-discovery";

describe("network-discovery stub", () => {
  it("lists mock emerging networks without network I/O", () => {
    const list = listEmergingNetworks();
    assert.equal(list.length, MOCK_EMERGING_NETWORKS.length);
    assert.ok(list.every((n) => n.id && n.experimentIdea));
  });

  it("digest is mock and recommends experiment-early networks", () => {
    const digest = getNetworkDiscoveryDigest();
    assert.equal(digest.source, "mock");
    assert.match(digest.headlineRec, /Experiment early/i);
    assert.ok(digest.networks.length >= 3);
  });

  it("ranks experiment-early first", () => {
    const ranked = rankForExperiments();
    assert.equal(ranked[0].priority, "experiment-early");
  });

  it("experimentEarlyRecs respects limit", () => {
    assert.equal(experimentEarlyRecs(1).length, 1);
    assert.ok(experimentEarlyRecs(10).every((n) => n.priority === "experiment-early"));
  });

  it("averageGrowthSignal is 0–100", () => {
    const avg = averageGrowthSignal();
    assert.ok(avg >= 0 && avg <= 100);
  });
});
