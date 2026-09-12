/**
 * Pure helpers for best-time chips → datetime-local values.
 * No React; unit-testable. Maps heuristic {day, hour} to the next future local Date.
 */

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Resolve weekday name (e.g. "Tuesday") to JS getDay() index. */
export function weekdayIndex(day: string): number {
  const idx = DAY_INDEX[day.trim().toLowerCase()];
  if (idx === undefined) {
    throw new Error(`Invalid weekday: ${day}`);
  }
  return idx;
}

/**
 * Next local Date for {day, hour} strictly in the future relative to `now`.
 * Same weekday later today → today; same weekday hour already past → next week.
 */
export function nextOccurrence(
  day: string,
  hour: number,
  now: Date = new Date()
): Date {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}`);
  }

  const targetDow = weekdayIndex(day);
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0
  );

  const currentDow = now.getDay();
  let daysAhead = (targetDow - currentDow + 7) % 7;
  if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
    daysAhead = 7;
  }
  candidate.setDate(candidate.getDate() + daysAhead);
  return candidate;
}

/** Format for `<input type="datetime-local">` value (local wall time, no Z). */
export function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** Chip label like "Tue 10:00 · 95". */
export function formatBestTimeChipLabel(
  day: string,
  hour: number,
  score: number,
  now: Date = new Date()
): string {
  const date = nextOccurrence(day, hour, now);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${weekday} ${hh}:${mm} · ${score}`;
}

/** Convenience: next occurrence as datetime-local string. */
export function bestTimeToDatetimeLocal(
  day: string,
  hour: number,
  now: Date = new Date()
): string {
  return toDatetimeLocalValue(nextOccurrence(day, hour, now));
}
