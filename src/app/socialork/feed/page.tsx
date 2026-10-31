import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getFeed, tenantFor } from "@/lib/socialork/queries";
import { FeedList } from "@/components/socialork/feed-list";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const items = await getFeed(tenant);

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Timeline</h1>
        <p className="so-sub">
          Everything this workspace has in flight or published, newest first — with reactions and a
          comment thread on each post. Scoped to this workspace; nothing from another tenant appears.
        </p>
      </div>
      <FeedList items={items} />
    </div>
  );
}
