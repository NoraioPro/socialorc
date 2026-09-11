import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BUCKET_SPACE,
  EXPERIMENT_FIXTURE_NOTE,
  EXPERIMENT_PROVENANCE,
  GATE_GUARDRAIL_NOTE,
  MOCK_EXPERIMENTS,
  MOCK_EXPERIMENT_OUTCOMES,
  MOCK_FLAGS,
  assignVariant,
  bucketFor,
  buildExposureEvent,
  controlVariant,
  evaluateFlag,
  getExperiment,
  getExperimentOutcome,
  listFlags,
  listRunningExperiments,
  pickVariant,
  round,
  stableHash,
  subjectHash,
  summarizeExperimentOutcomes,
  type ExperimentDefinition,
  type FlagOptions,
} from "../../src/lib/experiments";

const libSource = readFileSync(
  fileURLToPath(new URL("../../src/lib/experiments.ts", import.meta.url)),
  "utf8",
);
const routeSource = readFileSync(
  fileURLToPath(new URL("../../src/app/api/experiments/route.ts", import.meta.url)),
  "utf8",
);

const DRAFT_COUNT = "exp-ai-studio-draft-count";
const NUDGE_COPY = "exp-approval-nudge-copy";

const subjectIds = (count: number) => Array.from({ length: count }, (_, i) => `subject-${i}`);
const buckets = () => Array.from({ length: BUCKET_SPACE }, (_, i) => i);

test("the experiment registry is well formed and every experiment has a control", () => {
  assert.ok(MOCK_EXPERIMENTS.length >= 3, "expected several fixture experiments");

  const ids = MOCK_EXPERIMENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "experiment ids must be unique");
  assert.ok(listRunningExperiments().length >= 1, "at least one experiment must be running");

  for (const experiment of MOCK_EXPERIMENTS) {
    assert.ok(experiment.name.length > 0, `${experiment.id} needs a name`);
    assert.ok(experiment.hypothesis.length > 0, `${experiment.id} needs a hypothesis`);
    assert.ok(experiment.metric.length > 0, `${experiment.id} needs a metric`);
    assert.ok(experiment.startsAt.endsWith("Z"), `${experiment.id} needs a fixture start date`);
    assert.ok(experiment.variants.length >= 2, `${experiment.id} needs a control and a challenger`);

    const variantIds = experiment.variants.map((v) => v.id);
    assert.equal(new Set(variantIds).size, variantIds.length, `${experiment.id} has duplicate variant ids`);
    assert.ok(variantIds.includes(experiment.controlVariantId), `${experiment.id} control variant is missing`);
    assert.equal(controlVariant(experiment)?.id, experiment.controlVariantId);

    for (const variant of experiment.variants) {
      assert.ok(variant.label.length > 0 && variant.description.length > 0, `${experiment.id}/${variant.id} lacks copy`);
      assert.ok(Number.isInteger(variant.weight) && variant.weight > 0, `${experiment.id}/${variant.id} weight must be a positive integer`);
    }
  }
});

test("the flag registry is well formed", () => {
  assert.ok(MOCK_FLAGS.length >= 3, "expected several fixture flags");
  assert.equal(listFlags().length, MOCK_FLAGS.length);

  const keys = MOCK_FLAGS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "flag keys must be unique");

  for (const flag of MOCK_FLAGS) {
    assert.match(flag.key, /^flag\.[a-z0-9.-]+$/, `${flag.key} is not a namespaced key`);
    assert.ok(flag.name.length > 0 && flag.description.length > 0, `${flag.key} lacks copy`);
    assert.ok(flag.rolloutPercentage >= 0 && flag.rolloutPercentage <= 100, `${flag.key} rollout must be 0–100`);
    assert.equal(typeof flag.enabledByDefault, "boolean");
  }
  assert.ok(MOCK_FLAGS.some((f) => f.enabledByDefault), "a default-on flag is needed to exercise the rollout path");
  assert.ok(MOCK_FLAGS.some((f) => !f.enabledByDefault), "a default-off flag is needed to exercise the disabled path");
});

