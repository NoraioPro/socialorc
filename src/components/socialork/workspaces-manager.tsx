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
  const [newKind, setNewKind] = useState<"TEAM" | "PERSONAL">("TEAM");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const field: React.CSSProperties = {
    height: 36, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none",
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
      body: JSON.stringify({ name: newName.trim(), kind: newKind }),
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
    setConfirming(null);
    if (data) {
      setNote({ kind: "ok", text: deleteIt ? "Workspace deleted." : "You left the workspace." });
      router.refresh();
    }
  };

  const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const tints = ["#48ED85", "#7CB6FF", "#F5B454", "#C79BFF", "#FF8FA3", "#5EE0D0"];
  const tintOf = (id: string) => tints[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % tints.length];

  return (
    <>
      <div className="so-spread" style={{ marginTop: -4 }}>
        <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
          {rows.length} workspace{rows.length === 1 ? "" : "s"} · each one has its own channels, brains, posts and people
        </span>
        <button className="so-btn" data-variant="primary" style={{ height: 32 }} onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ New workspace"}
        </button>
      </div>

      {creating ? (
        <form onSubmit={create} className="so-card" style={{ padding: "16px 20px", display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 600 }}>New workspace</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 6, flex: "1 1 260px" }}>
              <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>Workspace name</span>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Nordbyte" style={{ ...field, width: "100%" }} />
            </label>
            <div style={{ display: "grid", gap: 6 }}>
              <span id="ws-kind" style={{ fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>Kind</span>
              <div role="group" aria-labelledby="ws-kind" style={{ display: "flex", padding: 2, border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)" }}>
                {([["TEAM", "Team"], ["PERSONAL", "Personal"]] as const).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={newKind === k} onClick={() => setNewKind(k)}
                    style={{ height: 30, padding: "0 12px", border: 0, borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: "pointer", background: newKind === k ? "var(--panel2)" : "transparent", color: newKind === k ? "var(--text)" : "var(--text2)" }}>{l}</button>
                ))}
              </div>
            </div>
            <button className="so-btn" data-variant="primary" type="submit" style={{ height: 36 }} disabled={busy === "create" || newName.trim().length < 2}>
              {busy === "create" ? "Creating…" : "Create workspace"}
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>You become its owner. Invite people and connect channels afterwards.</div>
        </form>
      ) : null}

      {note ? (
        <span role="status" style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))", gap: 12 }}>
        {rows.map((row) => {
          const owner = row.role.toUpperCase() === "OWNER";
          const canRename = ["OWNER", "ADMIN"].includes(row.role.toUpperCase());
          const isConfirm = confirming === row.id;
          const verb = owner ? "Delete" : "Leave";
          const doBusy = busy === `${owner ? "delete" : "leave"}:${row.id}`;
          return (
            <section key={row.id} className="so-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, borderColor: row.isCurrent ? "var(--accent)" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: tintOf(row.id), display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, color: "#06140B" }}>{initials(row.name)}</span>
                {renaming === row.id ? (
                  <input aria-label="Workspace name" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ ...field, height: 32, flex: 1, minWidth: 120 }} autoFocus />
                ) : (
                  <span style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                )}
                <span className="so-pill">{row.kind.toLowerCase()}</span>
                <span className="so-pill" data-tone={owner ? "approved" : undefined}>{row.role.toLowerCase()}</span>
                {row.isCurrent ? <span className="so-pill" data-tone="scheduled">Current</span> : null}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                {[["Members", row.members], ["Brains", row.brains], ["Channels", row.channels], ["Posts", row.posts]].map(([label, value]) => (
                  <div key={String(label)} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg)" }}>
                    <div className="so-mono" style={{ fontWeight: 600, fontSize: 16 }}>{value}</div>
                    <div className="so-mono" style={{ fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text3)" }}>{label}</div>
                  </div>
                ))}
              </div>

              {isConfirm ? (
                <div role="alert" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid var(--red)", borderRadius: 8, background: "var(--redSoft)", fontSize: 12.5, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 180 }}>
                    {owner ? `Delete "${row.name}" permanently? Its posts, channels and brains go with it.` : `Leave "${row.name}"? You lose access to its content.`}
                  </span>
                  <button className="so-btn" style={{ height: 32, color: "var(--red)", borderColor: "var(--red)" }} disabled={doBusy} onClick={() => void leave(row, owner)}>
                    {doBusy ? "…" : verb}
                  </button>
                  <button className="so-btn" style={{ height: 32 }} onClick={() => setConfirming(null)}>Cancel</button>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {renaming === row.id ? (
                  <>
                    <button className="so-btn" data-variant="primary" style={{ height: 32 }} disabled={busy === `rename:${row.id}` || renameValue.trim().length < 2} onClick={() => void rename(row)}>Save</button>
                    <button className="so-btn" style={{ height: 32 }} onClick={() => setRenaming(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {!row.isCurrent ? (
                      <button className="so-btn" data-variant="primary" style={{ height: 32 }} disabled={busy === `open:${row.id}`} onClick={() => void open(row)}>
                        {busy === `open:${row.id}` ? "Opening…" : "Open"}
                      </button>
                    ) : null}
                    {canRename ? (
                      <button className="so-btn" style={{ height: 32 }} onClick={() => { setRenaming(row.id); setRenameValue(row.name); }}>Rename</button>
                    ) : null}
                  </>
                )}
                <span style={{ flex: 1 }} />
                <button className="so-btn" style={{ height: 32, color: "var(--red)" }} onClick={() => setConfirming(row.id)}>{verb}</button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
