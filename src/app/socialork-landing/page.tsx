import Image from "next/image";
import { Hero3D } from "@/components/socialork/hero-3d";
import { Reveal, Tilt } from "@/components/socialork/landing-motion";
import { GLYPHS, type GlyphName } from "@/components/socialork/platform-glyphs";

const HEADLINE = ["Nothing", "goes", "out", "without", "a", "yes."];

const STEPS = [
  ["01", "Write the brief", "Say what you're announcing and who it's for. The brand's brain supplies voice, audience and words to avoid."],
  ["02", "Get a draft per channel", "Generated on your own AI key, or written by hand. Each draft respects its channel's length and media rules."],
  ["03", "Approve", "A manager who didn't write the post approves it or sends it back with a note. Editing clears the approval."],
  ["04", "Schedule and publish", "Drag it onto the week. Failures are retried when it's safe and explained in plain language when it isn't."],
];

const TRAIL = [
  ["29 Oct 14:21", "Approved", "Marcus Lie", "84.208.41.7", true],
  ["29 Oct 14:24", "Scheduled for Fri 09:00", "Marcus Lie", "84.208.41.7", false],
  ["29 Oct 15:10", "Rescheduled to Fri 10:00 · approval kept", "", "85.164.22.10", false],
  ["30 Oct 10:00", "Published", "System · worker", "worker", false],
] as const;

const CHANNELS: { name: string; glyph: GlyphName; line: string }[] = [
  { name: "LinkedIn", glyph: "linkedin", line: "Profiles and company pages. Text and images." },
  { name: "X", glyph: "x", line: "Posts and threads. Mentions and replies in the inbox." },
  { name: "Instagram", glyph: "instagram", line: "Business accounts. Every post needs an image or video." },
  { name: "Facebook", glyph: "facebook", line: "Pages. Comments and messages, with replies." },
  { name: "YouTube", glyph: "youtube", line: "Video uploads. Comments are readable in the inbox." },
  { name: "TikTok", glyph: "tiktok", line: "Video only. Posts stay private until TikTok's app audit passes." },
  { name: "Telegram", glyph: "telegram", line: "Channels through a bot token. Messages in the inbox." },
];

