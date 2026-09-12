import Link from "next/link";
import { OrcMark } from "@/components/icons/orc-mark";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="auth-layout">
    <section className="auth-story">
      <Link href="/" className="brand"><OrcMark className="h-10 w-9 text-primary" /> SocialOrc.</Link>
      <div><h1>Good content<br /><span>conquers.</span></h1><p>Command your content. Build your audience. Bring every channel together with AI at your side.</p></div>
      <small className="flex items-center gap-2"><ShieldCheck size={17} /> Your voice. Your approval. Always.</small>
    </section>
    <section className="auth-form" aria-label="Account access"><div>{children}</div></section>
  </main>;
}
