/**
 * P2 Experiment stub — the A/B experiment flag contract.
 *
 * Pure and deterministic by construction: a variant is derived from a hash of
 * (experiment id + subject id), so the same subject always lands in the same
 * variant and the unit suite can predict every decision without a seeded RNG or
 * a clock reading.
 *
 * Mock-safe: this module holds the fixture registry and the decision logic only.
 * No network client, no ads API, no scraping, no persistence — the unit suite
 * fails if this file ever grows a network call or reads the clock.
 *
 * Guardrail: an experiment can change copy, layout or rollout. It can never
 * unlock scheduling. `evaluateFlag(..., { intent: "SCHEDULE_POST" })` is always
 * disabled, so a flag can never move a DRAFT past the approval gate.
 */

export const EXPERIMENT_PROVENANCE = "MOCK_FIXTURE" as const;
export type Provenance = typeof EXPERIMENT_PROVENANCE;

/** Disclosure carried by every surface that renders this stub. */
export const EXPERIMENT_FIXTURE_NOTE =
  "Mock experiment fixtures — no live ads APIs, no scraping, no network calls, no persisted assignment.";

/** The one rule an experiment flag may never bend. */
export const GATE_GUARDRAIL_NOTE =
  "The approval gate is enforced: a flag can change copy or layout, never a DRAFT's ability to be scheduled.";

export const MIN_RESULT_IMPRESSIONS = 1000;
export const MINIMUM_LIFT = 0.02;

export type ExperimentStatus = "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface ExperimentVariant {
  id: string;
  label: string;
  /** Integer relative weight; sanitized at decision time. */
  weight: number;
  description: string;
}

export interface ExperimentDefinition {
  id: string;
  name: string;
  hypothesis: string;
  /** The single metric the experiment is allowed to move. */
  metric: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  /** Fixture timestamp string — never generated from the clock. */
  startsAt: string;
  /** Variant the experiment falls back to when it cannot assign. */
  controlVariantId: string;
}

export interface ExperimentFlagDefinition {
  key: string;
  name: string;
  description: string;
  /** 0–100. The subject's bucket decides membership. */
  rolloutPercentage: number;
  enabledByDefault: boolean;
}

/** What the caller wants the flag to affect. Only scheduling is refused. */
export type FlagIntent = "RENDER_PANEL" | "UI_COPY" | "SCHEDULE_POST";

export type AssignmentReason =
  | "ASSIGNED"
  | "KILLED"
  | "NOT_RUNNING"
  | "NO_VARIANTS"
  | "UNKNOWN_EXPERIMENT";

export type FlagReason =
  | "ENABLED"
  | "DISABLED"
  | "OUTSIDE_ROLLOUT"
  | "KILLED"
  | "GATE_PRESERVED"
  | "UNKNOWN_FLAG";

export interface VariantAssignment {
  experimentId: string;
  experimentName: string;
  /** Hashed — a raw subject id must never leave this module. */
  subjectHash: string;
  variantId: string;
  variantLabel: string;
  /** 0–9999, the deterministic position in the rollout space. */
  bucket: number;
  reason: AssignmentReason;
  provenance: Provenance;
}

export interface FlagDecision {
  key: string;
  enabled: boolean;
  reason: FlagReason;
  bucket: number;
  rolloutPercentage: number;
  variantId: string | null;
  provenance: Provenance;
}

export interface ExposureEvent {
  event: "experiment.exposure";
  experimentId: string;
  variantId: string;
  subjectHash: string;
  /** Injected by the caller — the lib never reads the clock. */
  recordedAt: string;
  unit: string;
  provenance: Provenance;
}

export interface VariantOutcome {
  variantId: string;
  impressions: number;
  conversions: number;
}

export interface ExperimentOutcome {
  experimentId: string;
  metricLabel: string;
  variants: VariantOutcome[];
}

export interface VariantOutcomeSummary extends VariantOutcome {
  rate: number;
  liftVsControl: number;
  isLeader: boolean;
}

