"use client";

/**
 * AI keys, inside the SocialOrk shell. Generation runs on a key the user or the
 * workspace supplied (`/api/ai/credentials`); the key is write-only and the
 * server only ever returns a hint.
 */
import { useEffect, useState } from "react";

type Scope = "user" | "workspace";

const PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "groq", label: "Groq" },
  { id: "nous", label: "Nous Research" },
  { id: "other", label: "Other (OpenAI-compatible)" },
];

type Hint = { provider?: string; keyHint?: string; baseUrl?: string | null; model?: string | null };

export default function AiKeysPage() {
  const [scope, setScope] = useState<Scope>("user");
  const [hints, setHints] = useState<Record<Scope, Hint | null>>({ user: null, workspace: null });
  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    for (const s of ["user", "workspace"] as Scope[]) {
      try {
        const res = await fetch(`/api/ai/credentials?scope=${s}`);
        if (!res.ok) continue;
        const data = await res.json();
        const entry =
          data?.scopes?.[s] ?? data?.[s] ?? (Array.isArray(data) ? data.find((c) => c.scope === s) : null);
        setHints((h) => ({ ...h, [s]: entry ?? null }));
      } catch {
        /* a missing key endpoint just means "nothing stored" */
      }
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/ai/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          kind: "text",
          provider,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || undefined,
          model: model.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote({ kind: "err", text: data.error ?? `Save failed (${res.status}).` });
        return;
      }
      setApiKey("");
      setNote({ kind: "ok", text: "Key stored. It is encrypted and never shown again." });
      void load();
    } catch {
      setNote({ kind: "err", text: "Network error — the key was not stored." });
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)",
    background: "var(--panel2)", color: "var(--text)", fontSize: 13, outline: "none",
  };
  const current = hints[scope];

  return (
    <div className="so-page" style={{ maxWidth: 820 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">AI keys</h1>
        <p className="so-sub">
          Bring your own key. Generation always runs on the key its owner supplied — with no key,
          drafts are written by hand and the product says so.
        </p>
      </div>

      <div className="so-tabs">
        {(["user", "workspace"] as Scope[]).map((s) => (
          <button key={s} className="so-tab" data-active={scope === s} onClick={() => setScope(s)}>
            {s === "user" ? "My key" : "Workspace key"}
          </button>
        ))}
      </div>

      <div className="so-card so-card-pad" style={{ display: "grid", gap: 6 }}>
        {current ? (
          <>
            <div className="so-stat-label">Stored</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span className="so-pill" data-tone="approved">{current.provider ?? "configured"}</span>
              <span className="so-mono" style={{ color: "var(--text3)" }}>{current.keyHint ?? "••••"}</span>
              {current.model ? <span className="so-mono" style={{ color: "var(--text3)" }}>{current.model}</span> : null}
            </div>
          </>
        ) : (
          <>
            <div className="so-stat-label">Nothing stored for this scope</div>
            <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
              AI features stay off for this scope until a key is saved.
            </p>
          </>
        )}
      </div>

      <form onSubmit={save} className="so-card so-card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="provider">Provider</label>
          <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)} style={field}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="so-stat-label" htmlFor="apiKey">API key</label>
          <input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…" autoComplete="off" style={field} required minLength={8} />
          <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
            Stored encrypted. It is never shown again — not to you, not to us.
          </span>
        </div>

        <div className="so-grid so-grid-2">
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="baseUrl">Base URL (optional)</label>
            <input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1" style={field} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="so-stat-label" htmlFor="model">Model (optional)</label>
            <input id="model" value={model} onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini" style={field} />
          </div>
        </div>

        <div className="so-row" style={{ justifyContent: "flex-end", gap: 10 }}>
          {note ? (
            <span style={{ fontSize: 12, color: note.kind === "ok" ? "var(--green)" : "var(--red)" }}>{note.text}</span>
          ) : null}
          <button className="so-btn" data-variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save key"}
          </button>
        </div>
      </form>

      <a href="/socialork/settings" style={{ fontSize: 12.5 }}>← Back to settings</a>
    </div>
  );
}
