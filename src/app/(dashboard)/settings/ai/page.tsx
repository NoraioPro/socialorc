"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  Save,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Header } from "@/components/dashboard/header";

/**
 * Where a person enters the AI key that pays for their own generation.
 *
 * The rule this page exists to make visible: generation runs on the key its owner
 * supplied, never on SocialOrk's own key. So the banner at the top always states
 * which key is in force, and "no key at all" is a first-class state that says AI
 * is off rather than pretending otherwise.
 *
 * The key is write-only. It is never prefilled, never returned by the API, and
 * once stored only its last four characters are shown.
 */

type Scope = "user" | "workspace";

interface CredentialStatus {
  scope: Scope;
  configured: boolean;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  keyHint: string | null;
  effectiveSource: "user" | "workspace" | null;
}

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "nous", label: "Nous Research" },
  { value: "groq", label: "Groq" },
  { value: "anthropic", label: "Anthropic" },
  { value: "custom", label: "Other (OpenAI-compatible)" },
];

const fieldClass =
  "h-12 w-full rounded-md border border-primary/15 bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40";

export default function AiSettingsPage() {
  const [scope, setScope] = useState<Scope>("user");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<CredentialStatus | null>(null);

  const [provider, setProvider] = useState("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The workspace scope needs an id; the workspace tab stays disabled until one
  // is known rather than sending a request that is guaranteed to be rejected.
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const first = Array.isArray(data?.workspaces) ? data.workspaces[0] : null;
        if (first?.id) setWorkspaceId(first.id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ scope });
      if (scope === "workspace" && workspaceId) query.set("workspaceId", workspaceId);
      const res = await fetch(`/api/ai/credentials?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not read the current setting.");
      setStatus(data);
      setProvider(data.provider ?? "openai");
      setBaseUrl(data.baseUrl ?? "");
      setModel(data.model ?? "");
      // Never prefilled: the key is write-only, so the field always starts empty.
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [scope, workspaceId]);

  useEffect(() => {
    if (scope === "workspace" && !workspaceId) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, scope, workspaceId]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/ai/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          workspaceId: scope === "workspace" ? workspaceId : undefined,
          provider,
          apiKey,
          baseUrl,
          model,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not save the key.");
      setApiKey("");
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({ scope });
      if (scope === "workspace" && workspaceId) query.set("workspaceId", workspaceId);
      const res = await fetch(`/api/ai/credentials?${query}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Could not remove the key.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const effective = status?.effectiveSource ?? null;
  const banner =
    effective === "user"
      ? { tone: "ok" as const, text: "You are using your own AI key." }
      : effective === "workspace"
        ? { tone: "ok" as const, text: "You are using your workspace's shared AI key." }
        : { tone: "off" as const, text: "No AI key configured — AI features are off." };

  return (
    <div className="flex flex-col">
      <Header title="AI" description="Bring your own AI key. Generation always runs on the key its owner supplied." />

      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <div
          className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${
            banner.tone === "ok"
              ? "border-primary/15 bg-primary/5 text-foreground"
              : "border-amber-500/30 bg-amber-500/5 text-amber-200"
          }`}
        >
          {banner.tone === "ok" ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScope("user")}
            className={`flex h-10 items-center gap-2 rounded-md border px-4 text-sm transition-colors ${
              scope === "user" ? "border-primary/40 bg-primary/10" : "border-primary/15 hover:bg-accent"
            }`}
          >
            <KeyRound className="h-4 w-4" /> My key
          </button>
          <button
            type="button"
            onClick={() => setScope("workspace")}
            disabled={!workspaceId}
            className={`flex h-10 items-center gap-2 rounded-md border px-4 text-sm transition-colors disabled:opacity-40 ${
              scope === "workspace" ? "border-primary/40 bg-primary/10" : "border-primary/15 hover:bg-accent"
            }`}
          >
            <UsersRound className="h-4 w-4" /> Workspace key
          </button>
        </div>

        {scope === "workspace" && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-3 w-3" /> A shared key spends the whole team&apos;s budget, so only a workspace
            admin can change it.
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4 rounded-md border border-primary/15 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Bot className="h-4 w-4 text-muted-foreground" />
                {status?.configured ? (
                  <span className="text-muted-foreground">
                    Stored: <span className="text-foreground">{status.provider}</span>{" "}
                    <span className="font-mono">{status.keyHint}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No key stored for this scope.</span>
                )}
              </div>
              {status?.configured && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="flex h-9 items-center gap-2 rounded-md border border-primary/15 px-3 text-xs text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="provider" className="text-xs font-medium text-muted-foreground">
                Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={fieldClass}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-xs font-medium text-muted-foreground">
                API key
              </label>
              <input
                id="apiKey"
                type="password"
                autoComplete="off"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className={`${fieldClass} font-mono`}
              />
              <p className="text-xs text-muted-foreground">
                Stored encrypted. It is never shown again — not to you, not to us.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="baseUrl" className="text-xs font-medium text-muted-foreground">
                  Base URL <span className="opacity-60">(optional)</span>
                </label>
                <input
                  id="baseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="model" className="text-xs font-medium text-muted-foreground">
                  Model <span className="opacity-60">(optional)</span>
                </label>
                <input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className={fieldClass}
                />
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" /> {error}
              </p>
            )}
            {saved && !error && (
              <p className="flex items-center gap-2 text-sm text-primary">
                <Check className="h-4 w-4" /> Saved.
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !apiKey.trim()}
                className="flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save key
              </button>
              <Link href="/settings/accounts" className="text-xs text-muted-foreground hover:text-foreground">
                Back to settings
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
