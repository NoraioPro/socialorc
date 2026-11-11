import type { CSSProperties, ReactNode } from "react";

/** Small presentational pieces shared by the design-only screens (no data, no client state). */
export const card: CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)",
  boxShadow: "var(--card)", overflow: "hidden",
};


/** Says plainly that a screen is a design preview with no backend yet. */
export function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" style={{ padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--panel)", fontSize: 12.5, color: "var(--text2)", display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 999, background: "var(--amberSoft)", color: "var(--amber)", whiteSpace: "nowrap" }}>Preview</span>
      <span>{children}</span>
    </div>
  );
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub: string; color?: string }) {
  return (
    <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--text2)" }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: color ?? "var(--text)" }}>{value}</span>
      <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{sub}</span>
    </section>
  );
}

export function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section style={card}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {sub ? <div style={{ fontSize: 12, color: "var(--text3)" }}>{sub}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ padding: 28, border: "1px dashed var(--line2)", borderRadius: 12, textAlign: "center", color: "var(--text3)", margin: 12 }}>
      <div style={{ fontWeight: 600, color: "var(--text)" }}>{title}</div>
      {children ? <div style={{ fontSize: 12.5, marginTop: 2 }}>{children}</div> : null}
    </div>
  );
}

export const mono: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
