/**
 * What an `<input type="datetime-local">` actually gives us, and why it is not
 * what the server can use directly.
 *
 * The input's value is a wall-clock time in the *browser's* timezone with no
 * offset attached ("2026-10-13T14:30"). Sent as-is, `new Date(value)` on the
 * server resolves it in the *server's* timezone — UTC on Vercel — so a 14:30
 * Cairo schedule became 17:30 Cairo. The fix is to resolve the instant in the
 * browser, where the user's timezone is known, and send the ISO string with its
 * offset: "2026-10-13T11:30:00.000Z".
 *
 * Pure and clock-injectable so the conversion can be tested without a browser.
 */

export type ScheduleInputProblem = "empty" | "invalid" | "past";

export type ScheduleInputResult =
  | { ok: true; iso: string; at: Date }
  | { ok: false; reason: ScheduleInputProblem };

export function parseScheduleInput(
  value: string,
  now: Date = new Date()
): ScheduleInputResult {
  if (!value) return { ok: false, reason: "empty" };

  // No timezone suffix in the value, so this resolves against the local zone of
  // whichever runtime calls it — which is exactly why the caller must be the
  // browser and not a server.
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return { ok: false, reason: "invalid" };
  if (at.getTime() <= now.getTime()) return { ok: false, reason: "past" };

  return { ok: true, iso: at.toISOString(), at };
}

export function scheduleInputMessage(reason: ScheduleInputProblem): string {
  switch (reason) {
    case "empty":
      return "Pick a date and time, or use one of the suggestions.";
    case "invalid":
      return "That date is not readable — pick it again.";
    case "past":
      return "Pick a time in the future.";
  }
}