test("the lib and its route are offline: no fetch, no client, no scraping", () => {
  for (const [label, source] of [
    ["experiments.ts", libSource],
    ["api/experiments/route.ts", routeSource],
  ] as const) {
    for (const forbidden of ["fetch(", "axios", "http://", "https://", "XMLHttpRequest", "require(", "cheerio", "puppeteer", "playwright"]) {
      assert.ok(!source.includes(forbidden), `${label} must not reach the network (found ${forbidden})`);
    }
  }
});

test("the lib is deterministic: no clock, no randomness", () => {
  for (const forbidden of ["Date.now", "Math.random", "new Date(", "process.env", "setTimeout", "crypto."]) {
    assert.ok(!libSource.includes(forbidden), `experiments.ts must stay deterministic (found ${forbidden})`);
  }
});

test("the mock disclosure is present and matches the implementation", () => {
  assert.match(EXPERIMENT_FIXTURE_NOTE, /mock/i);
  assert.match(EXPERIMENT_FIXTURE_NOTE, /no live/i);
  assert.match(EXPERIMENT_FIXTURE_NOTE, /no scraping/i);
  assert.match(GATE_GUARDRAIL_NOTE, /approval gate/i);
  assert.equal(EXPERIMENT_PROVENANCE, "MOCK_FIXTURE");
  assert.ok(routeSource.includes("EXPERIMENT_FIXTURE_NOTE"), "the route must disclose the fixture provenance");
});

test("stable hashing is stable, in range and spreads subjects across buckets", () => {
  assert.equal(stableHash("exp:subject-1"), stableHash("exp:subject-1"), "hashing must be reproducible");
  assert.notEqual(stableHash("exp:subject-1"), stableHash("exp:subject-2"));
  assert.equal(stableHash(""), 0x811c9dc5, "the empty string is the FNV offset basis");

  for (const seed of subjectIds(500)) {
    const bucket = bucketFor(seed);
    assert.ok(Number.isInteger(bucket) && bucket >= 0 && bucket < BUCKET_SPACE, `bucket out of range: ${bucket}`);
  }
  const spread = new Set(subjectIds(500).map((s) => bucketFor(s)));
  assert.ok(spread.size > 400, `500 subjects should spread across buckets, saw ${spread.size}`);
});

test("a subject hash is a short hex label that never contains the raw id", () => {
  const hash = subjectHash("user-secret-123");
  assert.match(hash, /^[0-9a-f]{8}$/);
  assert.equal(hash, subjectHash("user-secret-123"), "the label must be stable");
  assert.notEqual(hash, subjectHash("user-secret-124"));
  assert.notEqual(hash, subjectHash("user-secret-1234"), "adjacent ids must not collide");
  assert.ok(!hash.includes("user") && !hash.includes("secret"), "the label must not echo the id");
});

test("weighted picking partitions the bucket space exactly by weight", () => {
  const even = getExperiment(DRAFT_COUNT) as ExperimentDefinition;
  assert.equal(pickVariant(even, 0)?.id, "control");
  assert.equal(pickVariant(even, 4999)?.id, "control");
  assert.equal(pickVariant(even, 5000)?.id, "five-drafts");
  assert.equal(pickVariant(even, 9999)?.id, "five-drafts");

  const three = getExperiment(NUDGE_COPY) as ExperimentDefinition;
  assert.equal(pickVariant(three, 0)?.id, "control");
  assert.equal(pickVariant(three, 3399)?.id, "control");
  assert.equal(pickVariant(three, 3400)?.id, "question-nudge");
  assert.equal(pickVariant(three, 6699)?.id, "question-nudge");
  assert.equal(pickVariant(three, 6700)?.id, "benefit-nudge");
  assert.equal(pickVariant(three, 9999)?.id, "benefit-nudge");

  for (const experiment of MOCK_EXPERIMENTS) {
    const counts = new Map<string, number>();
    for (const bucket of buckets()) {
      const variant = pickVariant(experiment, bucket);
      assert.ok(variant, `${experiment.id} returned no variant for bucket ${bucket}`);
      counts.set(variant.id, (counts.get(variant.id) ?? 0) + 1);
    }
    const total = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    for (const variant of experiment.variants) {
      const expected = Math.round((variant.weight / total) * BUCKET_SPACE);
      assert.equal(counts.get(variant.id), expected, `${experiment.id}/${variant.id} bucket share is off`);
    }
    assert.equal([...counts.values()].reduce((a, b) => a + b, 0), BUCKET_SPACE, "every bucket maps to exactly one variant");
  }
});

