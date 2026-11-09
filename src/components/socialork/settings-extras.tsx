"use client";

/**
 * Settings → Billing and Security (design: Settings). Only real information is
 * shown: there is no payment system behind this workspace yet and sessions are
 * signed tokens, so the screens say what exists and what does not, instead of
 * offering switches that do nothing.
 */
import Link from "next/link";
import { signOut } from "next-auth/react";

export type Usage = { members: number; brains: number; channels: number; postsThisMonth: number; published30d: number; aiKey: boolean };
export type SecurityInfo = { email: string; hasPassword: boolean; providers: string[] };

const PROVIDER: Record<string, string> = { google: "Google", facebook: "Facebook", linkedin: "LinkedIn", twitter: "X", github: "GitHub" };

export function BillingTab({ usage, workspaceName }: { usage: Usage; workspaceName: string }) {
  const tiles = [
    { label: "Members", value: usage.members },
    { label: "Brains", value: usage.brains },
    { label: "Connected channels", value: usage.channels },
    { label: "Posts created this month", value: usage.postsThisMonth },
    { label: "Published in 30 days", value: usage.published30d },
    { label: "AI key", value: usage.aiKey ? "Your own" : "Not set" },
  ];
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
      <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
        <span className="so-stat-label">Current plan</span>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No plan set up</div>
        <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
          Billing is not connected for {workspaceName} yet, so there is no plan, payment method or invoice to show. Nothing is being charged. When billing ships it is per workspace, and adding reviewers will not cost extra.
        </p>
      </section>
      <section className="so-card so-card-pad" style={{ display: "grid", gap: 12 }}>
        <span className="so-stat-label">Usage</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {tiles.map((t) => (
            <div key={t.label} style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 10, background: "var(--bg)" }}>
              <div className="so-mono" style={{ fontSize: 20, fontWeight: 600 }}>{t.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--text3)" }}>{t.label}</div>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--text3)" }}>AI generation runs on the key saved under AI keys, so it is billed by that provider, not by SocialOrk.</span>
      </section>
    </div>
  );
}

export function SecurityTab({ info, onAudit }: { info: SecurityInfo; onAudit: () => void }) {
  const methods = [
    ...(info.hasPassword ? [{ name: "Email and password", detail: info.email }] : []),
    ...info.providers.map((p) => ({ name: PROVIDER[p] ?? p, detail: "Single sign-in through your account there" })),
  ];
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
      <section className="so-card">
        <div className="so-card-pad" style={{ borderBottom: "1px solid var(--line)", display: "grid", gap: 4 }}>
          <span className="so-stat-label">Sign-in</span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>How you get into this account.</span>
        </div>
        {methods.length ? methods.map((m, i) => (
          <div key={m.name} className="so-row" style={{ padding: "11px 16px", borderTop: i ? "1px solid var(--line)" : 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
            <span style={{ fontWeight: 600 }}>{m.name}</span>
            <span style={{ color: "var(--text3)", fontSize: 12 }}>{m.detail}</span>
          </div>
        )) : <div className="so-empty">No sign-in method recorded.</div>}
        <div className="so-row" style={{ padding: "11px 16px", borderTop: "1px solid var(--line)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text3)" }} />
          <span style={{ fontWeight: 600 }}>Two-factor authentication</span>
          <span style={{ color: "var(--text3)", fontSize: 12 }}>Not available yet. Signing in with Google or Facebook uses their two-step verification.</span>
        </div>
      </section>

      <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
        <span className="so-stat-label">Sessions</span>
        <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>
          Sign-ins are signed tokens that last until they expire, so other devices cannot be listed here. Signing out ends this device&apos;s session. A role change or removal from the workspace applies on the next request on every device.
        </p>
        <div><button className="so-btn" style={{ height: 32 }} onClick={() => void signOut({ callbackUrl: "/login" })}>Sign out of this device</button></div>
      </section>

      <section className="so-card so-card-pad" style={{ display: "grid", gap: 8 }}>
        <span className="so-stat-label">Your data</span>
        <p style={{ margin: 0, color: "var(--text2)", fontSize: 12.5 }}>See what was done in this workspace, or ask for your data to be deleted.</p>
        <div className="so-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="so-btn" style={{ height: 32 }} onClick={onAudit}>Open audit trail</button>
          <Link className="so-btn" style={{ height: 32 }} href="/data-deletion">Delete my data…</Link>
        </div>
      </section>
    </div>
  );
}

/** Download the loaded audit rows as CSV. */
export function downloadAuditCsv(rows: { when: string; action: string; actor: string; subject: string; ip: string }[]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Time", "Action", "Actor", "Subject", "IP"].join(","), ...rows.map((r) => [r.when, r.action, r.actor, r.subject, r.ip].map(esc).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
