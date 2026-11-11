import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  try { return (await cookies()).get(LANG_COOKIE)?.value === "ar" ? "ar" : "en"; } catch { return "en"; }
}
