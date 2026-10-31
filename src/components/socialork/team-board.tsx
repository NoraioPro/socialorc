"use client";

/**
 * Team, in the handoff's shape: roles filter the list, and an admin can invite
 * somebody by email. The invitation, its expiry and its single-use token are the
 * server's business — this only shows what it returns, once.
 */
import { useMemo, useState } from "react";

type Member = { id: string; name: string; email: string; role: string; joined: string };

const ROLE_TABS = ["All", "Owner", "Admin", "Manager", "Editor", "Client", "Viewer"];

export function TeamBoard({ members, canInvite }: { members: Member[]; canInvite: boolean }) {
  const [role, setRole] = useState("All");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EDITOR");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string; token?: string | null } | null>(null);

  const rows = useMemo(
    () => (role === "All" ? members : members.filter((m) => m.role.toLowerCase() === role.toLowerCase())),
    [members, role],
  );

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/workspace/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Could not invite (${res.status}).` });
        return;
      }
      setEmail("");
      setNote({
        kind: "ok",
        text: `Invitation created for ${inviteRole.toLowerCase()}. Send them the link below — it works once, for that address only.`,
        token: data?.acceptancePath ?? data?.token ?? null,
      });
    } catch {
      setNote({ kind: "err", text: "Network error — nobody was invited." });
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 12.5, outline: "none",
  };

  return (
    <>
      <div className="so-tabs">
        {ROLE_TABS.map((r) => (
          <button key={r} className="so-tab" data-active={role === r} onClick={() => setRole(r)}>
            {r}
            <span>{r === "All" ? members.length : members.filter((m) => m.role.toLowerCase() === r.toLowerCase()).length}</span>
          </button>
        ))}
      </div>

      <section className="so-card">
        <table className="so-table">
          <thead>
            <tr><th>Member</th><th>Role</th><th>Joined</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="so-empty">No member with that role.</td></tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name || m.email}</div>
                    <div className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>{m.email}</div>
                  </td>
                  <td>
                    <span className="so-pill" data-tone={m.role === "ADMIN" ? "approved" : undefined}>
                      {m.role.toLowerCase()}
                    </span>
                  </td>
                  <td className="so-mono" style={{ color: "var(--text2)" }}>{m.joined}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {canInvite ? (
        <form onSubmit={invite} className="so-card so-card-pad" style={{ display: "grid", gap: 10 }}>
          <span className="so-stat-label">Invite somebody</span>
          <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" required style={{ ...field, minWidth: 240 }} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={field}>
              {["MANAGER", "EDITOR", "CLIENT", "VIEWER"].map((r) => (
                <option key={r} value={r}>{r.toLowerCase()}</option>
              ))}
            </select>
            <button className="so-btn" data-variant="primary" type="submit" disabled={busy} style={{ height: 32 }}>
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </div>
          {note ? (
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
              {note.token ? (
                <code className="so-mono" style={{ fontSize: 11.5, color: "var(--text2)", wordBreak: "break-all" }}>
                  {note.token}
                </code>
              ) : null}
            </div>
          ) : null}
          <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
            Only admins can invite people or change roles. Client accounts review through a signed
            link and never need a password.
          </span>
        </form>
      ) : (
        <div className="so-frame">Only an admin can invite people or change roles.</div>
      )}
    </>
  );
}
