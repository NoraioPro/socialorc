import { DEFAULT_TARGET_LOCALES, MOCK_PHRASE_BANK, SUPPORTED_LOCALES } from "./fixtures";
import type {
  LocaleCode,
  LocaleVariant,
  LocalizationResult,
} from "./types";

export type { LocaleCode, LocaleMeta, LocaleVariant, LocalizationResult } from "./types";
export { DEFAULT_TARGET_LOCALES, MOCK_PHRASE_BANK, SUPPORTED_LOCALES } from "./fixtures";

function localeMeta(code: LocaleCode) {
  const meta = SUPPORTED_LOCALES.find((l) => l.code === code);
  if (!meta) throw new Error(`Unsupported locale: ${code}`);
  return meta;
}

/** Apply mock phrase swaps; never calls a translation API. */
export function mockAdaptText(text: string, locale: LocaleCode): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (locale === "en") return trimmed;

  const bank = MOCK_PHRASE_BANK[locale];
  let out = trimmed;
  for (const [en, localized] of Object.entries(bank)) {
    const re = new RegExp(`\\b${en}\\b`, "gi");
    out = out.replace(re, localized);
  }

  const meta = localeMeta(locale);
  return `[${meta.label} · mock] ${out}`;
}

export function localizeVariants(
  sourceText: string,
  targets: LocaleCode[] = DEFAULT_TARGET_LOCALES
): LocalizationResult {
  const uniqueTargets = [...new Set(targets.filter((t) => t !== "en"))];
  const variants: LocaleVariant[] = uniqueTargets.map((code) => {
    const meta = localeMeta(code);
    return {
      locale: code,
      label: meta.label,
      dir: meta.dir,
      text: mockAdaptText(sourceText, code),
      source: "mock" as const,
    };
  });

  return {
    sourceLocale: "en",
    sourceText: sourceText.trim(),
    variants,
  };
}

export function listSupportedLocales() {
  return [...SUPPORTED_LOCALES];
}
