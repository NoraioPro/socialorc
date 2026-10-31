"use client";

/**
 * The brand you are working in.
 *
 * Hidden when a workspace has one brand, because then there is nothing to choose
 * and the concept should stay out of the member's way. With more than one it sits
 * under the workspace switcher, and the choice is a cookie the server re-validates.
 */
import { useState } from "react";
import { Tag } from "lucide-react";

export function BrainSwitcher({
  brains,
  activeId,
}: {
  brains: { id: string; name: string; isDefault: boolean }[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (brains.length < 2) return null;
  const active = brains.find((b) => b.id === activeId) ?? brains[0];

  const pick = async (id: string) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/brains/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brainId: id }),
      });
      if (res.ok) window.location.href = "/socialork/overview";
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative", margin: "0 12px 10px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="The brand you are working in"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 9px",
          borderRadius: 8, border: "1px solid var(--line)", background: "transparent",
          color: "var(--text2)", cursor: "pointer", textAlign: "left", fontSize: 11.5,
        }}
      >
        <Tag size={13} strokeWidth={1.8} style={{ flex: "none", color: "var(--accent)" }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</span>
        <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <div
          className="so-card so-palette"
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 25,
            padding: 6, boxShadow: "var(--shadow)", display: "grid", gap: 2,
          }}
        >
          <div style={{ padding: "4px 8px", fontSize: 10.5, color: "var(--text3)" }}>Brands in this workspace</div>
          {brains.map((b) => (
            <button
              key={b.id}
              className="so-nav-item"
              style={{ height: 28, width: "100%", border: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
              disabled={busy}
              onClick={() => void pick(b.id)}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span>
              {b.id === activeId ? (
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--accent)" }}>current</span>
              ) : b.isDefault ? (
                <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>default</span>
              ) : null}
            </button>
          ))}
          <div className="so-divider" style={{ margin: "4px 0" }} />
          <a href="/socialork/brains" className="so-nav-item" style={{ height: 28 }}>
            <span>Manage brands</span>
            <span className="so-mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--text3)" }}>→</span>
          </a>
        </div>
      ) : null}
    </div>
  );
}
