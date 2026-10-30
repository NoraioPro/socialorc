import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { getTeam, relativeTime, tenantFor } from "@/lib/socialork/queries";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const members = await getTeam(tenant);

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Team</h1>
        <p className="so-sub">
          Access comes from workspace membership. A role change or a removal takes effect on the
          person's next request, not their next sign-in.
        </p>
      </div>

      <section className="so-card">
        <table className="so-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{m.user.name ?? m.user.email}</div>
                  <div className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{m.user.email}</div>
                </td>
                <td>
                  <span className="so-pill" data-tone={m.role === "ADMIN" ? "approved" : undefined}>
                    {m.role.toLowerCase()}
                  </span>
                </td>
                <td className="so-mono" style={{ color: "var(--text2)" }}>{relativeTime(m.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="so-frame">
        Only an admin can invite people or change roles. Invitations are single-use and expire; the
        invitee opens the link from their email.
      </div>
    </div>
  );
}
