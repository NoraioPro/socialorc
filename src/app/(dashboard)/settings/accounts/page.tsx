"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Platform } from "@prisma/client";
import { ArrowUpRight, Bell, Check, ChevronDown, CreditCard, Globe2, Link2, Loader2, LockKeyhole, Palette, Save, Settings2, ShieldCheck, SlidersHorizontal, UserRound, UsersRound, Zap } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { OrcMark } from "@/components/icons/orc-mark";
import { platformIcons } from "@/components/icons/platform-icons";
import { PLATFORM_CONFIGS } from "@/types/platform";

type Profile = { name: string | null; email: string | null; timezone: string; role: string };
type PlatformStatus = {
  platform: Platform; configured: boolean; connected: boolean;
  accounts: { id: string; displayName?: string; platformUsername?: string; isActive: boolean }[];
};
const sections = [
  { key: "workspace", target: "workspace", label: "Workspace", icon: Settings2 },
  { key: "team", target: "access", label: "Team", icon: UsersRound },
  { key: "permissions", target: "workflow", label: "Permissions", icon: LockKeyhole },
  { key: "integrations", target: "integrations", label: "Integrations", icon: Link2 },
  { key: "notifications", target: "automation", label: "Notifications", icon: Bell },
  { key: "billing", target: "automation", label: "Billing", icon: CreditCard },
  { key: "brand", target: "brand", label: "Brand", icon: Palette },
  { key: "security", target: "security", label: "Security", icon: ShieldCheck },
];
function Panel({ id, title, subtitle, icon, children, className = "" }: { id: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return <section id={id} className={`settings-panel ${className}`} aria-labelledby={`${id}-title`}>
    <div className="settings-panel-title"><span>{icon}</span><div><h2 id={`${id}-title`}>{title}</h2><p>{subtitle}</p></div></div>{children}
  </section>;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Oslo");
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState("workspace");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const responses = await Promise.all([fetch("/api/settings/profile"), fetch("/api/accounts")]);
      const [profileData, accountData] = await Promise.all(responses.map(r => r.json()));
      if (!responses[0].ok || !responses[1].ok) throw new Error(profileData.error || accountData.error || "Could not load settings.");
      setProfile(profileData.profile); setName(profileData.profile.name || ""); setTimezone(profileData.profile.timezone);
      setPlatforms(accountData.platformStatus || []);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load settings."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const enabled = window.localStorage.getItem("socialorc-motion") !== "off";
    setMotionEnabled(enabled);
    document.documentElement.classList.toggle("motion-paused", !enabled);
  }, []);
  useEffect(() => {
    const error = searchParams.get("error"), success = searchParams.get("success");
    if (error) setMessage({ text: error, error: true });
    else if (success) setMessage({ text: `Connected ${success.replace("_connected", "")}.` });
  }, [searchParams]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/settings/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, timezone }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save profile.");
      setProfile(data.profile); setName(data.profile.name); setMessage({ text: "Profile saved. Your updated name will appear in the account menu after your next sign-in." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save profile.", error: true }); }
    finally { setSaving(false); }
  }
  async function connect(platform: Platform) {
    setBusy(platform); setMessage(null);
    try {
      const res = await fetch(`/api/social/connect?platform=${platform}`), data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message || data.error || "Could not start connection.");
      window.location.assign(data.url);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not connect.", error: true }); }
    finally { setBusy(null); }
  }
  async function disconnect(id: string) {
    if (!window.confirm("Disconnect this social account?")) return;
    setBusy(id); setMessage(null);
    try {
      const res = await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect this account. Please try again.");
      setPlatforms(current => current.map(p => { const accounts = p.accounts.filter(a => a.id !== id); return { ...p, accounts, connected: accounts.some(a => a.isActive) }; }));
      setMessage({ text: "Account disconnected." });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not disconnect.", error: true }); }
    finally { setBusy(null); }
  }
  const connected = platforms.filter(p => p.connected).length;
  const dirty = profile && (name.trim() !== (profile.name || "") || timezone !== profile.timezone);
  const zones = Array.from(new Set([timezone, "Europe/Oslo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC"]));
  function toggleMotion() {
    const enabled = !motionEnabled;
    setMotionEnabled(enabled);
    window.localStorage.setItem("socialorc-motion", enabled ? "on" : "off");
    document.documentElement.classList.toggle("motion-paused", !enabled);
  }

  return <div>
    <Header title="Settings & Control" description="Your workspace, your rules." />
    <div className="studio-page settings-page">
      <div className="studio-banner settings-banner"><div><span className="eyebrow">SYSTEM / WORKSPACE</span><h1>Settings & Control</h1><p>Manage your profile, connected platforms, and publishing workflow.</p></div><span className="settings-banner-motto">CONTROL.<br />SECURITY.<br />AUTOMATION.<strong>ALL IN ONE PLACE.</strong></span></div>
      <nav className="settings-nav" aria-label="Settings sections">{sections.map(({ key, target, label, icon: Icon }) => <a key={key} href={`#${target}`} aria-current={active === key ? "location" : undefined} onClick={() => setActive(key)}><Icon size={15} />{label}</a>)}</nav>
      {message && <div role={message.error ? "alert" : "status"} className={message.error ? "studio-error" : "studio-notice"}>{message.text}</div>}
      {loadError && <div role="alert" className="studio-error">{loadError}<button onClick={load}>Try again</button></div>}
      {loading ? <div className="settings-loading" role="status"><Loader2 className="animate-spin" />Loading your workspace…</div> : !loadError && <>
      <div className="settings-top-grid">
        <Panel id="workspace" title="Workspace Profile" subtitle="Your personal details and scheduling time zone." icon={<Settings2 size={18} />}>
          <form onSubmit={saveProfile} className="settings-profile-form">
            <div className="settings-profile-fields">
              <label>Display name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoComplete="name" /></label>
              <label>Email address<input value={profile?.email || ""} readOnly autoComplete="email" /></label>
              <label>Time zone<select value={timezone} onChange={e => setTimezone(e.target.value)}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
              <p className="settings-note">These settings belong to your signed-in account.</p>
            </div>
            <div className="settings-identity"><div className="settings-logo"><OrcMark className="h-16 w-16" /><span>Social<span>Orc</span></span><small>DOMINATE SOCIAL</small></div><button className="settings-save" disabled={saving || !dirty || !name.trim()} type="submit">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? "Saving…" : "Save Changes"}</button></div>
          </form>
        </Panel>
        <Panel id="brand" title="Brand Kit" subtitle="The visual identity of your command center." icon={<Palette size={18} />}>
          <div className="settings-brand-fields"><div><span>Primary color</span><p><i style={{ background: "#48ed85" }} />#48ED85</p></div><div><span>Accent color</span><p><i style={{ background: "#a855f7" }} />#A855F7</p></div><div><span>Typography</span><p>Geist Sans</p></div><div><span>Button style</span><p>Rounded</p></div></div>
          <div className="settings-brand-preview"><OrcMark className="h-9 w-9" /><strong>Social<span>Orc</span></strong><small>CREATE. AMPLIFY. DOMINATE.</small></div><p className="settings-note">Current app theme · brand customization is not available yet.</p>
        </Panel>
        <Panel id="integrations" title="Connected Platforms" subtitle="Connect and manage your social accounts." icon={<Link2 size={18} />}>
          <div className="settings-platforms">{platforms.map(p => {
            const Icon = platformIcons[p.platform], config = PLATFORM_CONFIGS[p.platform];
            const account = p.accounts.find(a => a.isActive);
            return <details key={p.platform} className="settings-platform"><summary><span className="settings-platform-icon" style={{ color: config.color }}><Icon className="h-5 w-5" /></span><span className="settings-platform-name"><strong>{config.name}</strong><small>{account?.platformUsername ? `@${account.platformUsername}` : account ? account.displayName || "Linked account" : "No active account"}</small></span><span className={`settings-connection ${p.connected ? "is-connected" : ""}`}>{p.connected ? "Connected" : "Not connected"}</span><span className="settings-manage">Manage<ChevronDown size={11} /></span></summary>
              <div className="settings-platform-detail">{!p.configured && <p>Connection setup is required before this platform can be linked.</p>}{p.configured && <button disabled={busy !== null} onClick={() => connect(p.platform)}>{busy === p.platform ? "Connecting…" : `Connect ${config.name}`}<ArrowUpRight size={12} /></button>}
                {p.accounts.map(a => <div className="settings-linked-account" key={a.id}><span>{a.displayName || a.platformUsername || "Linked account"}<small>{a.isActive ? "Active" : "Reconnect required"}</small></span><button disabled={busy !== null} onClick={() => disconnect(a.id)}>{busy === a.id ? "Disconnecting…" : "Disconnect"}</button></div>)}
                {config.notes?.map((note, i) => <p key={i}>{note}</p>)}
              </div></details>;
          })}</div>
        </Panel>
      </div>
      <div className="settings-bottom-grid">
        <Panel id="access" title="Team & Access" subtitle="The account currently in this workspace." icon={<UsersRound size={18} />}>
          <div className="settings-member"><span className="settings-avatar">{(profile?.name || "U").slice(0, 1).toUpperCase()}</span><div><strong>{profile?.name || "Your account"}</strong><small>{profile?.email}</small></div><span className="settings-role">{profile?.role}</span></div>
          <p className="settings-note">Team invitations and shared workspace management are not available yet.</p><Link className="settings-panel-link" href="/dashboard">Open Command Center<ArrowUpRight size={13} /></Link>
        </Panel>
        <Panel id="workflow" title="Approval Rules" subtitle="The active publishing workflow." icon={<Check size={18} />}>
          <div className="settings-rule"><Check size={14} /><div><strong>Review before publishing</strong><p>Manage posts awaiting a decision.</p></div><Link href="/dashboard/approvals">Review<ArrowUpRight size={12} /></Link></div>
          <div className="settings-rule"><Globe2 size={14} /><div><strong>Platform connections</strong><p>Link accounts for each publishing channel.</p></div><span>{connected} linked</span></div>
          <div className="settings-mini-workflow"><span>Draft</span><span>Review</span><span>Approve</span><span>Publish</span></div>
        </Panel>
        <Panel id="security" title="Security" subtitle="Account access and data ownership." icon={<ShieldCheck size={18} />}>
          <div className="settings-security-row"><LockKeyhole size={14} /><span>Account session</span><strong>Signed in</strong></div>
          <div className="settings-security-row"><UserRound size={14} /><span>Social connections</span><strong>Account-owned</strong></div>
          <p className="settings-note">Two-factor authentication, SSO, and session controls are not available in this settings page.</p>
        </Panel>
        <Panel id="automation" title="Automation & Usage" subtitle="Interface preferences and connected channels." icon={<Zap size={18} />}>
          <div className="settings-preference"><div><SlidersHorizontal size={14} /><span><strong>Interface effects</strong><small>Motion, glow, and progress animations</small></span></div><button type="button" role="switch" aria-checked={motionEnabled} onClick={toggleMotion} className="settings-switch"><span /></button></div>
          <div className="settings-usage"><strong>{connected}<span> / {platforms.length}</span></strong><small>platforms connected</small></div><div className="settings-usage-bar"><span style={{ width: `${platforms.length ? connected / platforms.length * 100 : 0}%` }} /></div><p className="settings-note">Connect a platform to start building your publishing network.</p><a href="#integrations" className="settings-panel-link" onClick={() => setActive("integrations")}>Manage connections<ArrowUpRight size={13} /></a>
        </Panel>
      </div>
      <div className="studio-footer"><ShieldCheck size={14} />Your command center. Ready for what comes next.<Link href="/dashboard/create">Forge your next post<ArrowUpRight size={13} /></Link></div>
      </>}
    </div>
  </div>;
}
export default function AccountsPage() { return <Suspense fallback={<div className="settings-loading">Loading settings…</div>}><SettingsContent /></Suspense>; }