test("variants with zero, negative or non-finite weights are sanitized", () => {
  const base = getExperiment(DRAFT_COUNT) as ExperimentDefinition;
  const experiment: ExperimentDefinition = {
    ...base,
    variants: [
      { id: "control", label: "Zero", weight: 0, description: "unreachable" },
      { id: "five-drafts", label: "Ten", weight: 10, description: "the only live arm" },
    ],
  };
  for (const bucket of buckets()) {
    assert.equal(pickVariant(experiment, bucket)?.id, "five-drafts", "a zero-weight variant is never assigned");
  }

  const junk: ExperimentDefinition = {
    ...base,
    variants: [
      { id: "control", label: "Negative", weight: -5, description: "bad fixture" },
      { id: "five-drafts", label: "NaN", weight: Number.NaN, description: "bad fixture" },
    ],
  };
  const picked = new Set(buckets().map((bucket) => pickVariant(junk, bucket)?.id));
  assert.deepEqual([...picked].sort(), ["control", "five-drafts"], "all-zero weights degrade to an even split");

  const noVariants: ExperimentDefinition = { ...base, variants: [] };
  assert.equal(pickVariant(noVariants, 42), null);
  assert.equal(controlVariant(noVariants), null);
});

test("assignment is deterministic per subject and reports where it landed", () => {
  const first = assignVariant(DRAFT_COUNT, "subject-7");
  const second = assignVariant(DRAFT_COUNT, "subject-7");
  assert.deepEqual(second, first, "the same subject must always get the same variant");

  assert.equal(first.reason, "ASSIGNED");
  assert.equal(first.provenance, "MOCK_FIXTURE");
  assert.equal(first.bucket, bucketFor(`${DRAFT_COUNT}:subject-7`));
  assert.equal(first.subjectHash, subjectHash("subject-7"));
  assert.ok(["control", "five-drafts"].includes(first.variantId));

  const seen = new Set(subjectIds(400).map((id) => assignVariant(DRAFT_COUNT, id).variantId));
  assert.deepEqual([...seen].sort(), ["control", "five-drafts"], "a 50/50 experiment must reach both arms");
});

test("a killed experiment falls back to its control variant", () => {
  for (const subject of subjectIds(200)) {
    const assignment = assignVariant(NUDGE_COPY, subject, { enabled: false });
    assert.equal(assignment.reason, "KILLED");
    assert.equal(assignment.variantId, "control", "a killed experiment never exposes a challenger");
    assert.equal(assignment.variantLabel, "Neutral nudge");
  }
  assert.equal(assignVariant(NUDGE_COPY, "subject-1", { enabled: true }).reason, "ASSIGNED");
});

test("paused or draft experiments never hand out a treatment", () => {
  for (const id of ["exp-schedule-suggestion", "exp-media-crop-preset"]) {
    const experiment = getExperiment(id) as ExperimentDefinition;
    assert.notEqual(experiment.status, "RUNNING");
    for (const subject of subjectIds(200)) {
      const assignment = assignVariant(id, subject);
      assert.equal(assignment.reason, "NOT_RUNNING");
      assert.equal(assignment.variantId, experiment.controlVariantId, `${id} leaked a treatment`);
    }
  }

  const killedWhilePaused = assignVariant("exp-schedule-suggestion", "subject-1", { enabled: false });
  assert.equal(killedWhilePaused.reason, "KILLED", "the kill switch outranks the paused status");
  assert.equal(killedWhilePaused.variantId, "control");
});

