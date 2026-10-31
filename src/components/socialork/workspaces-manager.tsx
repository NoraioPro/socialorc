"use client";

/**
 * Workspace management: everything a member needs in one screen — see the
 * workspaces they belong to, switch, create, rename, leave or delete.
 *
 * Every action goes through the API, which re-checks the membership for that
 * specific workspace; this page never decides who may do what.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  role: string;
  isCurrent: boolean;
  members: number;
  brains: number;
  channels: number;
  posts: number;
};

export function WorkspacesManager({ rows }: { rows: WorkspaceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const field: React.CSSProperties = {
    height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 12.5, outline: "none",
  };

  const call = async (label: string, url: string, init: RequestInit) => {
    setBusy(label);
    setNote(null);
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Failed (${res.status}).` });
        return null;
      }
      return data;
    } catch {
      setNote({ kind: "err", text: "Network error." });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const open = async (row: WorkspaceRow) => {
    const data = await call(`open:${row.id}`, "/api/workspaces/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: row.id }),
    });
    if (data) window.location.href = "/socialork/overview";
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = (await call("create", "/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), kind: "TEAM" }),
    })) as { workspace?: { id: string } } | null;
    if (!data?.workspace) return;
    setCreating(false);
    setNewName("");
    await open({ id: data.workspace.id } as WorkspaceRow);
  };

  const rename = async (row: WorkspaceRow) => {
    const data = await call(`rename:${row.id}`, `/api/workspaces/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    if (data) {
      setRenaming(null);
      setNote({ kind: "ok", text: "Renamed." });
      router.refresh();
    }
  };

  const leave = async (row: WorkspaceRow, deleteIt: boolean) => {
    const data = await call(`${deleteIt ? "delete" : "leave"}:${row.id}`,
      `/api/workspaces/${row.id}${deleteIt ? "" : "?leave=1"}`,
      { method: "DELETE" });
    if (data) {
      setNote({ kind: "ok", text: deleteIt ? "Workspace deleted." : "You left the workspace." });
      router.refresh();
    }
  };

  return (
    <>
      <div className="so-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="so-row" style={{ gap: 8 }}>
          <span className="so-pill">{rows.length} workspace{rows.length === 1 ? "" : "s"}</span>
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            each one has its own channels, brains, posts and people
          </span>
        </div>
        <button className="so-btn" data-variant="primary" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New workspace"}
        </button>
      </div>

      {creating ? (
        <form onSubmit={create} className="so-card so-card-pad" style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <label className="so-stat-label" htmlFor="ws-name">Workspace name</label>
          <input id="ws-name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Nordic Studio" style={{ ...field, width: "100%" }} />
          <span style={{ fontSize: 11.5, color: "var(--text3)" }}>
            You become its owner. Invite people and connect channels afterwards.
          </span>
          <button className="so-btn" data-variant="primary" type="submit"
            style={{ justifySelf: "start" }} disabled={busy === "create" || newName.trim().length < 2}>
            {busy === "create" ? "Creating…" : "Create and open"}
          </button>
        </form>
      ) : null}

      {note ? (
        <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
      ) : null}

      <div className="so-list" style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <section key={row.id} className="so-card so-card-pad" style={{ display: "grid", gap: 10 }}>
            <div className="so-row" style={{ gap: 10, flexWrap: "wrap" }}>
              {renaming === row.id ? (
                <div className="so-row" style={{ gap: 6 }}>
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    style={{ ...field, minWidth: 220 }} autoFocus />
                  <button className="so-btn" style={{ height: 32 }} disabled={busy === `rename:${row.id}`}
                    onClick={() => void rename(row)}>
                    Save
                  </button>
                  <button className="so-btn" style={{ height: 32 }} onClick={() => setRenaming(null)}>Cancel</button>
                </div>
              ) : (
                <span style={{ fontSize: 15, fontWeight: 600 }}>{row.name}</span>
              )}
              <span className="so-pill">{row.kind.toLowerCase()}</span>
              <span className="so-pill" data-tone={row.role.toUpperCase() === "OWNER" ? "approved" : undefined}>
                {row.role.toLowerCase()}
              </span>
              {row.isCurrent ? <span className="so-pill" data-tone="scheduled">current</span> : null}

              <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!row.isCurrent ? (
                  <button className="so-btn" data-variant="primary" style={{ height: 28 }}
                    disabled={busy === `open:${row.id}`} onClick={() => void open(row)}>
                    {busy === `open:${row.id}` ? "Opening…" : "Open"}
                  </button>
                ) : null}
                {["OWNER", "ADMIN"].includes(row.role.toUpperCase()) ? (
                  <button className="so-btn" style={{ height: 28 }}
                    onClick={() => { setRenaming(row.id); setRenameValue(row.name); }}>
                    Rename
                  </button>
                ) : null}
                {row.role.toUpperCase() === "OWNER" ? (
                  <button className="so-btn" style={{ height: 28, color: "var(--red)" }}
                    disabled={busy === `delete:${row.id}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${row.name}" permanently? Its posts, channels and brains go with it.`)) {
                        void leave(row, true);
                      }
                    }}>
                    Delete
                  </button>
                ) : (
                  <button className="so-btn" style={{ height: 28, color: "var(--red)" }}
                    disabled={busy === `leave:${row.id}`}
                    onClick={() => {
                      if (window.confirm(`Leave "${row.name}"? You lose access to its content.`)) {
                        void leave(row, false);
                      }
                    }}>
                    Leave
                  </button>
                )}
              </span>
            </div>

            <div className="so-row" style={{ gap: 18, flexWrap: "wrap" }}>
              {[["Members", row.members], ["Brains", row.brains], ["Channels", row.channels], ["Posts", row.posts]]
                .map(([label, value]) => (
                  <span key={String(label)} style={{ display: "grid", gap: 1 }}>
                    <span className="so-mono" style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{value}</span>
                  </span>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
