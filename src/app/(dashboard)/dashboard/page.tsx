import { redirect } from "next/navigation";

/**
 * The product now lives in the SocialOrk design system at /socialork/*.
 *
 * This route used to render the previous Command Center. It is a redirect so
 * that one entry point shows one design: the old screen is still in git
 * history (and every old sub-route still resolves), but nothing links to it.
 */
export default function DashboardEntry() {
  redirect("/socialork/overview");
}
