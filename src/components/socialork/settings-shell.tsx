"use client";

/**
 * Settings, in the handoff's shape: tabs for Profile / Connections / AI keys /
 * Notifications. Profile is editable (name + time zone, PATCH
 * /api/settings/profile); everything else states what is configured, missing or
 * simply not built yet.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/components/socialork/connect-button";

type Connection = {
  platform: string; name: string; handle: string | null; capability: string;
  state: "connected" | "reconnect" | "missing";
  configured?: boolean; missing?: string[]; redirectUri?: string | null;
};

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "connections", label: "Connections" },
  { id: "ai", label: "AI keys" },
  { id: "notifications", label: "Notifications" },
];

const ZONES = ["Europe/Oslo", "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC"];

export function SettingsShell({
  profile,
  workspaceName,
  role,
  connections,
  aiConfigured,
}: {
  profile: { name: string; email: string; timezone: string };
  workspaceName: string;
  role: string;
  connections: Connection[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(profile.name);
  const [timezone, setTimezone] = useState(profile.timezone || "Europe/Oslo");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, timezone }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Could not save (${res.status}).` });
        return;
      }
      setNote({ kind: "ok", text: "Saved." });
      router.refresh();
    } catch {
      setNote({ kind: "err", text: "Network error — nothing was saved." });
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", height: 34, padding: "0 10px", borderRadius: 8,
    border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--text)",
    fontSize: 13, outline: "none",
  };

  const connectedCount = connections.filter((c) => c.state !== "missing").length;
  const reconnectCount = connections.filter((c) => c.state === "reconnect").length;

  return (
    <>
      <div className="so-tabs">
        {TABS.map((t) => (
          <button key={t.id} className="so-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <form onSubmit={save} className="so-card so-card-pad" style={{ display: "grid", gap: 12, maxWidth: 620 }}>
          <div className="so-row" style={{ gap: 12 }}>
            <span
              style={{
                width: 40, height: 40, borderRadius: 999, display: "grid", placeItems: "center",
                background: "var(--panel2)", border: "1px solid var(--line2)",
                font: "600 13px var(--font-plex-mono), monospace", color: "var(--text2)",
              }}
            >
              {(name || profile.email).slice(0, 2).toUpperCase()}
            </span>
            <div style={{ display: "grid" }}>
              <span style={{ fontWeight: 600 }}>{name || profile.email}</span>
              <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                {role.toLowerCase()} · set by a workspace admin
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="name">Display name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required style={field} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="email">Email</label>
            <input id="email" value={profile.email} readOnly style={{ ...field, color: "var(--text3)" }} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="tz">Time zone</label>
            <select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} style={field}>
              {[...new Set([timezone, ...ZONES])].filter(Boolean).map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              Every schedule and audit timestamp is shown in this zone.
            </span>
          </div>

          <div className="so-row" style={{ justifyContent: "flex-end", gap: 10 }}>
            {note ? <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span> : null}
            <button className="so-btn" data-variant="primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}

      {tab === "connections" ? (
        <section className="so-card">
          <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="so-row">
              <span className="so-stat-label">Connections</span>
              <span className="so-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--text3)" }}>
                {connectedCount} of {connections.length} connected{reconnectCount ? ` · ${reconnectCount} needs reconnecting` : ""}
              </span>
            </div>
          </div>
          <div style={{ display: "grid" }}>
            {connections.map((c) => (
              <div key={c.platform} style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="so-row" style={{ padding: "10px 16px", gap: 10 }}>
                  <span style={{ fontWeight: 600, minWidth: 90 }}>{c.name}</span>
                  <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
                    {c.handle ? `@${c.handle}` : "not connected"}
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="so-pill">{c.capability}</span>
                    {c.state === "reconnect" ? (
                      <ConnectButton platform={c.platform} label="Reconnect" />
                    ) : c.state === "connected" ? (
                      <span className="so-pill" data-tone="approved">Connected</span>
                    ) : c.configured === false ? (
                      <span className="so-pill" data-tone="review">Needs setup</span>
                    ) : (
                      <ConnectButton platform={c.platform} />
                    )}
                  </span>
                </div>
                {c.state === "missing" && c.configured === false ? (
                  <div style={{ padding: "0 16px 10px", display: "grid", gap: 3 }}>
                    <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                      set {c.missing?.length ? c.missing.join(", ") : "the platform credentials"} in the deployment env
                    </span>
                    {c.redirectUri ? (
                      <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
                        redirect URI · {c.redirectUri}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "ai" ? (
        <section className="so-card so-card-pad" style={{ display: "grid", gap: 10, maxWidth: 620 }}>
          <div className="so-row">
            <span className="so-stat-label">AI generation</span>
            <span className="so-pill" data-tone={aiConfigured ? "approved" : "review"}>
              {aiConfigured ? "key stored" : "no key"}
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
            Generation runs on a key you or this workspace supplied. With no key, drafts are written
            by hand and the product says so.
          </p>
          <a href="/socialork/settings/ai" className="so-btn" style={{ justifySelf: "start", textDecoration: "none" }}>
            Manage AI keys
          </a>
        </section>
      ) : null}

      {tab === "notifications" ? (
        <section className="so-card so-card-pad" style={{ display: "grid", gap: 8, maxWidth: 620 }}>
          <span className="so-stat-label">Notifications</span>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
            Email and in-app notifications for approvals are not built yet. Nothing here is a switch
            that does nothing — when this ships it will list the events you can subscribe to.
          </p>
        </section>
      ) : null}

      <div className="so-frame" style={{ maxWidth: 620 }}>
        Workspace · {workspaceName}. Profile changes are audited; connection credentials live in the
        deployment environment and are never shown here.
      </div>
    </>
  );
}
