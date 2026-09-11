import type { CulturalWarning } from "./types";

const SLANG = ["lol", "lmao", "omg", "tbh", "idk", "smh"];
const HOLIDAY_SENSITIVE = ["merry christmas", "happy easter", "ramadan kareem"];

export function analyzeText(text: string, locale?: string): CulturalWarning[] {
  const warnings: CulturalWarning[] = [];
  const trimmed = (text || "").trim();
  if (!trimmed) return warnings;

  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) {
    warnings.push({
      id: "shout-caps",
      severity: "warn",
      locale,
      ruleId: "all-caps",
      message: "Copy is mostly ALL CAPS — may read as shouting across locales.",
    });
  }

  const lower = trimmed.toLowerCase();
  for (const slang of SLANG) {
    if (new RegExp(`\\b${slang}\\b`, "i").test(lower)) {
      warnings.push({
        id: `slang-${slang}`,
        severity: "info",
        locale,
        ruleId: "informal-slang",
        message: `Informal slang ("${slang}") may not travel well outside casual EN audiences.`,
      });
      break;
    }
  }

  for (const phrase of HOLIDAY_SENSITIVE) {
    if (lower.includes(phrase)) {
      warnings.push({
        id: `holiday-${phrase.replace(/\s+/g, "-")}`,
        severity: "block-advisory",
        locale,
        ruleId: "holiday-sensitive",
        message: `Holiday-specific phrasing ("${phrase}") can exclude audiences — review before publishing.`,
      });
    }
  }

  const hasNonAscii = /[^\x00-\x7F]/.test(trimmed);
  if (hasNonAscii && !locale) {
    warnings.push({
      id: "missing-locale",
      severity: "warn",
      ruleId: "locale-missing",
      message: "Non-English characters detected but no target locale set — confirm language/market.",
    });
  }

  return warnings;
}
