import { Suspense } from "react";
import { SignInForm } from "@/components/socialork/signin-form";

export const metadata = { title: "Sign in · SocialOrk" };

export default function SignInPage() {
  return (
    <main className="so-signin">
      <aside className="so-signin-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socialork-logo.svg" alt="" width={64} height={58} />
        <div style={{ display: "grid", gap: 14 }}>
          <span className="so-mono" style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--accent)" }}>
            SOCIALORK
          </span>
          <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.04, letterSpacing: "-0.035em", fontWeight: 600 }}>
            Nothing goes out
            <br />
            without a yes.
          </h1>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: 14, lineHeight: 1.6, maxWidth: 380 }}>
            Plan, approve and publish across seven channels from one calendar, with a record of who
            approved every post.
          </p>
        </div>
        <div className="so-mono" style={{ fontSize: 11, color: "var(--text3)" }}>
          Invite-only. Ask your workspace admin for access.
        </div>
      </aside>

      <section className="so-signin-form">
        <Suspense fallback={<div className="so-signin-card" style={{ color: "var(--text3)" }}>Loading…</div>}>
          <SignInForm />
        </Suspense>
      </section>
    </main>
  );
}
