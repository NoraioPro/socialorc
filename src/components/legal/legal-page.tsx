import type { ReactNode } from "react";

/**
 * Reading layout for the legal pages (privacy, terms, data deletion).
 *
 * These three URLs are submitted to Meta (Privacy Policy URL, Terms of Service
 * URL, Data deletion instructions URL) and to Google during OAuth verification,
 * so they must be plain, complete, readable without JavaScript, and printable.
 * No client component, no animation, no cookie banner: a reviewer opens the raw
 * page and judges it.
 */

export const LEGAL_CONTACT_EMAIL = "emma@medioteq.no";
export const LEGAL_LAST_UPDATED = "1 November 2026";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        background: "#faf8f5",
        color: "#1b1b1f",
        minHeight: "100vh",
        padding: "56px 20px 96px",
        fontFamily:
          '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        lineHeight: 1.62,
        fontSize: 16,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            marginBottom: 28,
            fontSize: 14,
            color: "#6b6b73",
            textDecoration: "none",
          }}
        >
          ← SocialOrk
        </a>

        <h1
          style={{
            fontSize: 34,
            lineHeight: 1.15,
            letterSpacing: "-0.6px",
            margin: "0 0 10px",
          }}
        >
          {title}
        </h1>
        <p style={{ color: "#6b6b73", fontSize: 14, margin: "0 0 6px" }}>
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
        <p style={{ color: "#3d3d45", fontSize: 16.5, margin: "0 0 34px" }}>
          {intro}
        </p>

        <div>{children}</div>

        <hr
          style={{
            border: 0,
            borderTop: "1px solid #e2ded7",
            margin: "44px 0 18px",
          }}
        />
        <p style={{ fontSize: 14, color: "#6b6b73" }}>
          Questions about this page:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            style={{ color: "#1b1b1f" }}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          . SocialOrk is a social media publishing product: you connect your own
          accounts, and every post is sent to the platform you chose.
        </p>
      </div>
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 20,
        letterSpacing: "-0.2px",
        margin: "34px 0 10px",
        paddingTop: 6,
      }}
    >
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: "0 0 12px", color: "#2a2a31" }}>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: "0 0 14px", paddingLeft: 22, color: "#2a2a31" }}>
      {children}
    </ul>
  );
}

export function LI({ children }: { children: ReactNode }) {
  return <li style={{ marginBottom: 7 }}>{children}</li>;
}

export function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 14.5,
        margin: "0 0 16px",
      }}
    >
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td
              style={{
                borderBottom: "1px solid #eceae4",
                padding: "8px 10px 8px 0",
                color: "#6b6b73",
                verticalAlign: "top",
                width: "38%",
              }}
            >
              {k}
            </td>
            <td
              style={{
                borderBottom: "1px solid #eceae4",
                padding: "8px 0",
                verticalAlign: "top",
              }}
            >
              {v}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
