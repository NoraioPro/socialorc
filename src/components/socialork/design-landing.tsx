"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";
import { Hero3D } from "@/components/socialork/hero-3d";
import { Tilt } from "@/components/socialork/landing-motion";

function Mark({ name, size = 13 }: { name: GlyphName; size?: number }) {
  return (
    <span className="lp-mark" aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d={GLYPHS[name]} />
      </svg>
    </span>
  );
}

const STEPS = [
  ["01", "Write the brief", "Say what you're announcing and who it's for. The brand's brain supplies voice, audience and words to avoid."],
  ["02", "Get a draft per channel", "Generated on your own AI key, or written by hand. Each draft respects its channel's length and media rules."],
  ["03", "Approve", "A manager who didn't write the post approves it or sends it back with a note. Editing clears the approval."],
  ["04", "Schedule and publish", "Drag it onto the week. Failures are retried when it's safe and explained in plain language when it isn't."],
];

const CHANNELS: { name: string; glyph: GlyphName; text: string }[] = [
  { name: "LinkedIn", glyph: "linkedin", text: "Profiles and company pages. Text and images." },
  { name: "X", glyph: "x", text: "Posts and threads. Mentions and replies in the inbox." },
  { name: "Instagram", glyph: "instagram", text: "Business accounts. Every post needs an image or video." },
  { name: "Facebook", glyph: "facebook", text: "Pages. Comments and messages, with replies." },
  { name: "YouTube", glyph: "youtube", text: "Video uploads. Comments are readable in the inbox." },
  { name: "TikTok", glyph: "tiktok", text: "Video only. Posts stay private until TikTok's app audit passes." },
  { name: "Telegram", glyph: "telegram", text: "Channels through a bot token. Messages in the inbox." },
];

const WORDS = ["Nothing", "goes", "out", "without", "a", "yes."];

