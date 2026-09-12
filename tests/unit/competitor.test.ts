import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOCK_COMPETITORS,
  averageOverlap,
  getCompetitorDigest,
  listCompetitors,
  rankByThreat,
  topThreats,
} from "../../src/lib/competitor";

describe("competitor stub", () => {
  it("exposes mock competitors without network", () => {
    const list = listCompetitors();
    assert.equal(list.length, MOCK_COMPETITORS.length);
    assert.ok(list.every((c) => c.id && c.handle && c.platform));
  });

  it("digest is marked mock", () => {
    const digest = getCompetitorDigest();
    assert.equal(digest.source, "mock");
    assert.ok(digest.competitors.length >= 3);
  });

  it("ranks high threat ahead of low", () => {
    const ranked = rankByThreat();
    assert.equal(ranked[0].threatLevel, "high");
    assert.ok(
      ranked.every((c, i) => {
        if (i === 0) return true;
        const order = { high: 3, medium: 2, low: 1 } as const;
        return order[ranked[i - 1].threatLevel] >= order[c.threatLevel];
      })
    );
  });

  it("topThreats respects limit", () => {
    assert.equal(topThreats(2).length, 2);
    assert.equal(topThreats(0).length, 0);
  });

  it("averageOverlap is within 0–100", () => {
    const avg = averageOverlap();
    assert.ok(avg >= 0 && avg <= 100);
  });
});
