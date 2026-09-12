import Link from "next/link";
import { OrcMark } from "@/components/icons/orc-mark";
import { ArrowRight, ArrowUpRight, CalendarDays, Layers3, Sparkles, ShieldCheck } from "lucide-react";
import { LinkedInIcon, TwitterIcon, InstagramIcon, FacebookIcon, YouTubeIcon, TikTokIcon } from "@/components/icons/platform-icons";

const platforms = [
  { name: "Instagram", Icon: InstagramIcon }, { name: "LinkedIn", Icon: LinkedInIcon },
  { name: "TikTok", Icon: TikTokIcon }, { name: "YouTube", Icon: YouTubeIcon },
  { name: "Facebook", Icon: FacebookIcon }, { name: "X / Twitter", Icon: TwitterIcon },
];
const steps = [
  { number: "01", Icon: Sparkles, title: "Start with a spark.", text: "Turn one idea into drafts tailored to each platform. Let AI help you find the words." },
  { number: "02", Icon: ShieldCheck, title: "Make it yours.", text: "Fine-tune your message and approve every post. Your voice. Your final say." },
  { number: "03", Icon: CalendarDays, title: "Find your rhythm.", text: "Choose when to publish and keep your content moving, across all your channels." },
];

export default function HomePage() {
  return (
    <div className="landing">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header site-width">
        <Link href="/" className="brand"><span className="brand-mark"><OrcMark className="h-9 w-8" /></span>SocialOrc<span className="brand-dot">.</span></Link>
        <nav aria-label="Main navigation" className="site-nav"><a href="#how-it-works">How it works</a><a href="#platforms">Platforms</a></nav>
        <div className="header-actions"><Link href="/login" className="sign-in">Sign in</Link><Link href="/register" className="cta cta-small">Get started <ArrowUpRight size={16} /></Link></div>
      </header>
      <main id="main-content">
        <section className="hero site-width">
          <div className="hero-copy">
            <div className="eyebrow"><span className="status-dot" /> STRATEGY. CREATIVITY. GROWTH.</div>
            <h1>Forge content.<br />Command your<br /><span>social empire.</span></h1>
            <p className="hero-description">Your command center for AI-powered content. Draft with purpose, approve with confidence, and schedule across your social channels.</p>
            <div className="hero-actions"><Link href="/dashboard" className="cta">Enter the command center <ArrowRight size={18} /></Link><a href="#how-it-works" className="text-link">See how it works <ArrowDownIcon /></a></div>
            <p className="hero-note"><ShieldCheck size={15} /> Nothing goes live without your approval.</p>
          </div>
          <div className="orc-hero" role="img" aria-label="Orc commander overlooking a dark emerald mountain citadel">
            <div className="orc-hero-content"><span>SocialOrc intelligence</span><h2>Good content conquers.</h2><p>Your strategy. Your voice. AI at your side.<br />Nothing publishes without your approval.</p></div>
          </div>        </section>
        <section id="platforms" className="platform-section site-width"><p>ALL YOUR FAVORITE CHANNELS, FINALLY TOGETHER</p><div className="platform-list">{platforms.map(({name, Icon}) => <div key={name}><Icon className="h-5 w-5" /><span>{name}</span></div>)}</div></section>
        <section id="how-it-works" className="workflow site-width"><div className="section-heading"><div><span className="eyebrow">FROM FIRST THOUGHT TO FEED</span><h2>Your content.<br />A stronger strategy.</h2></div><p>Less tab-hopping. More making.<br />Give your content a place to come together.</p></div><div className="workflow-grid">{steps.map(({number, Icon, title, text}) => <article key={number}><div className="step-top"><Icon size={23} /><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
        <section className="closing site-width"><div><span className="eyebrow">MAKE ROOM FOR YOUR NEXT BIG IDEA</span><h2>Your next campaign<br />starts here.</h2></div><Link href="/register" className="cta cta-light">Forge your first post <ArrowUpRight size={18} /></Link></section>
      </main>
      <footer className="site-footer site-width"><Link href="/" className="brand"><Layers3 size={20} /> SocialOrc.</Link><p>Thoughtfully planned. Confidently published.</p><span>© {new Date().getFullYear()} SocialOrc</span></footer>
    </div>
  );
}
function ArrowDownIcon() { return <ArrowRight size={16} className="rotate-90" />; }