export function DesignLanding() {
  const router = useRouter();
  const request = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    router.push(email ? `/register?email=${encodeURIComponent(email)}` : "/register");
  };

  return (
    <div className="lp-site">
      <header className="lp-header">
        <div className="lp-wrap lp-header-row">
          <Link href="#top" className="lp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socialork/orc-logo.png" alt="" width={32} height={32} />
            SocialOrk
          </Link>
          <nav className="lp-nav" aria-label="Page">
            <a href="#how">How it works</a>
            <a href="#approvals">Approvals</a>
            <a href="#channels">Channels</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <Link href="/signin" className="lp-signin">Sign in</Link>
          <a href="#access" className="lp-cta">Request access</a>
        </div>
      </header>

      <section id="top" className="lp-wrap lp-hero">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span className="lp-kicker lp-up">SOCIAL PUBLISHING FOR TEAMS AND AGENCIES</span>
          <h1 className="lp-h1">
            {WORDS.map((word, i) => (
              <span key={word} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>{word}</span>
            ))}
          </h1>
          <p className="lp-lead lp-up" style={{ animationDelay: "0.16s" }}>
            Write once, get a draft for each channel, approve it, and publish to seven networks from one calendar. Every post carries a record of who approved it and when.
          </p>
          <div className="lp-actions lp-up" style={{ animationDelay: "0.24s" }}>
            <a href="#access" className="lp-btn lp-btn-primary">Request access</a>
            <Link href="/signin" className="lp-btn lp-btn-ghost">Open the product</Link>
          </div>
          <span className="lp-note lp-up" style={{ animationDelay: "0.3s" }}>
            Invite-only. Each workspace starts with one admin who decides who can approve.
          </span>
        </div>

        <div className="lp-stage">
          <div className="lp-glow" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-warrior" src="/socialork/orc-warrior.png" alt="" />
          <Tilt>
            <div className="lp-card">
              <div className="lp-card-head">
                <Mark name="x" />
                <span style={{ fontSize: 13, color: "var(--lp-text2)" }}>X · @fjordco</span>
                <span style={{ flex: 1 }} />
                <span className="lp-pill-swap">
                  <span className="lp-pill-a">In review</span>
                  <span className="lp-pill-b">Approved</span>
                </span>
              </div>
              <div className="lp-card-body">
                <div style={{ fontSize: 16, fontWeight: 600 }}>Behind the scenes: how drafts get reviewed</div>
                <div className="lp-quote">Our pipeline in one line: brief → draft → human review → schedule → publish. The gate in the middle is the product.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="lp-check"><span style={{ color: "oklch(0.8 0.15 155)" }}>✓</span><span style={{ flex: 1 }}>Within X character limit</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>142 / 280</span></div>
                  <div className="lp-check"><span style={{ color: "oklch(0.8 0.15 155)" }}>✓</span><span style={{ flex: 1 }}>Account connected</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>@fjordco</span></div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 6, borderTop: "1px solid var(--lp-line)" }}>
                  <span className="lp-changes">Request changes</span>
                  <span className="lp-approve">Approve</span>
                </div>
              </div>
              <div className="lp-card-foot">
                <div className="lp-audit" style={{ animation: "lp-row .5s cubic-bezier(.2,.7,.2,1) 1.15s both" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--lp-text3)" }} />
                  <span style={{ flex: 1, color: "var(--lp-text2)" }}>Submitted · Sara Haugen, Editor</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: "var(--lp-text3)" }}>13:02 · 46.212.9.88</span>
                </div>
                <div className="lp-audit" style={{ animation: "lp-row .5s cubic-bezier(.2,.7,.2,1) 1.4s both" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.8 0.15 155)" }} />
                  <span style={{ flex: 1, color: "var(--lp-text2)" }}>Approved · Marcus Lie, Manager</span>
                  <span className="lp-mono" style={{ fontSize: 11, color: "var(--lp-text3)" }}>14:21 · 84.208.41.7</span>
                </div>
              </div>
            </div>
          </Tilt>
        </div>
      </section>

      <section className="lp-conquest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socialork/orc-warrior.png" alt="" />
        <div className="lp-wrap" style={{ padding: "110px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="lp-mono" style={{ fontSize: 12, letterSpacing: "0.08em", color: "var(--lp-accent)" }}>CREATE · APPROVE · PUBLISH</span>
          <h2 style={{ margin: 0, fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 1, fontWeight: 600, letterSpacing: "-0.035em" }}>
            Good content<br /><span style={{ color: "var(--lp-accent)" }}>conquers.</span>
          </h2>
          <p style={{ margin: 0, maxWidth: 440, fontSize: 16, color: "#b4b4be", lineHeight: 1.6 }}>
            Command your content. Build your audience. Bring every channel together with AI at your side.
          </p>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--lp-text2)" }}>Your voice. Your approval. Always.</span>
        </div>
      </section>

      <section id="how" className="lp-section">
        <div className="lp-wrap lp-block">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
            <span className="lp-kicker" style={{ color: "var(--lp-accent)" }}>HOW IT WORKS</span>
            <h2 className="lp-h2">One brief. Seven channels. One approval each.</h2>
          </div>
          <div className="lp-steps">
            {STEPS.map(([n, title, body]) => (
              <article key={n}>
                <span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="approvals" className="lp-section">
        <div className="lp-wrap lp-split">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <span className="lp-kicker" style={{ color: "var(--lp-accent)" }}>APPROVALS AND AUDIT</span>
            <h2 className="lp-h2">When a client asks who approved it, answer in one screen.</h2>
            <p style={{ margin: 0, color: "var(--lp-text2)", fontSize: 16 }}>
              Approval is enforced in the product, not agreed in a chat thread. Scheduling and publish-now both check the same rule, and every decision lands in an append-only trail with the person, the time and the IP address.
            </p>
          </div>
          <div className="lp-table">
            <div className="lp-row head"><span>Time</span><span>Event</span><span>IP</span></div>
            <div className="lp-row"><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text2)" }}>29 Oct 14:21</span><span><span style={{ color: "oklch(0.8 0.15 155)" }}>Approved</span> · Marcus Lie</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>84.208.41.7</span></div>
            <div className="lp-row"><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text2)" }}>29 Oct 14:24</span><span>Scheduled for Fri 09:00 · Marcus Lie</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>84.208.41.7</span></div>
            <div className="lp-row"><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text2)" }}>29 Oct 15:10</span><span>Rescheduled to Fri 10:00 · approval kept</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>85.164.22.10</span></div>
            <div className="lp-row"><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text2)" }}>30 Oct 10:00</span><span><span style={{ color: "oklch(0.78 0.11 245)" }}>Published</span> · System</span><span className="lp-mono" style={{ fontSize: 12, color: "var(--lp-text3)" }}>worker</span></div>
          </div>
        </div>
      </section>

      <section id="channels" className="lp-section">
        <div className="lp-wrap lp-channels">
          <div className="lp-channel-top">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
              <span className="lp-kicker" style={{ color: "var(--lp-accent)" }}>CHANNELS</span>
              <h2 className="lp-h2">Seven networks, each with its rules spelled out.</h2>
              <p style={{ margin: 0, color: "var(--lp-text2)", fontSize: 16 }}>Every platform sets its own limits. We show them instead of hiding them, so nothing fails by surprise.</p>
            </div>
            <div className="lp-object"><Hero3D /></div>
          </div>
          <div className="lp-grid">
            {CHANNELS.map((channel) => (
              <article key={channel.name} className="lp-ch">
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Mark name={channel.glyph} />
                  <h3>{channel.name}</h3>
                </span>
                <p>{channel.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="lp-section">
        <div className="lp-wrap lp-block">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
            <span className="lp-kicker" style={{ color: "var(--lp-accent)" }}>PRICING</span>
            <h2 className="lp-h2">Priced per workspace. Reviewers are free.</h2>
          </div>
          <div className="lp-plans">
            <article className="lp-plan featured">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>Team</span>
                <span><span className="lp-price">NOK 1,490</span><span style={{ color: "var(--lp-text3)", fontSize: 13 }}> / month</span></span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--lp-text2)" }}>
                <span>Up to 5 brains and 15 members</span>
                <span>All seven channels</span>
                <span>Approvals, audit trail and client review links</span>
                <span>Bring your own AI key</span>
              </div>
              <a href="#access" className="lp-btn lp-btn-primary">Request access</a>
            </article>
            <article className="lp-plan">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>Enterprise</span>
                <span style={{ color: "var(--lp-text2)" }}>Talk to us</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, color: "var(--lp-text2)" }}>
                <span>Unlimited brains and members</span>
                <span>SSO with SAML or Google Workspace</span>
                <span>Data retention and export controls</span>
                <span>Run generation on your own hardware</span>
              </div>
              <a href="#access" className="lp-btn lp-btn-ghost">Contact sales</a>
            </article>
          </div>
        </div>
      </section>

      <section id="access" className="lp-access">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socialork/orc-banner.png" alt="" />
        <div className="lp-wrap lp-access-inner">
          <h2 className="lp-h2" style={{ fontSize: "clamp(32px, 4.5vw, 52px)", maxWidth: 720 }}>Get your team on one calendar.</h2>
          <p style={{ margin: 0, color: "var(--lp-text2)", fontSize: 16, maxWidth: 520 }}>
            We onboard a small number of workspaces each month. Tell us about your team and we&apos;ll send the admin invite.
          </p>
          <form className="lp-form" onSubmit={request}>
            <input name="email" type="email" required placeholder="you@company.com" aria-label="Work email" />
            <button className="lp-btn lp-btn-primary" type="submit">Request access</button>
          </form>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--lp-text2)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socialork/orc-logo.png" alt="" width={24} height={24} style={{ borderRadius: 8 }} />
            SocialOrk
          </span>
          <span style={{ flex: 1 }} />
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <span>© {new Date().getFullYear()} SocialOrk</span>
        </div>
      </footer>
    </div>
  );
}
