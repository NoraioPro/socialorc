import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { StudioForm } from "@/components/socialork/studio-form";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  const key = tenant
    ? await prisma.aiCredential.findFirst({
        where: { OR: [{ userId: tenant.userId }, { workspaceId: tenant.workspaceId }] },
        select: { id: true },
      })
    : null;

  return (
    <div className="so-page">
      <div>
        <h1 className="so-h1">AI Studio</h1>
        <p className="so-sub" style={{ marginTop: 4, maxWidth: 660 }}>
          One idea in, several variants out, each respecting its channel&apos;s length and the active
          brain&apos;s voice. Nothing is saved until you pick a variant, and nothing publishes without
          an approval.
        </p>
      </div>
      {!key ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "1px solid var(--amber)",
          borderRadius: 10, background: "var(--amberSoft)", fontSize: 12.5, flexWrap: "wrap",
        }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            Generation runs on your own AI key. Without one, the studio shows example variants so you can try the flow.
          </span>
          <a className="so-btn" href="/socialork/settings/ai" style={{ textDecoration: "none" }}>Add AI key</a>
        </div>
      ) : null}
      <StudioForm />
    </div>
  );
}
