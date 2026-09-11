import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import {
  EXPERIMENT_FIXTURE_NOTE,
  EXPERIMENT_PROVENANCE,
  GATE_GUARDRAIL_NOTE,
  assignVariant,
  buildExposureEvent,
  evaluateFlag,
  getExperiment,
  getExperimentOutcome,
  listExperiments,
  listFlags,
  subjectHash,
  summarizeExperimentOutcomes,
} from "@/lib/experiments";

/**
 * Read-only experiment/flag introspection for the signed-in user.
 *
 * The registry is a fixture and the decisions are pure, so this route adds only
 * two things: the session-derived subject id and the environment kill switch.
 * It never writes, never schedules, and never returns a raw subject id — only
 * the hashed form produced by the lib. There is deliberately no POST/PUT/DELETE
 * here: an experiment flag can change copy or layout, never the approval gate
 * (`SCHEDULE_POST` intents come back `GATE_PRESERVED` from the lib).
 *
 * Env: `EXPERIMENTS_ENABLED="false"` and `EXPERIMENTS_KILL_SWITCH="true"`
 * both force every decision off; the response says which one fired.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const killSwitch = process.env.EXPERIMENTS_KILL_SWITCH === "true";
  const enabled = !killSwitch && process.env.EXPERIMENTS_ENABLED !== "false";

  const requestedExperiment = req.nextUrl.searchParams.get("experiment");
  const requestedFlag = req.nextUrl.searchParams.get("flag");
  /** Inspecting another subject is allowed for QA — the output stays hashed. */
  const subject = req.nextUrl.searchParams.get("subjectId") ?? session.user.id;
  const generatedAt = new Date().toISOString();

  const experimentIds = requestedExperiment
    ? [requestedExperiment]
    : listExperiments().map((experiment) => experiment.id);
  const assignments = experimentIds.map((id) => assignVariant(id, subject, { enabled }));

  const flagKeys = requestedFlag ? [requestedFlag] : listFlags().map((flag) => flag.key);
  const flags = flagKeys.map((key) => evaluateFlag(key, subject, { enabled }));

  const unknown = [
    ...assignments.filter((a) => a.reason === "UNKNOWN_EXPERIMENT").map((a) => a.experimentId),
    ...flags.filter((f) => f.reason === "UNKNOWN_FLAG").map((f) => f.key),
  ];

  const exposures = assignments
    .map((assignment) => buildExposureEvent(assignment, { recordedAt: generatedAt }))
    .filter((event) => event !== null);

  const results =
    requestedExperiment && getExperiment(requestedExperiment)
      ? summarizeExperimentOutcomes(getExperimentOutcome(requestedExperiment))
      : undefined;

  return NextResponse.json(
    {
      enabled,
      killSwitch,
      provenance: EXPERIMENT_PROVENANCE,
      note: EXPERIMENT_FIXTURE_NOTE,
      guardrail: GATE_GUARDRAIL_NOTE,
      generatedAt,
      /** Hashed, never the raw id — see subjectHash in the lib. */
      subject: subjectHash(subject),
      assignments,
      flags,
      exposures,
      ...(results ? { results } : {}),
      unknown,
    },
    { status: unknown.length > 0 ? 404 : 200 },
  );
}

export const dynamic = "force-dynamic";
