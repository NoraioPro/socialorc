"use client";

/**
 * Team's extra tabs from the design: open invitations (with revoke) and the
 * permission matrix. The matrix is computed from src/lib/roles.ts on the server,
 * so it always matches what the API enforces.
 */
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export type InviteRow = { id: string; email: string; role: string; sent: string; expires: string };
export type MatrixRow = { label: string; allowed: boolean[] };

export function TeamTabs({ members, invites, matrix, roles, myRole, canManage, teamsOn, memberCount }: {
  members: ReactNode;
  invites: InviteRow[];
  matrix: { group: string; rows: MatrixRow[] }[];
  roles: string[];
  myRole: string;
  canManage: boolean;
  teamsOn: boolean;
  memberCount: number;
}) {
  const [tab, setTab] = useState<"members" | "invites" | "permissions">("members");
  return (
    <>
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Team</h1>
          <p className="so-sub">Access comes from workspace membership. Changing a role or removing someone takes effect on their next request, not their next sign-in.</p>
        </div>
        <div role="tablist" aria-label="Team sections" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--panel)" }}>
          {([
            ["members", "Members", memberCount],
            ...(canManage && teamsOn ? [["invites", "Invitations", invites.length]] : []),
            ["permissions", "Roles & permissions", roles.length],
          ] as [typeof tab, string, number][]).map(([k, l, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              style={{ height: 28, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", border: 0, borderRadius: 6, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer", background: tab === k ? "var(--panel2)" : "transparent", color: tab === k ? "var(--text)" : "var(--text2)" }}>
              {l}<span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{n}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === "members" ? members : null}
      {tab === "invites" ? <Invitations invites={invites} /> : null}
      {tab === "permissions" ? <Permissions matrix={matrix} roles={roles} myRole={myRole} /> : null}
    </>
  );
}

function Invitations({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const revoke = async (id: string) => {
    setBusy(id);
    const res = await fetch(`/api/workspace/invitations/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setNote("Could not revoke that invitation."); return; }
    router.refresh();
  };
  return (
    <section className="so-card">
      <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)", display: "grid", gap: 4 }}>
        <span className="so-stat-label">Invitations</span>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>Each link works once, only for the named address, and expires after 7 days. Signup is invite-only. Links are shown once, when the invitation is sent; revoke and invite again to send a new one.</span>
      </div>
      {invites.length === 0 ? (
        <div className="so-empty">No open invitations.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="so-table">
            <thead><tr><th>Email</th><th>Role</th><th>Sent</th><th>Expires</th><th style={{ textAlign: "right" }} /></tr></thead>
            <tbody>
              {invites.map((iv) => (
                <tr key={iv.id}>
                  <td>{iv.email}</td>
                  <td><span className="so-pill">{iv.role.toLowerCase()}</span></td>
                  <td className="so-mono" style={{ color: "var(--text2)" }}>{iv.sent}</td>
                  <td className="so-mono" style={{ color: "var(--text2)" }}>{iv.expires}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="so-btn" style={{ height: 28 }} disabled={busy === iv.id} onClick={() => void revoke(iv.id)}>{busy === iv.id ? "Revoking…" : "Revoke"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note ? <div className="so-card-pad" style={{ color: "var(--red)", fontSize: 12 }}>{note}</div> : null}
    </section>
  );
}

function Permissions({ matrix, roles, myRole }: { matrix: { group: string; rows: MatrixRow[] }[]; roles: string[]; myRole: string }) {
  const mine = roles.findIndex((r) => r.toUpperCase() === myRole.toUpperCase());
  return (
    <section className="so-card">
      <div style={{ overflowX: "auto" }}>
        <table className="so-table">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r, i) => (
                <th key={r} style={{ textAlign: "center", color: i === mine ? "var(--accent)" : undefined }}>{r}{i === mine ? " · you" : ""}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((g) => (
              <FragmentRows key={g.group} group={g.group} rows={g.rows} cols={roles.length} mine={mine} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="so-card-pad" style={{ borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text3)" }}>
        Nobody can approve their own post, admins included, unless they are the only member of the workspace. Clients review through a signed link. Your current role is highlighted.
      </div>
    </section>
  );
}

function FragmentRows({ group, rows, cols, mine }: { group: string; rows: MatrixRow[]; cols: number; mine: number }) {
  return (
    <>
      <tr><td colSpan={cols + 1} className="so-mono" style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text3)", paddingTop: 14 }}>{group}</td></tr>
      {rows.map((r) => (
        <tr key={r.label}>
          <td>{r.label}</td>
          {r.allowed.map((ok, i) => (
            <td key={i} style={{ textAlign: "center", background: i === mine ? "var(--accentSoft)" : undefined, color: ok ? "var(--green)" : "var(--text3)" }}>{ok ? "✓" : "—"}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
