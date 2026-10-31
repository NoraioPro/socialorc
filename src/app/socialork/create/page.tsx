import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getUsableAccounts, tenantFor } from "@/lib/socialork/queries";
import { ComposeForm } from "@/components/socialork/compose-form";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
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
          Write one brief and get a draft for each channel. Nothing publishes until a manager
          approves it.
        </p>
      </div>
      <ComposeForm accounts={accounts} />
    </div>
  );
}
