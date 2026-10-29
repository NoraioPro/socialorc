"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Kind = "PERSONAL" | "TEAM";

export function OnboardingForm({ teamsAvailable }: { teamsAvailable: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("PERSONAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
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
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Continue"}</Button>
    </main>
  );
}
