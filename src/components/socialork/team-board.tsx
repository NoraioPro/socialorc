"use client";

/**
 * Team, in the handoff's shape: roles filter the list, and an admin can invite
 * somebody by email. The invitation, its expiry and its single-use token are the
 * server's business — this only shows what it returns, once.
 */
import { useMemo, useState } from "react";

type Member = { id: string; userId: string; name: string; email: string; role: string; joined: string; isMe?: boolean };

const ROLE_TABS = ["All", "Owner", "Admin", "Manager", "Editor", "Client", "Viewer"];

export function TeamBoard({ members, canInvite }: { members: Member[]; canInvite: boolean }) {
  const [role, setRole] = useState("All");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EDITOR");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string; token?: string | null } | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const changeRole = async (member: Member, nextRole: string) => {
    setRowBusy(member.id);
    setNote(null);
    try {
      const res = await fetch(`/api/workspace/users/${member.userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Could not change the role (${res.status}).` });
        return;
      }
      setNote({ kind: "ok", text: `${member.name || member.email} is now ${nextRole.toLowerCase()}. Takes effect on their next request.` });
      window.location.reload();
    } catch {
      setNote({ kind: "err", text: "Network error — the role was not changed." });
    } finally {
      setRowBusy(null);
    }
  };

  const removeMember = async (member: Member) => {
    setRowBusy(member.id);
    setNote(null);
    try {
      const res = await fetch(`/api/workspace/users/${member.userId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Could not remove ${member.email} (${res.status}).` });
        return;
      }
      window.location.reload();
    } catch {
      setNote({ kind: "err", text: "Network error — nobody was removed." });
    } finally {
      setRowBusy(null);
    }
  };

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
    height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none",
  };
  const initials = (m: Member) => (m.name || m.email).split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

  return (
    <section className="so-card" style={{ overflow: "hidden" }}>
      {canInvite ? (
        <form onSubmit={invite} style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <input type="email" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" required style={{ ...field, flex: "1 1 240px", minWidth: 0 }} />
            <select aria-label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...field, padding: "0 8px" }}>
              {[["MANAGER", "Manager"], ["EDITOR", "Editor"], ["CLIENT", "Client · review link"], ["VIEWER", "Viewer"]].map(([r, l]) => (
                <option key={r} value={r}>{l}</option>
              ))}
            </select>
            <button className="so-btn" data-variant="primary" type="submit" disabled={busy} style={{ height: 36, padding: "0 14px" }}>
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </div>
          {note ? (
            <div role="status" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
              {note.token ? (
                <code className="so-mono" style={{ fontSize: 11.5, color: "var(--text2)", wordBreak: "break-all" }}>{note.token}</code>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--line)", color: "var(--text2)", fontSize: 12.5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10V8a6 6 0 1 1 12 0v2M5 10h14v11H5z" /></svg>
          Only admins can invite people or change roles.
        </div>
      )}
      {note && !canInvite ? <div role="status" style={{ padding: "8px 16px", fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</div> : null}

      <div className="so-tabs" style={{ padding: "10px 16px 0", borderBottom: 0 }}>
        {ROLE_TABS.map((r) => (
          <button key={r} className="so-tab" data-active={role === r} onClick={() => setRole(r)}>
            {r}
            <span>{r === "All" ? members.length : members.filter((m) => m.role.toLowerCase() === r.toLowerCase()).length}</span>
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="so-table">
          <thead>
            <tr><th>Member</th><th>Role</th><th>Joined</th><th style={{ textAlign: "right" }} aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="so-empty">No member with that role.</td></tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 30, height: 30, flex: "none", borderRadius: "50%", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, color: "var(--text2)" }}>{initials(m)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                          {m.name || m.email}
                          {m.isMe ? <span style={{ fontSize: 10.5, fontWeight: 500, color: "var(--text3)" }}>You</span> : null}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    {canInvite ? (
                      <select
                        aria-label={`Role for ${m.name || m.email}`}
                        value={m.role.toUpperCase()}
                        disabled={rowBusy === m.id}
                        onChange={(e) => void changeRole(m, e.target.value)}
                        style={{ height: 30, borderRadius: 7, border: "1px solid var(--line2)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, padding: "0 6px" }}
                      >
                        {["OWNER", "ADMIN", "MANAGER", "EDITOR", "CLIENT", "VIEWER"].map((r) => (
                          <option key={r} value={r}>{r.toLowerCase()}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="so-pill" data-tone={m.role === "ADMIN" ? "approved" : undefined}>{m.role.toLowerCase()}</span>
                    )}
                    {m.role.toUpperCase() === "CLIENT" ? <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 3 }}>Signed review link · no account</div> : null}
                  </td>
                  <td className="so-mono" style={{ color: "var(--text2)" }}>{m.joined}</td>
                  <td style={{ textAlign: "right" }}>
                    {canInvite && m.role.toUpperCase() !== "OWNER" ? (
                      <button className="so-btn" style={{ height: 28, color: "var(--text2)" }}
                        disabled={rowBusy === m.id} onClick={() => void removeMember(m)}>
                        {rowBusy === m.id ? "…" : "Remove"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 16px", fontSize: 11.5, color: "var(--text3)", borderTop: "1px solid var(--line)" }}>
        Client accounts review through a signed link and never need a password.
      </div>
    </section>
  );
}
