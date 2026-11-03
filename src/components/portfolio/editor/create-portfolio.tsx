"use client";

/**
 * First-run screen: blank canvas or one of the three templates.
 * A template is copied at creation — after this POST nothing links back to it.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

const TEMPLATES = [
  { key: "blank", name: "Blank canvas", description: "Start with an empty page and build it yourself." },
  { key: "editorial", name: "Editorial", description: "Wide, type-led, warm. For designers who write." },
  { key: "terminal", name: "Terminal", description: "Mono, dense, list-heavy. For engineers." },
  { key: "gallery", name: "Gallery", description: "Image-led two-column grid. For visual work." },
];

export function CreatePortfolio() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [choice, setChoice] = useState("blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() || undefined, template: choice }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not create the portfolio (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while creating the portfolio.");
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%",
    background: "#1b1b21",
    color: "#ededf1",
    border: "1px solid rgba(255,255,255,0.13)",
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 13,
    outline: "none",
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px", display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Your professional portfolio</h1>
        <p style={{ margin: "6px 0 0", color: "#a6a6b0", fontSize: 13.5 }}>
          Pick a starting point. Everything after that is yours to change — layout, type, colour, spacing.
        </p>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {TEMPLATES.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => setChoice(template.key)}
            style={{
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${choice === template.key ? "#48ed85" : "rgba(255,255,255,0.13)"}`,
              background: choice === template.key ? "rgba(72,237,133,0.08)" : "#131317",
              color: "#ededf1",
              cursor: "pointer",
              display: "grid",
              gap: 3,
            }}
          >
            <strong style={{ fontSize: 14 }}>{template.name}</strong>
            <span style={{ fontSize: 12.5, color: "#a6a6b0" }}>{template.description}</span>
          </button>
        ))}
      </div>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7c7c87" }}>Public handle</span>
        <input style={field} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="alex-morgan (optional — we suggest one)" />
        <span style={{ fontSize: 11.5, color: "#7c7c87" }}>Your portfolio will live at /p/&lt;handle&gt;.</span>
      </label>

      {error ? <p style={{ color: "#ff8f8f", fontSize: 12.5, margin: 0 }}>{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        style={{ background: "#48ed85", color: "#003917", border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
      >
        {busy ? "Creating…" : "Create portfolio"}
      </button>
    </div>
  );
}
