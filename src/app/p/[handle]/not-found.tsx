import Link from "next/link";

/**
 * The two public "not here" states, deliberately indistinguishable:
 * an unknown handle and an unpublished portfolio answer the same way, so the
 * page never confirms that a private draft exists.
 */
export default function PortfolioNotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#131317",
        color: "#ededf1",
        fontFamily: "var(--font-hanken), system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center", display: "grid", gap: 10 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>This portfolio isn’t available</h1>
        <p style={{ color: "#a6a6b0", fontSize: 14, margin: 0 }}>
          The link may be wrong, or the portfolio hasn’t been published yet.
        </p>
        <Link href="/" style={{ color: "#48ed85", fontSize: 14, marginTop: 8 }}>
          Go to SocialOrk
        </Link>
      </div>
    </main>
  );
}
