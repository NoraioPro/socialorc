import Link from "next/link";

export function BrandLogo({ href = "/", compact = false, className = "" }: { href?: string; compact?: boolean; className?: string }) {
  return <Link href={href} className={`brand-logo ${compact ? "brand-logo-compact" : ""} ${className}`.trim()} aria-label="SocialOrk home"><img src="/socialork-logo.svg" alt="" aria-hidden="true" /><span>Social<span>Ork</span></span></Link>;
}
