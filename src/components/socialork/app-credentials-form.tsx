"use client";

/**
 * Bring-your-own-app for connectors.
 *
 * A deployment has one app per provider, but a customer may have their own (that
 * is the only way they can publish to pages they own). These credentials are
 * stored encrypted per workspace and used for that workspace's connect flow only —
 * the deployment app stays the fallback.
 */
import { useEffect, useState } from "react";

const PLATFORMS = [
  { id: "LINKEDIN", name: "LinkedIn", idLabel: "Client ID", secretLabel: "Client secret" },
  { id: "TWITTER", name: "X", idLabel: "Client ID", secretLabel: "Client secret" },
  { id: "TIKTOK", name: "TikTok", idLabel: "Client key", secretLabel: "Client secret" },
  { id: "FACEBOOK", name: "Facebook", idLabel: "App ID", secretLabel: "App secret" },
  { id: "INSTAGRAM", name: "Instagram", idLabel: "App ID", secretLabel: "App secret" },
  { id: "YOUTUBE", name: "YouTube", idLabel: "Client ID", secretLabel: "Client secret" },
];

type Stored = { platform: string; appId: string };

export function AppCredentialsForm() {
  const [stored, setStored] = useState<Stored[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/platform-credentials");
      if (!res.ok) return;
      const data = (await res.json()) as { stored?: Stored[] };
      setStored(data.stored ?? []);
    } catch {
      /* nothing stored */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (platform: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/platform-credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform, appId: appId.trim(), appSecret: secret.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote({ kind: "err", text: data.error ?? `Could not save (${res.status}).` });
        return;
      }
      setNote({ kind: "ok", text: "Saved. This workspace now connects with your app." });
      setAppId("");
      setSecret("");
      setOpen(null);
      void load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (platform: string) => {
    setBusy(true);
    try {
      await fetch(`/api/platform-credentials?platform=${platform}`, { method: "DELETE" });
      void load();
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 12.5, outline: "none",
  };

  return (
    <section className="so-card">
      <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="so-row">
          <span className="so-stat-label">App credentials</span>
          <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
            optional · your app, your quotas
          </span>
        </div>
      </div>
      <div className="so-card-pad" style={{ display: "grid", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text2)" }}>
          The deployment ships one app per network. If you have your own — usually because you need to
          publish to pages only you can authorise — paste its credentials here. They are encrypted, used
          only for this workspace, and never shown again.
        </p>

        {PLATFORMS.map((p) => {
          const existing = stored.find((s) => s.platform === p.id);
          const isOpen = open === p.id;
          return (
            <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
              <div className="so-row" style={{ padding: "8px 12px", gap: 10 }}>
                <span style={{ fontWeight: 600, minWidth: 92 }}>{p.name}</span>
                <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                  {existing ? `app ${existing.appId.slice(0, 8)}…` : "using the deployment app"}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="so-btn" style={{ height: 26 }} onClick={() => setOpen(isOpen ? null : p.id)}>
                    {isOpen ? "Close" : existing ? "Replace" : "Use my app"}
                  </button>
                  {existing ? (
                    <button className="so-btn" style={{ height: 26, color: "var(--red)" }}
                      disabled={busy} onClick={() => void remove(p.id)}>
                      Remove
                    </button>
                  ) : null}
                </span>
              </div>
              {isOpen ? (
                <div style={{ padding: "0 12px 12px", display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <label className="so-stat-label" htmlFor={`${p.id}-id`}>{p.idLabel}</label>
                    <input id={`${p.id}-id`} value={appId} onChange={(e) => setAppId(e.target.value)} style={field} />
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <label className="so-stat-label" htmlFor={`${p.id}-secret`}>{p.secretLabel}</label>
                    <input id={`${p.id}-secret`} type="password" value={secret}
                      onChange={(e) => setSecret(e.target.value)} style={field} autoComplete="off" />
                  </div>
                  <div className="so-row" style={{ justifyContent: "flex-end" }}>
                    <button className="so-btn" data-variant="primary" style={{ height: 28 }}
                      disabled={busy || !appId.trim() || !secret.trim()} onClick={() => void save(p.id)}>
                      {busy ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {note ? (
          <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
        ) : null}
      </div>
    </section>
  );
}
