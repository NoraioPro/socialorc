import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getBrains, getShellData, tenantFor } from "@/lib/socialork/queries";

export const dynamic = "force-dynamic";

export default async function BrainsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const [brains, shell] = await Promise.all([getBrains(tenant), getShellData(tenant)]);

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Brains</h1>
        <p className="so-sub">
          A brain holds one brand's voice, audience and channels. Generation reads the active brain,
          and every draft says which fields it used.
        </p>
      </div>

      <div className="so-grid so-grid-2">
        {brains.map((brain) => (
          <div key={brain.id} className="so-card so-card-pad" style={{ display: "grid", gap: 10 }}>
            <div className="so-row">
              <span style={{ fontWeight: 600, fontSize: 14 }}>{brain.name}</span>
              {brain.isDefault ? <span className="so-pill" data-tone="approved">Active</span> : null}
              <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                {brain._count.socialAccounts} channels
              </span>
            </div>
            <div className="so-divider" />
            <div style={{ display: "grid", gap: 6, color: "var(--text2)", fontSize: 12.5 }}>
              <span>Workspace · {shell.workspaceName}</span>
              <span className="so-mono" style={{ color: "var(--text3)", fontSize: 11 }}>
                id {brain.id}
              </span>
            </div>
          </div>
        ))}
        {brains.length === 0 ? (
          <div className="so-card so-card-pad">
            <div className="so-empty">
              This workspace has no brain yet. One is created on first use — sign in to the app and
              open Create.
            </div>
          </div>
        ) : null}
      </div>

      <div className="so-frame">
        Voice, audience and words-to-avoid live in <a href="/settings/brand-brain">Brand Brain</a>{" "}
        today; wiring those fields into generation is the next piece of work, and this screen will
        only claim it once drafts quote the fields they used.
      </div>
    </div>
  );
}
