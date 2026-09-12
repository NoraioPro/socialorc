/**
 * Timezone utilities for SocialOrc.
 * 
 * Core principle:
 * - All dates are stored in UTC in the database
 * - Display dates are converted to the user's timezone for UI
 * - User input is converted from user's timezone to UTC before storage
 */

/**
 * Get the user's timezone from browser or fallback to default
 */
export function getBrowserTimezone(): string {
  if (typeof window !== "undefined") {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return "UTC";
}

/**
 * Convert a UTC date to a specific timezone for display
 */
export function utcToTimezone(utcDate: Date | string, timezone: string): Date {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => 
    parts.find(p => p.type === type)?.value || "0";
  
  return new Date(
    parseInt(get("year")),
    parseInt(get("month")) - 1,
    parseInt(get("day")),
    parseInt(get("hour")),
    parseInt(get("minute")),
    parseInt(get("second"))
  );
}

/**
 * Convert a local date in a specific timezone to UTC for storage
 */
export function timezoneToUtc(localDate: Date, timezone: string): Date {
  const localStr = localDate.toLocaleString("en-US", { timeZone: timezone });
  const utcStr = localDate.toLocaleString("en-US", { timeZone: "UTC" });
  
  const localParsed = new Date(localStr);
  const utcParsed = new Date(utcStr);
  
  const offset = localParsed.getTime() - utcParsed.getTime();
  
  return new Date(localDate.getTime() - offset);
}

/**
 * Format a UTC date for display in a specific timezone
 */
export function formatInTimezone(
  utcDate: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof utcDate === "string" ? new Date(utcDate) : utcDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...options,
  }).format(date);
}

/**
 * Get short timezone name (e.g., "CET", "PST")
 */
export function getTimezoneAbbr(timezone: string): string {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(date);
  return parts.find(p => p.type === "timeZoneName")?.value || timezone;
}

/**
 * Get UTC offset for a timezone (e.g., "+01:00", "-08:00")
 */
export function getTimezoneOffset(timezone: string): string {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(date);
  const offset = parts.find(p => p.type === "timeZoneName")?.value || "";
  return offset.replace("GMT", "");
}

/**
 * Common timezone options for select dropdowns
 */
export const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Oslo", label: "Oslo (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
] as const;