function Glyph({ name, size = 13 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

export default function SocialOrkLanding() {
  return (
    <main className="lp">
      <header className="lp-header">
        <div className="lp-wrap lp-header-in">
          <a href="#top" className="lp-brand">
            <Image src="/socialork/orc-logo.png" alt="SocialOrk" width={32} height={32} priority />
            <b>SocialOrk</b>
          </a>
          <nav className="lp-nav">
            <a href="#how">How it works</a>
            <a href="#approvals">Approvals</a>
            <a href="#channels">Channels</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <a href="/login" className="lp-signin">Sign in</a>
          <a href="#access" className="lp-cta">Request access</a>
        </div>
      </header>

      <section id="top" className="lp-wrap lp-hero">
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span className="lp-eyebrow">SOCIAL PUBLISHING FOR TEAMS AND AGENCIES</span>
          <h1 className="lp-h1">
            {HEADLINE.map((word, i) => (
              <span key={word + i} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                {word}
              </span>
            )).flatMap((node, i, all) => (i < all.length - 1 ? [node, " "] : [node]))}
          </h1>
          <p className="lp-lead" style={{ animation: "lp-up .7s cubic-bezier(.2,.7,.2,1) .16s both" }}>
            Write once, get a draft for each channel, approve it, and publish to seven networks from
            one calendar. Every post carries a record of who approved it and when.
          </p>
          <div className="lp-actions" style={{ animation: "lp-up .7s cubic-bezier(.2,.7,.2,1) .24s both" }}>
            <a href="#access" className="lp-btn lp-btn-primary">Request access</a>
            <a href="/socialork/overview" className="lp-btn lp-btn-ghost">Open the product</a>
          </div>
          <span className="lp-fine" style={{ animation: "lp-up .7s cubic-bezier(.2,.7,.2,1) .3s both" }}>
            Invite-only. Each workspace starts with one admin who decides who can approve.
          </span>
        </div>

        <div className="lp-stage-wrap">
          <Image
            src="/socialork/orc-head.png"
            alt=""
            width={460}
            height={494}
            className="lp-head-img"
            aria-hidden="true"
            priority
          />
          <Tilt>
            <div className="lp-postcard">
              <div className="lp-postcard-top">
                <span className="lp-plat"><Glyph name="x" size={12} /></span>
                <span style={{ fontSize: 13, color: "#a6a6b0" }}>X · @fjordco</span>
                <span className="lp-badge-stack">
                  <span className="lp-badge-review">In review</span>
                  <span className="lp-badge-approved">Approved</span>
                </span>
              </div>
              <div className="lp-postcard-body">
                <div style={{ fontSize: 16, fontWeight: 600 }}>Behind the scenes: how drafts get reviewed</div>
                <div className="lp-quote">
                  Our pipeline in one line: brief → draft → human review → schedule → publish. The
                  gate in the middle is the product.
                </div>
                <div className="lp-checks">
                  <div className="lp-check">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.8 0.15 155)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                    <span>Within X character limit</span><b>142 / 280</b>
                  </div>
                  <div className="lp-check">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="oklch(0.8 0.15 155)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                    <span>Account connected</span><b>@fjordco</b>
                  </div>
                </div>
                <div className="lp-card-actions">
                  <span className="lp-chip">Request changes</span>
                  <span className="lp-approve">Approve</span>
                </div>
              </div>
              <div className="lp-trail">
                <div className="lp-trail-row" style={{ animationDelay: "1.15s" }}>
                  <i /> <span>Submitted · Sara Haugen, Editor</span> <time>13:02 · 46.212.9.88</time>
                </div>
                <div className="lp-trail-row" style={{ animationDelay: "1.4s" }}>
                  <i style={{ background: "oklch(0.8 0.15 155)" }} /> <span>Approved · Marcus Lie, Manager</span>
                  <time>14:21 · 84.208.41.7</time>
                </div>
              </div>
            </div>
          </Tilt>
        </div>
      </section>

      <section id="how" className="lp-section">
        <Reveal>
          <div className="lp-wrap lp-section-in">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
              <span className="lp-kicker">HOW IT WORKS</span>
              <h2 className="lp-h2">One brief. Seven channels. One approval each.</h2>
            </div>
            <svg width="100%" height="2" style={{ display: "block", overflow: "visible", marginBottom: -20 }} aria-hidden="true">
              <line x1="0" y1="1" x2="100%" y2="1" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
              <line x1="0" y1="1" x2="100%" y2="1" stroke="#48ed85" strokeWidth="1.5" strokeDasharray="4 20" strokeLinecap="round" style={{ animation: "so-dash 1.6s linear infinite" }} />
            </svg>
            <div className="lp-steps">
              {STEPS.map(([num, title, body]) => (
                <div key={num} className="lp-step">
                  <span className="lp-step-num">{num}</span>
                  <b>{title}</b>
                  <span>{body}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section id="approvals" className="lp-section">
        <Reveal>
          <div className="lp-wrap lp-section-in">
            <div className="lp-two" style={{ padding: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <span className="lp-kicker">APPROVALS AND AUDIT</span>
                <h2 className="lp-h2">When a client asks who approved it, answer in one screen.</h2>
                <p className="lp-body">
                  Approval is enforced in the product, not agreed in a chat thread. Scheduling and
                  publish-now both check the same rule, and every decision lands in an append-only
                  trail with the person, the time and the IP address.
                </p>
                <div className="lp-bullets">
                  <div className="lp-bullet"><i /><span>Nobody approves their own post, admins included.</span></div>
                  <div className="lp-bullet"><i /><span>Clients review through a signed link, without an account.</span></div>
                  <div className="lp-bullet"><i /><span>Rescheduling keeps the approval. Editing the post doesn&apos;t.</span></div>
                </div>
              </div>
              <div className="lp-trail-card">
                <div className="lp-trail-head"><span>Time</span><span>Event</span><span>IP</span></div>
                {TRAIL.map(([time, event, who, ip, ok]) => (
                  <div key={time} className="lp-trail-line">
                    <span className="lp-mono">{time}</span>
                    <span>
                      {ok ? <span className="lp-ok">{event}</span> : event === "Published" ? <span className="lp-info">{event}</span> : event}
                      {who ? ` · ${who}` : ""}
                    </span>
                    <span className="lp-mono">{ip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="channels" className="lp-section">
        <Reveal>
          <div className="lp-wrap lp-section-in">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560 }}>
                <span className="lp-kicker">CHANNELS</span>
                <h2 className="lp-h2">Seven networks, each with its rules spelled out.</h2>
                <p className="lp-body">
                  Every platform sets its own limits. We show them instead of hiding them, so nothing
                  fails by surprise.
                </p>
              </div>
              <div
                style={{
                  position: "relative", width: "min(100%, 480px)", aspectRatio: "1 / 0.82", flex: "none",
                  background: "radial-gradient(closest-side, rgba(72,237,133,0.12), transparent 70%)",
                  borderRadius: 24,
                }}
              >
                <Hero3D />
              </div>
            </div>
            <div className="lp-channels">
              {CHANNELS.map((c) => (
                <div key={c.name} className="lp-channel">
                  <span className="lp-channel-top">
                    <span className="lp-channel-icon"><Glyph name={c.glyph} /></span>
                    {c.name}
                  </span>
                  <p>{c.line}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section id="pricing" className="lp-section">
        <Reveal>
          <div className="lp-wrap lp-section-in">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
              <span className="lp-kicker">PRICING</span>
              <h2 className="lp-h2">Priced per workspace. Reviewers are free.</h2>
            </div>
            <div className="lp-pricing">
              <div className="lp-plan" data-featured="true">
                <div className="lp-plan-head">
                  <span className="lp-plan-name">Team</span>
                  <span className="lp-price">NOK 1,490 <small>/ month</small></span>
                </div>
                <ul>
                  <li>Up to 5 brains and 15 members</li>
                  <li>All seven channels</li>
                  <li>Approvals, audit trail and client review links</li>
                  <li>Bring your own AI key</li>
                </ul>
                <a href="#access" className="lp-btn lp-btn-primary">Request access</a>
              </div>
              <div className="lp-plan">
                <div className="lp-plan-head">
                  <span className="lp-plan-name">Enterprise</span>
                  <span style={{ color: "#a6a6b0" }}>Talk to us</span>
                </div>
                <ul>
                  <li>Unlimited brains and members</li>
                  <li>SSO with SAML or Google Workspace</li>
                  <li>Data retention and export controls</li>
                  <li>Run generation on your own hardware</li>
                </ul>
                <a href="#access" className="lp-btn lp-btn-ghost">Contact sales</a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="access" className="lp-access">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/socialork/orc-banner.png" alt="" className="lp-access-bg" aria-hidden="true" />
        <div className="lp-wrap lp-access-in">
          <h2>Get your team on one calendar.</h2>
          <p className="lp-body" style={{ maxWidth: 520 }}>
            We onboard a small number of workspaces each month. Tell us about your team and we&apos;ll
            send the admin invite.
          </p>
          <form className="lp-form" action="/socialork-landing" method="get">
            <input className="lp-input" type="email" name="email" placeholder="you@company.com" aria-label="Work email" />
            <button className="lp-submit" type="submit">Request access</button>
          </form>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#a6a6b0" }}>
            <Image src="/socialork/orc-logo.png" alt="SocialOrk" width={24} height={24} />
            SocialOrk
          </span>
          <span style={{ flex: 1 }} />
          <span className="lp-footer-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </span>
          <span>© 2026 SocialOrk</span>
        </div>
      </footer>
    </main>
  );
}