export type ResultRecommendation = "PROMOTE_LEADER" | "KEEP_CONTROL" | "NEED_MORE_DATA";

export interface ExperimentOutcomeSummary {
  experimentId: string;
  metricLabel: string;
  variants: VariantOutcomeSummary[];
  controlVariantId: string | null;
  leaderVariantId: string | null;
  recommendation: ResultRecommendation;
  minImpressions: number;
  summary: string;
  provenance: Provenance;
}

export interface AssignmentOptions {
  /** Kill switch: a disabled experiment still resolves to its control variant. */
  enabled?: boolean;
}

export interface FlagOptions {
  enabled?: boolean;
  intent?: FlagIntent;
}

export interface ExposureOptions {
  recordedAt: string;
  unit?: string;
}

// ---------------------------------------------------------------------------
// Deterministic hashing — the whole assignment story in two pure functions.
// ---------------------------------------------------------------------------

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Size of the rollout space: buckets are 0–9999. It is not a percentage. */
export const BUCKET_SPACE = 10_000;

export function stableHash(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** Position of a seed in the 0–9999 rollout space. */
export function bucketFor(seed: string): number {
  return stableHash(seed) % BUCKET_SPACE;
}

/** Non-reversible label for a subject — the only form that leaves this module. */
export function subjectHash(subjectId: string): string {
  return stableHash(`subject:${subjectId}`).toString(16).padStart(8, "0");
}

/** Deterministic rounding, so rates and lifts compare exactly in tests. */
export function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sanitizeVariants(variants: ExperimentVariant[]): ExperimentVariant[] {
  const cleaned = variants.map((variant) => ({
    ...variant,
    weight: Number.isFinite(variant.weight) && variant.weight > 0 ? Math.floor(variant.weight) : 0,
  }));
  const total = cleaned.reduce((sum, variant) => sum + variant.weight, 0);
  if (total > 0) return cleaned;
  return cleaned.map((variant) => ({ ...variant, weight: 1 }));
}

/** Weighted pick from a bucket — stable for a given bucket, input never mutated. */
export function pickVariant(experiment: ExperimentDefinition, bucket: number): ExperimentVariant | null {
  const variants = sanitizeVariants(experiment.variants);
  if (variants.length === 0) return null;

  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  let cursor = bucket % total;
  for (const variant of variants) {
    cursor -= variant.weight;
    if (cursor < 0) return variant;
  }
  return variants[variants.length - 1];
}

/** The variant every consumer falls back to when an experiment cannot assign. */
export function controlVariant(experiment: ExperimentDefinition): ExperimentVariant | null {
  const variants = sanitizeVariants(experiment.variants);
  return variants.find((variant) => variant.id === experiment.controlVariantId) ?? variants[0] ?? null;
}

// ---------------------------------------------------------------------------
// Registry — fixtures only. There is no remote flag service to call.
// ---------------------------------------------------------------------------

export const MOCK_EXPERIMENTS: ExperimentDefinition[] = [
  {
    id: "exp-ai-studio-draft-count",
    name: "AI Studio draft count",
    hypothesis: "Operators approve faster when one idea produces five drafts instead of three.",
    metric: "approval_rate",
    status: "RUNNING",
    controlVariantId: "control",
    startsAt: "2026-09-01T00:00:00.000Z",
    variants: [
      {
        id: "control",
        label: "Three drafts",
        weight: 5000,
        description: "Keep the current AI Studio output of three variants per idea.",
      },
      {
        id: "five-drafts",
        label: "Five drafts",
        weight: 5000,
        description: "Generate five variants per idea — more choice, more review time.",
      },
    ],
  },
  {
    id: "exp-approval-nudge-copy",
    name: "Approval nudge copy",
    hypothesis: "Copy that names the publish time gets drafts approved earlier, without touching the gate.",
    metric: "time_to_approval_hours",
    status: "RUNNING",
    controlVariantId: "control",
    startsAt: "2026-09-03T00:00:00.000Z",
    variants: [
      {
        id: "control",
        label: "Neutral nudge",
        weight: 3400,
        description: "Existing copy: this draft is waiting for approval.",
      },
      {
        id: "question-nudge",
        label: "Question nudge",
        weight: 3300,
        description: "Asks the operator to confirm the suggested slot.",
      },
      {
        id: "benefit-nudge",
        label: "Benefit nudge",
        weight: 3300,
        description: "States that approving now keeps the queue on schedule.",
      },
    ],
  },
  {
    id: "exp-schedule-suggestion",
    name: "Suggested posting slot",
    hypothesis: "Showing one suggested slot per platform raises the on-time publish rate.",
    metric: "on_time_publish_rate",
    status: "PAUSED",
    controlVariantId: "control",
    startsAt: "2026-08-20T00:00:00.000Z",
    variants: [
      { id: "control", label: "No suggestion", weight: 5000, description: "Operator picks the time." },
      { id: "single-slot", label: "One suggested slot", weight: 5000, description: "Prefill one suggested slot." },
    ],
  },
  {
    id: "exp-media-crop-preset",
    name: "Media crop preset",
    hypothesis: "A smart crop preset reduces re-uploads before approval.",
    metric: "reupload_rate",
    status: "DRAFT",
    controlVariantId: "control",
    startsAt: "2026-09-11T00:00:00.000Z",
    variants: [
      { id: "control", label: "Centre crop", weight: 5000, description: "Current centre crop." },
      { id: "smart-crop", label: "Smart crop", weight: 5000, description: "Subject-aware crop guess." },
    ],
  },
];

export const MOCK_FLAGS: ExperimentFlagDefinition[] = [
  {
    key: "flag.experiments-panel",
    name: "Experiments panel",
    description: "Render the read-only experiment summary on the settings surface.",
    rolloutPercentage: 25,
    enabledByDefault: true,
  },
  {
    key: "flag.exposure-logging",
    name: "Exposure logging",
    description: "Emit local exposure events for assigned variants (fixture sink only).",
    rolloutPercentage: 10,
    enabledByDefault: true,
  },
  {
    key: "flag.auto-enroll-new-accounts",
    name: "Auto-enroll new accounts",
    description: "Assign newly registered accounts to every running experiment on first load.",
    rolloutPercentage: 100,
    enabledByDefault: false,
  },
  {
    key: "flag.variant-label-inline",
    name: "Inline variant label",
    description: "Show the assigned variant label next to the decision on debug surfaces.",
    rolloutPercentage: 100,
    enabledByDefault: true,
  },
];

export const MOCK_EXPERIMENT_OUTCOMES: ExperimentOutcome[] = [
  {
    experimentId: "exp-ai-studio-draft-count",
    metricLabel: "Approval rate",
    variants: [
      { variantId: "control", impressions: 1200, conversions: 252 },
      { variantId: "five-drafts", impressions: 1180, conversions: 291 },
    ],
  },
  {
    experimentId: "exp-approval-nudge-copy",
    metricLabel: "Approval rate",
    variants: [
      { variantId: "control", impressions: 2000, conversions: 600 },
      { variantId: "question-nudge", impressions: 1980, conversions: 574 },
      { variantId: "benefit-nudge", impressions: 2010, conversions: 604 },
    ],
  },
  {
    experimentId: "exp-schedule-suggestion",
    metricLabel: "On-time publish rate",
    variants: [
      { variantId: "control", impressions: 300, conversions: 60 },
      { variantId: "single-slot", impressions: 300, conversions: 90 },
    ],
  },
];

export function listExperiments(): ExperimentDefinition[] {
  return MOCK_EXPERIMENTS;
}

export function getExperiment(experimentId: string): ExperimentDefinition | undefined {
  return MOCK_EXPERIMENTS.find((experiment) => experiment.id === experimentId);
}

export function listRunningExperiments(): ExperimentDefinition[] {
  return MOCK_EXPERIMENTS.filter((experiment) => experiment.status === "RUNNING");
}

export function listFlags(): ExperimentFlagDefinition[] {
  return MOCK_FLAGS;
}

export function getFlag(key: string): ExperimentFlagDefinition | undefined {
  return MOCK_FLAGS.find((flag) => flag.key === key);
}

export function getExperimentOutcome(experimentId: string): ExperimentOutcome | undefined {
  return MOCK_EXPERIMENT_OUTCOMES.find((outcome) => outcome.experimentId === experimentId);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

function emptyAssignment(
  experiment: ExperimentDefinition | undefined,
  experimentId: string,
  hash: string,
  reason: AssignmentReason,
  variant: ExperimentVariant | null,
): VariantAssignment {
  const bucket = experiment ? bucketFor(`${experiment.id}:${hash}`) : 0;
  return {
    experimentId,
    experimentName: experiment?.name ?? "",
    subjectHash: hash,
    variantId: variant?.id ?? "",
    variantLabel: variant?.label ?? "",
    bucket,
    reason,
    provenance: EXPERIMENT_PROVENANCE,
  };
}

/**
 * Deterministic variant for a subject.
 *
 * A killed, paused, draft or completed experiment still returns its control
 * variant so callers always have a safe default — it never returns a treatment
 * that nobody approved.
 */
export function assignVariant(
  experimentId: string,
  subjectId: string,
  options: AssignmentOptions = {},
): VariantAssignment {
  const hash = subjectHash(subjectId);
  const experiment = getExperiment(experimentId);

  if (!experiment) {
    return emptyAssignment(undefined, experimentId, hash, "UNKNOWN_EXPERIMENT", null);
  }

  const control = controlVariant(experiment);
  if (!control) {
    return emptyAssignment(experiment, experimentId, hash, "NO_VARIANTS", null);
  }

  if (options.enabled === false) {
    return emptyAssignment(experiment, experimentId, hash, "KILLED", control);
  }

  if (experiment.status !== "RUNNING") {
    return emptyAssignment(experiment, experimentId, hash, "NOT_RUNNING", control);
  }

  const bucket = bucketFor(`${experiment.id}:${subjectId}`);
  const variant = pickVariant(experiment, bucket) ?? control;

  return {
    experimentId,
    experimentName: experiment.name,
    subjectHash: hash,
    variantId: variant.id,
    variantLabel: variant.label,
    bucket,
    reason: "ASSIGNED",
    provenance: EXPERIMENT_PROVENANCE,
  };
}

/**
 * Feature flag decision for one subject.
 *
 * Reason precedence: unknown key → approval gate → kill switch → default-off →
 * rollout. The gate check sits above the others on purpose: no flag state, no
 * rollout and no override can make a scheduling intent succeed.
 */
export function evaluateFlag(key: string, subjectId: string, options: FlagOptions = {}): FlagDecision {
  const flag = getFlag(key);
  const base = {
    key,
    bucket: 0,
    rolloutPercentage: flag?.rolloutPercentage ?? 0,
    variantId: null as string | null,
    provenance: EXPERIMENT_PROVENANCE,
  };

  if (!flag) {
    return { ...base, enabled: false, reason: "UNKNOWN_FLAG" };
  }

  if (options.intent === "SCHEDULE_POST") {
    return { ...base, enabled: false, reason: "GATE_PRESERVED" };
  }

  if (options.enabled === false) {
    return { ...base, enabled: false, reason: "KILLED" };
  }

  if (!flag.enabledByDefault) {
    return { ...base, enabled: false, reason: "DISABLED" };
  }

  const bucket = bucketFor(`${flag.key}:${subjectId}`);
  const inRollout = bucket < Math.round(flag.rolloutPercentage * 100);

  return {
    ...base,
    bucket,
    enabled: inRollout,
    reason: inRollout ? "ENABLED" : "OUTSIDE_ROLLOUT",
  };
}

/** Every flag, for one subject, in registry order. */
export function evaluateAllFlags(subjectId: string, options: FlagOptions = {}): FlagDecision[] {
  return MOCK_FLAGS.map((flag) => evaluateFlag(flag.key, subjectId, options));
}

/**
 * Exposure event for an assignment — built, never sent. There is no sink in the
 * stub; the caller decides whether to persist it. Only the hashed subject id
 * travels, so an exposure can never leak a user identifier.
 */
export function buildExposureEvent(
  assignment: VariantAssignment,
  options: ExposureOptions,
): ExposureEvent | null {
  if (!assignment.variantId) return null;

  return {
    event: "experiment.exposure",
    experimentId: assignment.experimentId,
    variantId: assignment.variantId,
    subjectHash: assignment.subjectHash,
    recordedAt: options.recordedAt,
    unit: options.unit ?? "USER",
    provenance: EXPERIMENT_PROVENANCE,
  };
}

/**
 * Read the fixture outcomes as a recommendation. No statistics engine in the
 * stub: a minimum sample size and a minimum lift, both explicit and testable.
 */
export function summarizeExperimentOutcomes(
  outcome: ExperimentOutcome | undefined,
  options: { minImpressions?: number; minimumLift?: number } = {},
): ExperimentOutcomeSummary {
  const minImpressions = options.minImpressions ?? MIN_RESULT_IMPRESSIONS;
  const minimumLift = options.minimumLift ?? MINIMUM_LIFT;
  const experiment = outcome ? getExperiment(outcome.experimentId) : undefined;
  const controlVariantId = experiment?.controlVariantId ?? outcome?.variants[0]?.variantId ?? null;

  const rewards = (outcome?.variants ?? []).map((variant) => ({
    variantId: variant.variantId,
    impressions: variant.impressions,
    conversions: variant.conversions,
    rate: variant.impressions > 0 ? round(variant.conversions / variant.impressions) : 0,
  }));

  const longEnough = (outcome?.variants.length ?? 0) > 0 && rewards.every((r) => r.impressions >= minImpressions);

  const control = rewards.find((reward) => reward.variantId === controlVariantId) ?? rewards[0] ?? null;
  const leader =
    rewards.length === 0
      ? null
      : rewards.reduce((best, current) => {
          if (current.rate > best.rate) return current;
          if (current.rate < best.rate) return best;
          return current.variantId < best.variantId ? current : best;
        });

  const lift = leader && control ? round(leader.rate - control.rate) : 0;

  let recommendation: ResultRecommendation = "KEEP_CONTROL";
  if (!longEnough) recommendation = "NEED_MORE_DATA";
  else if (!leader || !control) recommendation = "NEED_MORE_DATA";
  else if (leader.variantId === control.variantId) recommendation = "KEEP_CONTROL";
  else if (lift >= minimumLift) recommendation = "PROMOTE_LEADER";

  const summary = !outcome
    ? "No fixture outcomes recorded for this experiment."
    : recommendation === "NEED_MORE_DATA"
      ? `Below the ${minImpressions}-impression floor on every variant — keep collecting.`
      : recommendation === "PROMOTE_LEADER"
        ? `${leader?.variantId} leads ${control?.variantId} by ${lift} — promote it after review.`
        : `The ${control?.variantId} variant still holds: the best challenger adds ${lift} (< ${minimumLift}).`;

  return {
    experimentId: outcome?.experimentId ?? "",
    metricLabel: outcome?.metricLabel ?? "",
    variants: rewards.map((reward) => ({
      ...reward,
      liftVsControl: control ? round(reward.rate - control.rate) : 0,
      isLeader: leader?.variantId === reward.variantId,
    })),
    controlVariantId: control?.variantId ?? null,
    leaderVariantId: leader?.variantId ?? null,
    recommendation,
    minImpressions,
    summary,
    provenance: EXPERIMENT_PROVENANCE,
  };
}
