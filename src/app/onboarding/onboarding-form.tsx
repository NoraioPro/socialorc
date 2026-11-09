"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./onboarding.css";

type Kind = "PERSONAL" | "TEAM";
type TeamRole = "ADMIN" | "MANAGER" | "EDITOR" | "CLIENT";

const TEAM_ROLES: { role: TeamRole; title: string; text: string }[] = [
  { role: "ADMIN", title: "Admin", text: "Full control, including inviting and managing teammates." },
  { role: "MANAGER", title: "Manager", text: "Approve, schedule and connect accounts." },
  { role: "EDITOR", title: "Editor", text: "Create and submit posts for approval." },
  { role: "CLIENT", title: "Client", text: "View only." },
];

export function OnboardingForm({ teamsAvailable }: { teamsAvailable: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("PERSONAL");
  const [role, setRole] = useState<TeamRole>("ADMIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "TEAM" ? { kind, role } : { kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save your choice.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your choice.");
      setBusy(false);
    }
  }

  const options: { kind: Kind; title: string; text: string; disabled?: boolean }[] = [
    { kind: "PERSONAL", title: "Just me", text: "Your own private workspace. You have every permission and nothing to set up." },
    {
      kind: "TEAM",
      title: "A team",
      text: teamsAvailable
        ? "You are the administrator and invite teammates with their own roles."
        : "Invite teammates with their own roles. Not available yet.",
      disabled: !teamsAvailable,
    },
  ];

  const card = (on: boolean, off?: boolean): React.CSSProperties => ({
    padding: 12, border: `1px solid ${on ? "var(--accent)" : "var(--line2)"}`, borderRadius: 10,
    background: on ? "var(--accentSoft)" : "var(--panel)", textAlign: "start", color: "var(--text)",
    cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.5 : 1,
  });
  const btn: React.CSSProperties = {
    height: 38, padding: "0 14px", border: 0, borderRadius: 8, background: "var(--accent)",
    color: "var(--onAccent)", fontWeight: 600, fontSize: 12.5, cursor: "pointer",
  };

  return (
    <main className="so-onb">
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", borderBottom: "1px solid var(--line)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socialork-logo.svg" alt="" width={26} height={24} />
        <span style={{ fontWeight: 700 }}>SocialOrk</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11.5, color: "var(--text3)" }}>Setup</span>
      </header>
      <div style={{ height: 3, background: "var(--panel2)" }}><div style={{ height: "100%", width: kind === "TEAM" ? "66%" : "33%", background: "var(--accent)", transition: "width .3s" }} /></div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "36px 18px 60px" }}>
        <div style={{ width: "min(620px,100%)", display: "flex", flexDirection: "column", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>Welcome to SocialOrk</h1>
          <p style={{ margin: 0, color: "var(--text2)" }}>Who will use this account?</p>
          <div role="radiogroup" aria-label="Who will use this account?" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
            {options.map((option) => (
              <button key={option.kind} type="button" role="radio" aria-checked={kind === option.kind}
                disabled={option.disabled} onClick={() => setKind(option.kind)} style={card(kind === option.kind, option.disabled)}>
                <span style={{ display: "block", fontWeight: 600 }}>{option.title}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text2)" }}>{option.text}</span>
              </button>
            ))}
          </div>
          {kind === "TEAM" && (
            <div role="radiogroup" aria-label="Your role in the team" style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>Your role in the team</span>
              {TEAM_ROLES.map((option) => (
                <button key={option.role} type="button" role="radio" aria-checked={role === option.role}
                  onClick={() => setRole(option.role)} style={card(role === option.role)}>
                  <span style={{ display: "block", fontWeight: 600 }}>{option.title}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text2)" }}>{option.text}</span>
                </button>
              ))}
              {role !== "ADMIN" && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--text3)" }}>Only an Admin can invite and manage others. You can start as Admin.</p>
              )}
            </div>
          )}
          {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--red)" }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" disabled={busy} onClick={submit} style={{ ...btn, opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Continue"}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
