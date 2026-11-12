import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getUsableAccounts, tenantFor } from "@/lib/socialork/queries";
import { ComposeForm } from "@/components/socialork/compose-form";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ body?: string; platform?: string }> }) {
  const sp = await searchParams;
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");
  const accounts = await getUsableAccounts(tenant);
  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">New post</h1>
        <p className="so-sub">
          Pick channels, write once (or let AI draft it), add an image, and choose what happens next.
        </p>
      </div>
      <ComposeForm
        accounts={accounts}
        initialBody={sp.body?.slice(0, 3000)}
        initialPlatform={sp.platform}
        canApprove={can(tenant.role, "posts:approve")}
      />
    </div>
  );
}
