import { redirect } from "next/navigation";

/**
 * This screen now lives in the SocialOrk design system at /socialork/settings.
 * The old implementation stays in git history; the URL keeps working so no
 * bookmark, email link or stale tab lands on a different design.
 */
export default function LegacyScreen() {
  redirect("/socialork/settings");
}
