"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Welcome to SocialOrc</h1>
        <p className="mt-1 text-sm text-muted-foreground">Who will use this account?</p>
      </div>
      <div role="radiogroup" aria-label="Who will use this account?" className="grid gap-3">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="radio"
            aria-checked={kind === option.kind}
            disabled={option.disabled}
            onClick={() => setKind(option.kind)}
            className={`rounded-lg border p-4 text-left transition ${kind === option.kind ? "border-primary ring-2 ring-primary/30" : "border-border"} ${option.disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary"}`}
          >
            <strong className="block">{option.title}</strong>
            <span className="text-sm text-muted-foreground">{option.text}</span>
          </button>
        ))}
      </div>
      {kind === "TEAM" && (
        <div role="radiogroup" aria-label="Your role in the team" className="grid gap-2">
          <p className="text-sm font-medium">Your role in the team</p>
          {TEAM_ROLES.map((option) => (
            <button
              key={option.role}
              type="button"
              role="radio"
              aria-checked={role === option.role}
              onClick={() => setRole(option.role)}
              className={`rounded-lg border p-3 text-left transition ${role === option.role ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary"}`}
            >
              <strong className="block text-sm">{option.title}</strong>
              <span className="text-xs text-muted-foreground">{option.text}</span>
            </button>
          ))}
          {role !== "ADMIN" && (
            <p className="text-xs text-muted-foreground">Only an Admin can invite and manage others. You can start as Admin.</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Continue"}</Button>
    </main>
  );
}