test("an unknown experiment is reported, not invented", () => {
  const assignment = assignVariant("exp-does-not-exist", "subject-1");
  assert.equal(assignment.reason, "UNKNOWN_EXPERIMENT");
  assert.equal(assignment.variantId, "");
  assert.equal(assignment.variantLabel, "");
  assert.equal(assignment.experimentName, "");
  assert.equal(assignment.bucket, 0);
  assert.equal(buildExposureEvent(assignment, { recordedAt: "2026-09-11T00:00:00.000Z" }), null);
});

test("flags honour rollout, defaults, kill switch and unknown keys", () => {
  const panel = MOCK_FLAGS.find((f) => f.rolloutPercentage === 25) as (typeof MOCK_FLAGS)[number];
  const decisions = subjectIds(400).map((id) => evaluateFlag(panel.key, id));
  const enabled = decisions.filter((d) => d.enabled);
  assert.ok(enabled.length > 0 && enabled.length < decisions.length, "a 25% rollout must split the population");
  for (const decision of decisions) {
    assert.equal(decision.rolloutPercentage, 25);
    assert.equal(
      decision.enabled,
      decision.bucket < Math.round(panel.rolloutPercentage * 100),
      "rollout membership must be decided by the bucket",
    );
    assert.equal(decision.reason, decision.enabled ? "ENABLED" : "OUTSIDE_ROLLOUT");
    assert.equal(decision.variantId, null, "a flag carries no variant until the caller assigns one");
  }

  const alwaysOn = MOCK_FLAGS.find((f) => f.rolloutPercentage === 100 && f.enabledByDefault) as (typeof MOCK_FLAGS)[number];
  for (const subject of subjectIds(200)) {
    const decision = evaluateFlag(alwaysOn.key, subject);
    assert.equal(decision.enabled, true, "a 100% rollout admits every subject");
    assert.equal(decision.reason, "ENABLED");
  }

  const offByDefault = MOCK_FLAGS.filter((f) => !f.enabledByDefault);
  for (const flag of offByDefault) {
    const decision = evaluateFlag(flag.key, "subject-1");
    assert.equal(decision.enabled, false);
    assert.equal(decision.reason, "DISABLED");
    assert.equal(decision.bucket, 0, "a disabled flag is decided before bucketing");
    assert.equal(evaluateFlag(flag.key, "subject-1", { enabled: true }).reason, "DISABLED");
  }

  const killed = evaluateFlag(alwaysOn.key, "subject-1", { enabled: false });
  assert.equal(killed.enabled, false);
  assert.equal(killed.reason, "KILLED");

  const unknown = evaluateFlag("flag.nope", "subject-1");
  assert.equal(unknown.reason, "UNKNOWN_FLAG");
  assert.equal(unknown.enabled, false);
  assert.equal(unknown.rolloutPercentage, 0);
});

test("the approval gate outranks every flag state (SCHEDULE_POST is always refused)", () => {
  for (const flag of MOCK_FLAGS) {
    for (const subject of subjectIds(50)) {
      for (const options of [
        { intent: "SCHEDULE_POST" },
        { intent: "SCHEDULE_POST", enabled: false },
      ] as FlagOptions[]) {
        const decision = evaluateFlag(flag.key, subject, options);
        assert.equal(decision.enabled, false, `${flag.key} opened the gate for ${subject}`);
        assert.equal(decision.reason, "GATE_PRESERVED");
      }
    }
  }

  // The refusal is about the intent, not a blanket off: the same subject is admitted for copy.
  const alwaysOn = MOCK_FLAGS.find((f) => f.rolloutPercentage === 100 && f.enabledByDefault) as (typeof MOCK_FLAGS)[number];
  assert.equal(evaluateFlag(alwaysOn.key, "subject-1", { intent: "UI_COPY" }).enabled, true);
  assert.equal(evaluateFlag(alwaysOn.key, "subject-1", { intent: "RENDER_PANEL" }).enabled, true);
  assert.ok(routeSource.includes("GATE_GUARDRAIL_NOTE"), "the route must publish the gate guardrail");
});

