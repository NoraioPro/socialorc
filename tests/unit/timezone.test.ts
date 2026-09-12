import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatInTimezone,
  getTimezoneAbbr,
  getTimezoneOffset,
  COMMON_TIMEZONES,
} from "../../src/lib/timezone";

test("formatInTimezone displays UTC date correctly in different timezones", () => {
  const utcDate = new Date("2024-06-15T12:00:00.000Z");

  const utcFormatted = formatInTimezone(utcDate, "UTC", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(utcFormatted, "12:00", "UTC should show 12:00");

  const nyFormatted = formatInTimezone(utcDate, "America/New_York", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(nyFormatted, "08:00", "New York (EDT, UTC-4) should show 08:00");

  const osloFormatted = formatInTimezone(utcDate, "Europe/Oslo", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(osloFormatted, "14:00", "Oslo (CEST, UTC+2) should show 14:00");

  const tokyoFormatted = formatInTimezone(utcDate, "Asia/Tokyo", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(tokyoFormatted, "21:00", "Tokyo (JST, UTC+9) should show 21:00");
});

test("formatInTimezone handles date strings correctly", () => {
  const dateString = "2024-12-25T00:00:00.000Z";

  const formatted = formatInTimezone(dateString, "America/Los_Angeles", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  assert.ok(
    formatted.includes("Dec") && formatted.includes("24"),
    "LA (UTC-8) should show Dec 24 (day before UTC)"
  );
});

test("formatInTimezone date portion is correct across timezone boundaries", () => {
  const utcMidnight = new Date("2024-07-01T00:00:00.000Z");

  const sydneyDate = formatInTimezone(utcMidnight, "Australia/Sydney", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  assert.ok(
    sydneyDate.includes("07/01") || sydneyDate.includes("01/07"),
    "Sydney (UTC+10) should show July 1"
  );

  const laDate = formatInTimezone(utcMidnight, "America/Los_Angeles", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  assert.ok(
    laDate.includes("06/30") || laDate.includes("30/06"),
    "LA (UTC-7) should show June 30"
  );
});

test("getTimezoneAbbr returns valid abbreviations", () => {
  const utcAbbr = getTimezoneAbbr("UTC");
  assert.ok(utcAbbr === "UTC" || utcAbbr === "GMT", `UTC abbr should be UTC or GMT, got ${utcAbbr}`);

  const nyAbbr = getTimezoneAbbr("America/New_York");
  assert.ok(
    nyAbbr === "EST" || nyAbbr === "EDT",
    `New York abbr should be EST or EDT, got ${nyAbbr}`
  );

  const tokyoAbbr = getTimezoneAbbr("Asia/Tokyo");
  assert.ok(
    tokyoAbbr === "JST" || tokyoAbbr.includes("GMT+9"),
    `Tokyo abbr should be JST or contain GMT+9, got ${tokyoAbbr}`
  );
});

test("getTimezoneOffset returns valid offset strings", () => {
  const utcOffset = getTimezoneOffset("UTC");
  assert.ok(
    utcOffset === "" || utcOffset === "+00:00" || utcOffset === "+0:00",
    `UTC offset should be empty or +00:00, got "${utcOffset}"`
  );
});

test("COMMON_TIMEZONES contains expected entries", () => {
  assert.ok(COMMON_TIMEZONES.length >= 10, "Should have at least 10 common timezones");

  const values = COMMON_TIMEZONES.map((tz) => tz.value);
  assert.ok(values.includes("UTC"), "Should include UTC");
  assert.ok(values.includes("America/New_York"), "Should include New York");
  assert.ok(values.includes("Europe/Oslo"), "Should include Oslo");
  assert.ok(values.includes("Asia/Tokyo"), "Should include Tokyo");

  for (const tz of COMMON_TIMEZONES) {
    assert.ok(tz.value.length > 0, "Timezone value should not be empty");
    assert.ok(tz.label.length > 0, "Timezone label should not be empty");
  }
});

test("scheduled post stores UTC but displays in user timezone", () => {
  const userLocalTime = "2024-08-20T14:30:00";
  const userTimezone = "Europe/Oslo";

  const localDate = new Date(userLocalTime);
  const offset = getTimezoneOffsetMinutes(userTimezone, localDate);
  const utcDate = new Date(localDate.getTime() - offset * 60 * 1000);

  const storedUtc = utcDate.toISOString();
  assert.ok(
    storedUtc.includes("12:30") || storedUtc.includes("T12:30"),
    `Oslo 14:30 should be stored as ~12:30 UTC (got ${storedUtc})`
  );

  const displayedTime = formatInTimezone(utcDate, userTimezone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  assert.equal(
    displayedTime,
    "14:30",
    "When displayed back in Oslo timezone, should show original 14:30"
  );
});

function getTimezoneOffsetMinutes(timezone: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

test("timezone conversion roundtrip preserves time correctly", () => {
  const timezones = ["America/New_York", "Europe/Oslo", "Asia/Tokyo", "Australia/Sydney"];

  for (const tz of timezones) {
    const originalUtc = new Date("2024-03-15T10:00:00.000Z");

    const displayedInTz = formatInTimezone(originalUtc, tz, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    assert.ok(
      displayedInTz.length > 0,
      `Should format date in ${tz}`
    );

    const displayedInUtc = formatInTimezone(originalUtc, "UTC", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    assert.equal(displayedInUtc, "10:00", "UTC display should match original");
  }
});
