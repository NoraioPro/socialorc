"use client";
import { use, useState } from "react";
import "../../socialork.css";

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Password changed. You can sign in now." } : { ok: false, text: j.error ?? "Could not change the password." });
  }
  return (
    <div className="so-root" data-theme="dark" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="so-card" style={{ width: "min(100%,380px)", padding: 24, display: "grid", gap: 14 }}>
        <h1 className="so-h1" style={{ fontSize: 20 }}>Choose a new password</h1>
        <input className="so-input" type="password" aria-label="New password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="so-btn" data-variant="primary" disabled={busy || msg?.ok} style={{ height: 38 }}>{busy ? "Saving…" : "Set password"}</button>
        {msg ? <p role="status" style={{ margin: 0, fontSize: 13, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}{msg.ok ? <> <a href="/signin">Sign in</a></> : null}</p> : null}
      </form>
    </div>
  );
}