test("exposure events carry a hashed subject and an injected timestamp only", () => {
  const recordedAt = "2026-09-11T00:00:00.000Z";
  const assignment = assignVariant(DRAFT_COUNT, "user-secret-123");
  const event = buildExposureEvent(assignment, { recordedAt });

  assert.ok(event);
  assert.deepEqual(Object.keys(event).sort(), [
    "event",
    "experimentId",
    "provenance",
    "recordedAt",
    "subjectHash",
    "unit",
    "variantId",
  ]);
  assert.equal(event.event, "experiment.exposure");
  assert.equal(event.recordedAt, recordedAt, "the caller owns the clock");
  assert.equal(event.unit, "USER");
  assert.equal(event.subjectHash, subjectHash("user-secret-123"));
  assert.equal(event.variantId, assignment.variantId);
  assert.equal(event.provenance, "MOCK_FIXTURE");
  assert.ok(!JSON.stringify(event).includes("user-secret-123"), "an exposure must never carry the raw id");
  const second = buildExposureEvent(assignment, { recordedAt, unit: "ACCOUNT" });
  assert.equal(second?.unit, "ACCOUNT");
});

test("outcome summaries promote a leader only past the sample and lift floors", () => {
  const summary = summarizeExperimentOutcomes(getExperimentOutcome(DRAFT_COUNT));

  assert.equal(summary.recommendation, "PROMOTE_LEADER");
  assert.equal(summary.leaderVariantId, "five-drafts");
  assert.equal(summary.controlVariantId, "control");
  assert.equal(summary.minImpressions, 1000);
  assert.equal(summary.variants.filter((v) => v.isLeader).length, 1, "exactly one variant leads");

  const control = summary.variants.find((v) => v.variantId === "control");
  const treatment = summary.variants.find((v) => v.variantId === "five-drafts");
  assert.equal(control?.rate, 0.21, "252 / 1200 rounds to 0.21");
  assert.equal(treatment?.rate, 0.2466);
  assert.equal(treatment?.liftVsControl, round(291 / 1180 - 252 / 1200));
  assert.equal(control?.liftVsControl, 0);
  assert.match(summary.summary, /five-drafts/);
  assert.match(summary.summary, /promote/i);
});

test("outcome summaries hold the control variant when the challenger is flat", () => {
  const summary = summarizeExperimentOutcomes(getExperimentOutcome(NUDGE_COPY));

  assert.equal(summary.recommendation, "KEEP_CONTROL");
  assert.equal(summary.leaderVariantId, "benefit-nudge", "the leader is still reported");
  const benefit = summary.variants.find((v) => v.variantId === "benefit-nudge");
  assert.equal(benefit?.liftVsControl, round(604 / 2010 - 600 / 2000));
  assert.ok((benefit?.liftVsControl ?? 0) < 0.02, "the sample lift stays under the promotion floor");
  assert.match(summary.summary, /control/);
  assert.ok(summary.variants.every((v) => !v.isLeader || v.variantId === "benefit-nudge"));

  // A tie on rate resolves to the lower variant id, deterministically.
  const tie = summarizeExperimentOutcomes({
    experimentId: DRAFT_COUNT,
    metricLabel: "Approval rate",
    variants: [
      { variantId: "control", impressions: 5000, conversions: 1000 },
      { variantId: "five-drafts", impressions: 5000, conversions: 1000 },
    ],
  });
  assert.equal(tie.leaderVariantId, "control");
  assert.equal(tie.recommendation, "KEEP_CONTROL");
});

