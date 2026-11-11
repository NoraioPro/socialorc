"use client";

/**
 * AI keys, inside the SocialOrk shell. Generation runs on a key the user or the
 * workspace supplied (`/api/ai/credentials`); the key is write-only and the
 * server only ever returns a hint.
 */
import { useEffect, useState } from "react";

type Scope = "user" | "workspace";

type Preset = { id: string; label: string; baseUrl?: string; model?: string };

/** Picking a preset fills Base URL + Model; the user can still edit both. */
const PROVIDERS: Preset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  { id: "xai", label: "xAI Grok", baseUrl: "https://api.x.ai/v1", model: "grok-4" },
  { id: "anthropic", label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { id: "mistral", label: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-large-latest" },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "together", label: "Together AI", baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { id: "perplexity", label: "Perplexity", baseUrl: "https://api.perplexity.ai", model: "sonar" },
  { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "deepinfra", label: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai" },
  { id: "nous", label: "Nous Research", baseUrl: "https://inference-api.nousresearch.com/v1" },
  { id: "other", label: "Other (OpenAI-compatible)" },
];

/** Only OpenAI-shaped image APIs qualify: POST {baseUrl}/images/generations. */
const IMAGE_PROVIDERS: Preset[] = [
  { id: "openai", label: "OpenAI (gpt-image-1 / dall-e-3)", baseUrl: "https://api.openai.com/v1", model: "gpt-image-1" },
  { id: "gemini", label: "Google Gemini (Nano Banana)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash-image" },
  { id: "xai", label: "xAI Grok Imagine", baseUrl: "https://api.x.ai/v1", model: "grok-imagine-image-2.0" },
  { id: "together", label: "Together AI (FLUX)", baseUrl: "https://api.together.xyz/v1", model: "black-forest-labs/FLUX.1-schnell" },
  { id: "deepinfra", label: "DeepInfra", baseUrl: "https://api.deepinfra.com/v1/openai" },
  { id: "fireworks", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { id: "other", label: "Other (OpenAI-compatible image API)" },
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
  // Text and image keys are separate rows: an account can bring one, or both.
  const [keyKind, setKeyKind] = useState<"text" | "image">("text");

  const load = async () => {
    for (const s of ["user", "workspace"] as Scope[]) {
      try {
        const res = await fetch(`/api/ai/credentials?scope=${s}&kind=${keyKind}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyKind]);

  const pickProvider = (id: string) => {
    setProvider(id);
    const p = (keyKind === "image" ? IMAGE_PROVIDERS : PROVIDERS).find((x) => x.id === id);
    if (p) {
      setBaseUrl(p.baseUrl ?? "");
      setModel(p.model ?? "");
    }
  };

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
          kind: keyKind,
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
        {(["text", "image"] as const).map((k) => (
          <button key={k} className="so-tab" data-active={keyKind === k} onClick={() => { setKeyKind(k); setProvider(k === "image" ? IMAGE_PROVIDERS[0].id : PROVIDERS[0].id); }}>
            {k === "text" ? "Text generation" : "Image generation"}
          </button>
        ))}
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
          <select id="provider" value={provider} onChange={(e) => pickProvider(e.target.value)} style={field}>
            {(keyKind === "image" ? IMAGE_PROVIDERS : PROVIDERS).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {keyKind === "image" ? (
            <span className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
              Image keys are separate from text keys. The endpoint must accept
              POST {"{baseUrl}"}/images/generations and return b64_json or url.
            </span>
          ) : null}
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
              placeholder={keyKind === "image" ? "gpt-image-1 (or dall-e-3)" : "gpt-4o-mini"} style={field} />
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
