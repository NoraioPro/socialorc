"use client";

/**
 * The sign-in screen from the handoff, wired to the auth that already exists:
 * NextAuth credentials plus whichever OAuth providers the deployment configured.
 * Nothing here decides who may enter — the server does.
 */
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

const ERROR_COPY: Record<string, string> = {
  CredentialsSignin: "That email and password do not match.",
  MissingCSRF: "Your browser dropped the sign-in cookie — reload and try again.",
  SessionRequired: "Sign in to continue.",
  AccessDenied: "That account was denied access.",
  OAuthAccountNotLinked: "That email already has a password account. Sign in with the password.",
};

export function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(ERROR_COPY[params.get("error") ?? ""] ?? null);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, { id: string; name: string }>) => {
        setProviders(
          Object.values(data)
            .filter((p) => p.id !== "credentials")
            .map((p) => ({ id: p.id, label: p.name })),
        );
      })
      .catch(() => undefined);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/socialork/overview" });
    if (!res || res.error) {
      setError(ERROR_COPY[String(res?.error)] ?? "Sign-in failed. Check your details and try again.");
      setBusy(false);
      return;
    }
    window.location.href = "/socialork/overview";
  };

  const field: React.CSSProperties = {
    width: "100%", height: 38, padding: "0 11px", borderRadius: 8,
    border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--text)",
    fontSize: 13, outline: "none",
  };

  return (
    <form onSubmit={submit} className="so-signin-card">
      <div style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>Sign in</h2>
        <p style={{ margin: 0, color: "var(--text3)", fontSize: 12.5 }}>
          Use the account your admin invited.
        </p>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="so-stat-label" htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="email" required style={field} />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div className="so-row" style={{ justifyContent: "space-between" }}>
          <label className="so-stat-label" htmlFor="password">Password</label>
          <a href="/register" style={{ fontSize: 11.5 }}>Forgot?</a>
        </div>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" required style={field} />
      </div>

      {error ? <p style={{ margin: 0, color: "var(--red)", fontSize: 12 }}>{error}</p> : null}

      <button className="so-btn" data-variant="primary" type="submit" disabled={busy} style={{ height: 38 }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {providers.length > 0 ? (
        <>
          <div className="so-row" style={{ gap: 8 }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>OR</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          {providers.map((p) => (
            <button key={p.id} type="button" className="so-btn" style={{ height: 36 }}
              onClick={() => signIn(p.id, { callbackUrl: "/socialork/overview" })}>
              Continue with {p.label}
            </button>
          ))}
        </>
      ) : null}

      <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text2)" }}>
          Got an invitation? Open the link in your email.
        </span>
        <span className="so-mono" style={{ fontSize: 10.5, color: "var(--text3)" }}>
          Invite-only. Ask your workspace admin for access.
        </span>
      </div>
    </form>
  );
}
