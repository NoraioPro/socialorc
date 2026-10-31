"use client";

/**
 * The workspace switcher: list every workspace this member belongs to, switch
 * between them, and create a new one (which they own).
 *
 * The server treats the choice as a preference validated against membership — this
 * control only asks; it never grants access.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

type Workspace = { id: string; name: string; role?: string };

export function WorkspaceSwitcher({
  currentName,
  brains,
  accounts,
}: {
  currentName: string;
  brains: number;
  accounts: number;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Workspace[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const data = (await res.json()) as { workspaces?: Workspace[] };
      setList(data.workspaces ?? []);
    } catch {
      /* keep the header usable even if the list fails */
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  const switchTo = async (workspaceId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not switch workspace.");
        return;
      }
      window.location.href = "/socialork/overview";
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind: "TEAM" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        workspace?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.workspace) {
        setError(data.error ?? "Could not create the workspace.");
        return;
      }
      await switchTo(data.workspace.id);
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", height: 30, padding: "0 9px", borderRadius: 8,
    border: "1px solid var(--line2)", background: "var(--panel2)",
    color: "var(--text)", fontSize: 12.5, outline: "none",
  };

  return (
    <div style={{ position: "relative", margin: "0 12px 10px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 10px",
          borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel)",
          color: "var(--text)", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentName}
          </span>
          <span className="so-brain-meta">
            {brains} {brains === 1 ? "brain" : "brains"} · {accounts} {accounts === 1 ? "channel" : "channels"}
          </span>
        </span>
        <ChevronDown size={14} strokeWidth={2} style={{ marginLeft: "auto", color: "var(--text3)", flex: "none" }} />
      </button>

      {open ? (
        <div
          className="so-card so-palette"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            padding: 6, boxShadow: "var(--shadow)", display: "grid", gap: 2,
          }}
        >
          <div style={{ padding: "4px 8px", fontSize: 10.5, color: "var(--text3)" }}>
            Your workspaces
          </div>
          {list.map((w) => (
            <button
              key={w.id}
              className="so-nav-item"
              style={{ height: 28, width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
              disabled={busy}
              onClick={() => void switchTo(w.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</span>
              {w.name === currentName ? (
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>current</span>
              ) : w.role ? (
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>
                  {String(w.role).toLowerCase()}
                </span>
              ) : null}
            </button>
          ))}
          {list.length === 0 ? (
            <span style={{ padding: "4px 8px", fontSize: 11, color: "var(--text3)" }}>No other workspace.</span>
          ) : null}

          <div className="so-divider" style={{ margin: "4px 0" }} />
          <a href="/socialork/workspaces" className="so-nav-item" style={{ height: 28 }}>
            <span>Manage workspaces</span>
            <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>→</span>
          </a>
          {creating ? (
            <form onSubmit={create} style={{ display: "grid", gap: 6, padding: "2px 4px 4px" }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New workspace name"
                style={field}
              />
              <div className="so-row" style={{ gap: 6, justifyContent: "flex-end" }}>
                <button type="button" className="so-btn" style={{ height: 26 }}
                  onClick={() => { setCreating(false); setName(""); }}>
                  Cancel
                </button>
                <button type="submit" className="so-btn" data-variant="primary" style={{ height: 26 }}
                  disabled={busy || name.trim().length < 2}>
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          ) : (
            <button
              className="so-nav-item"
              style={{ height: 28, width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
              onClick={() => setCreating(true)}
            >
              <Plus size={14} strokeWidth={2} />
              <span>New workspace</span>
            </button>
          )}
          {error ? (
            <span style={{ padding: "2px 8px 4px", fontSize: 11, color: "var(--red)" }}>{error}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
