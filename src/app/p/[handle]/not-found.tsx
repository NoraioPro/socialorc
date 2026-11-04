import Link from "next/link";
import "@/components/portfolio/portfolio-site.css";

export default function PortfolioNotFound() {
  return (
    <main className="pf-public-state">
      <div>
        <div className="pf-public-code">404</div>
        <h1>No portfolio lives at this address</h1>
        <p>The link may have a typo, or its owner changed their address more than 30 days ago.</p>
        <Link href="/register" className="pf-public-cta">Make your own portfolio</Link>
      </div>
    </main>
  );
}
