import { portfolioFontVars } from "@/components/portfolio/fonts";
import "@/components/portfolio/portfolio-site.css";

/** Public portfolio pages: outside the app shell, so they bring their own fonts. */
export default function PublicPortfolioLayout({ children }: { children: React.ReactNode }) {
  return <div className={portfolioFontVars}>{children}</div>;
}
