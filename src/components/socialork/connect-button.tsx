"use client";

/**
 * Starts a real connect flow: asks the server for the provider URL and follows
 * it. The URL is built server-side from the deployment's credentials, so this
 * component never guesses an endpoint or a redirect.
 */
import { useState } from "react";

export function ConnectButton({ platform, label = "Connect" }: { platform: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/connect?platform=${platform}`);
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? `Not configured (${res.status})`);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="so-btn" style={{ height: 26 }} onClick={start} disabled={busy}>
        {busy ? "Opening…" : label}
      </button>
      {error ? <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 160 }}>{error}</span> : null}
    </span>
  );
}
