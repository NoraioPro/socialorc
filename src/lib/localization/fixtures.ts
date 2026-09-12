import type { LocaleCode, LocaleMeta } from "./types";

export const SUPPORTED_LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "Arabic", dir: "rtl" },
  { code: "no", label: "Norwegian", dir: "ltr" },
  { code: "es", label: "Spanish", dir: "ltr" },
  { code: "de", label: "German", dir: "ltr" },
];

/** Tiny phrase bank for mock adaptations — not machine translation. */
export const MOCK_PHRASE_BANK: Record<LocaleCode, Record<string, string>> = {
  en: {},
  ar: {
    launch: "إطلاق",
    update: "تحديث",
    welcome: "مرحباً",
    today: "اليوم",
  },
  no: {
    launch: "lansering",
    update: "oppdatering",
    welcome: "velkommen",
    today: "i dag",
  },
  es: {
    launch: "lanzamiento",
    update: "actualización",
    welcome: "bienvenido",
    today: "hoy",
  },
  de: {
    launch: "Launch",
    update: "Update",
    welcome: "willkommen",
    today: "heute",
  },
};

export const DEFAULT_TARGET_LOCALES: LocaleCode[] = ["ar", "no", "es", "de"];