test("outcome summaries ask for more data below the impression floor", () => {
  const thin = summarizeExperimentOutcomes(getExperimentOutcome("exp-schedule-suggestion"));
  assert.equal(thin.recommendation, "NEED_MORE_DATA");
  assert.equal(thin.leaderVariantId, "single-slot");
  assert.match(thin.summary, /1000-impression floor/);

  const missing = summarizeExperimentOutcomes(undefined);
  assert.equal(missing.recommendation, "NEED_MORE_DATA");
  assert.equal(missing.leaderVariantId, null);
  assert.equal(missing.controlVariantId, null);
  assert.deepEqual(missing.variants, []);
  assert.equal(missing.experimentId, "");
  assert.equal(missing.summary, "No fixture outcomes recorded for this experiment.");
  assert.equal(missing.provenance, "MOCK_FIXTURE");

  const custom = summarizeExperimentOutcomes(getExperimentOutcome("exp-schedule-suggestion"), {
    minImpressions: 100,
    minimumLift: 0.1,
  });
  assert.equal(custom.minImpressions, 100);
  assert.equal(custom.recommendation, "PROMOTE_LEADER", "300 impressions clear a 100-impression floor");
});

test("every fixture outcome maps to a real experiment and its own variants", () => {
  for (const outcome of MOCK_EXPERIMENT_OUTCOMES) {
    const experiment = getExperiment(outcome.experimentId);
    assert.ok(experiment, `${outcome.experimentId} has results but no definition`);
    assert.ok(outcome.metricLabel.length > 0, `${outcome.experimentId} needs a metric label`);
    const variantIds = (experiment as ExperimentDefinition).variants.map((v) => v.id);
    assert.ok(outcome.variants.length >= 2, `${outcome.experimentId} needs two arms of results`);
    for (const variant of outcome.variants) {
      assert.ok(variantIds.includes(variant.variantId), `${outcome.experimentId} reports an unknown variant`);
      assert.ok(variant.impressions >= 0 && variant.conversions >= 0);
      assert.ok(variant.conversions <= variant.impressions, `${outcome.experimentId}/${variant.variantId} conversions exceed impressions`);
    }
    const summary = summarizeExperimentOutcomes(outcome);
    assert.equal(summary.variants.length, outcome.variants.length);
    for (const variant of summary.variants) {
      assert.ok(variant.rate >= 0 && variant.rate <= 1, "a rate is a 0–1 fraction");
      assert.ok(Math.abs(variant.liftVsControl) <= 1, "a lift is a difference of two fractions");
    }
  }
});

test("no fixture copy claims to bypass the approval gate", () => {
  const copy = JSON.stringify([MOCK_EXPERIMENTS, MOCK_FLAGS]).toLowerCase();
  for (const claim of ["bypass", "auto-approve", "skip approval", "skip the approval", "force schedule", "ignore the gate"]) {
    assert.ok(!copy.includes(claim), `fixture copy must not promise ${claim}`);
  }
  assert.ok(!libSource.includes("canSchedule"), "the experiment lib must not re-implement gate logic");
});

test("the route is a session-gated, read-only surface with no ads API", () => {
  assert.ok(routeSource.includes("getAuthSession"), "the route must require a session");
  assert.ok(routeSource.includes("status: 401"), "an anonymous caller must get 401");
  assert.match(routeSource, /export async function GET\(/);
  assert.ok(!/\bexport (async )?function (POST|PUT|PATCH|DELETE)\b/.test(routeSource), "the stub is read-only");
  assert.ok(routeSource.includes("EXPERIMENTS_KILL_SWITCH"), "the kill switch must be reachable");
  assert.ok(routeSource.includes("subjectHash"), "the response must carry the hashed subject only");
  for (const ads of ["facebook", "googleads", "doubleclick", "graph.facebook", "linkedin", "adsapi"]) {
    assert.ok(!routeSource.toLowerCase().includes(ads), `the stub must not touch an ads API (found ${ads})`);
  }
});
