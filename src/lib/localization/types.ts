export type LocaleCode = "en" | "ar" | "no" | "es" | "de";

export interface LocaleMeta {
  code: LocaleCode;
  label: string;
  dir: "ltr" | "rtl";
}

export interface LocaleVariant {
  locale: LocaleCode;
  label: string;
  dir: "ltr" | "rtl";
  text: string;
  /** Always "mock" in this stub — never a live translation API. */
  source: "mock";
}

export interface LocalizationResult {
  sourceLocale: LocaleCode;
  sourceText: string;
  variants: LocaleVariant[];
}
