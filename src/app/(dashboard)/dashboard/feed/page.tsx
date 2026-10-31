import { redirect } from "next/navigation";

/** The Timeline is rebuilt in the SocialOrk design at /socialork/feed. */
export default function LegacyFeed() {
  redirect("/socialork/feed");
}
