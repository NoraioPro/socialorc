import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { tenantFor } from "@/lib/socialork/queries";
import { getTimeline } from "@/lib/socialork/timeline";
import { tenantCan } from "@/lib/tenancy/guard";
import { TimelineView } from "@/components/socialork/timeline-view";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const data = await getTimeline(tenant);

  return <TimelineView data={data} canPost={tenantCan(tenant, "feed:post")} />;
}
